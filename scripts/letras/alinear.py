#!/usr/bin/env python3
"""Genera letras sincronizadas (.lrc) para las canciones de Sonaura.

Lee la letra que Suno guarda en la etiqueta ID3 de cada MP3, la alinea con el
audio (alineación forzada con stable-ts sobre Whisper) y escribe un
``<nombre del MP3>.lrc`` por canción. Ver README.md en esta carpeta.
"""
from __future__ import annotations

import argparse
import difflib
import io
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import warnings
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

DRIVE_RAIZ = "1Bj2CW9jD-rbQwdVeB7ZEOkkI9obYZBMw"
REPO = Path(__file__).resolve().parents[2]
SALIDA_DEFECTO = REPO / "letras"
BASE_LOCAL = Path(os.environ.get("LOCALAPPDATA") or Path.home() / ".cache") / "sonaura-letras"
CACHE_DEFECTO = BASE_LOCAL / "cache"
MODELO_DEFECTO = "large-v3-turbo"
MAX_CARACTERES = 72  # un verso más largo se parte en frases (letras escritas en párrafo)
AGENTE = "Mozilla/5.0 (sonaura-letras)"


# ---------------------------------------------------------------------------
# Canciones: Drive o carpeta local
# ---------------------------------------------------------------------------

@dataclass
class Cancion:
    nombre: str              # nombre del archivo, con extensión
    carpeta: str             # ruta relativa (álbum) dentro del origen; "" en la raíz
    ruta: Path | None = None  # MP3 local (o en caché, ya descargado)
    drive_id: str | None = None

    @property
    def base(self) -> str:
        return Path(self.nombre).stem

    @property
    def etiqueta(self) -> str:
        return f"{self.carpeta}/{self.nombre}" if self.carpeta else self.nombre


class _ListadoDrive(HTMLParser):
    """Lee el HTML de drive.google.com/embeddedfolderview (sin clave de API)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.entradas: list[dict] = []
        self._actual: dict | None = None
        self._profundidad = 0
        self._titulo_en: int | None = None

    def handle_starttag(self, tag, attrs):
        a = {k: v or "" for k, v in attrs}
        if tag == "div":
            clases = a.get("class", "").split()
            if self._actual is None:
                m = re.fullmatch(r"entry-([A-Za-z0-9_-]+)", a.get("id", ""))
                if "flip-entry" in clases and m:
                    self._actual = {"id": m.group(1), "nombre": "", "tipo": None}
                    self._profundidad = 1
                return
            self._profundidad += 1
            if "flip-entry-title" in clases:
                self._titulo_en = self._profundidad
        elif tag == "a" and self._actual is not None and self._actual["tipo"] is None:
            href, fid = a.get("href", ""), re.escape(self._actual["id"])
            if re.search(rf"/folders/{fid}(?:[/?#]|$)", href):
                self._actual["tipo"] = "carpeta"
            elif re.search(rf"/file/d/{fid}(?:[/?#]|$)", href):
                self._actual["tipo"] = "archivo"

    def handle_endtag(self, tag):
        if tag != "div" or self._actual is None:
            return
        if self._titulo_en == self._profundidad:
            self._titulo_en = None
        self._profundidad -= 1
        if self._profundidad == 0:
            self._actual["nombre"] = self._actual["nombre"].strip()
            self.entradas.append(self._actual)
            self._actual = None

    def handle_data(self, data):
        if self._actual is not None and self._titulo_en is not None:
            self._actual["nombre"] += data


def _pedir(url: str, rango: tuple[int, int] | None = None):
    req = urllib.request.Request(url, headers={"User-Agent": AGENTE})
    if rango:
        req.add_header("Range", f"bytes={rango[0]}-{rango[1]}")
    for intento in range(4):
        try:
            return urllib.request.urlopen(req, timeout=120)
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503) or intento == 3:
                raise
        except urllib.error.URLError:
            if intento == 3:
                raise
        time.sleep(2 * (intento + 1))


def listar_drive(carpeta_id: str, ruta: str = "") -> list[Cancion]:
    with _pedir(f"https://drive.google.com/embeddedfolderview?id={carpeta_id}") as r:
        html = r.read().decode("utf-8", errors="replace")
    lector = _ListadoDrive()
    lector.feed(html)
    if "flip-entries" not in html:
        raise RuntimeError(f"La carpeta de Drive {carpeta_id} no es pública o no existe.")
    canciones: list[Cancion] = []
    for e in sorted(lector.entradas, key=lambda e: e["nombre"].casefold()):
        if e["tipo"] == "carpeta":
            canciones += listar_drive(e["id"], f"{ruta}/{e['nombre']}" if ruta else e["nombre"])
        elif e["nombre"].lower().endswith(".mp3"):
            canciones.append(Cancion(e["nombre"], ruta, drive_id=e["id"]))
    return canciones


def listar_local(carpeta: Path) -> list[Cancion]:
    canciones = []
    for mp3 in sorted(carpeta.rglob("*"), key=lambda p: str(p).casefold()):
        if mp3.is_file() and mp3.suffix.lower() == ".mp3":
            rel = mp3.parent.relative_to(carpeta).as_posix()
            canciones.append(Cancion(mp3.name, "" if rel == "." else rel, ruta=mp3))
    return canciones


def _url_descarga(file_id: str) -> str:
    return f"https://drive.usercontent.google.com/download?id={file_id}&export=download"


def _cuerpo_drive(file_id: str, rango: tuple[int, int] | None = None) -> tuple[bytes, int | None]:
    """Descarga (un trozo de) un archivo de Drive; devuelve bytes y tamaño total si se conoce."""
    r = _pedir(_url_descarga(file_id), rango)
    with r:
        if "text/html" in (r.headers.get("Content-Type") or ""):
            # Página de confirmación (archivos grandes): reintenta con confirm/uuid.
            pagina = r.read().decode("utf-8", errors="replace")
            campos = dict(re.findall(r'name="(confirm|uuid|at)" value="([^"]*)"', pagina))
            if not campos:
                raise RuntimeError(f"Drive no devolvió el archivo {file_id} (¿es público?).")
            url = _url_descarga(file_id) + "&" + urllib.parse.urlencode(campos)
            r = _pedir(url, rango)
        total = None
        m = re.search(r"/(\d+)$", r.headers.get("Content-Range") or "")
        if m:
            total = int(m.group(1))
        elif r.status == 200 and r.headers.get("Content-Length"):
            total = int(r.headers["Content-Length"])
        return r.read(), total


def etiqueta_remota(cancion: Cancion, cache: Path) -> bytes:
    """Lee solo la cabecera ID3 del MP3 en Drive (petición con Range)."""
    destino = cache / f"{cancion.drive_id}.mp3"
    inicio, total = _cuerpo_drive(cancion.drive_id, (0, 9))
    if destino.exists() and total and destino.stat().st_size == total:
        cancion.ruta = destino
        return destino.read_bytes()[:16 << 20]
    if len(inicio) > 10:  # el servidor ignoró Range: ya está el archivo entero
        cache.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(inicio)
        cancion.ruta = destino
        return inicio
    if inicio[:3] != b"ID3":
        return b""
    t = inicio[6:10]
    tam = 10 + ((t[0] << 21) | (t[1] << 14) | (t[2] << 7) | t[3]) + (10 if inicio[5] & 0x10 else 0)
    datos, _ = _cuerpo_drive(cancion.drive_id, (0, tam - 1))
    return datos


def descargar(cancion: Cancion, cache: Path) -> Path:
    if cancion.ruta and cancion.ruta.exists():
        return cancion.ruta
    cache.mkdir(parents=True, exist_ok=True)
    destino = cache / f"{cancion.drive_id}.mp3"
    datos, _ = _cuerpo_drive(cancion.drive_id)
    temporal = destino.with_suffix(".parcial")
    temporal.write_bytes(datos)
    temporal.replace(destino)
    cancion.ruta = destino
    return destino


# ---------------------------------------------------------------------------
# Etiquetas ID3
# ---------------------------------------------------------------------------

@dataclass
class Etiquetas:
    letra: str | None
    titulo: str | None
    album: str | None


def leer_etiquetas(fuente: Path | bytes) -> Etiquetas:
    from mutagen.id3 import ID3, ID3NoHeaderError

    try:
        id3 = ID3(io.BytesIO(fuente) if isinstance(fuente, bytes) else fuente)
    except (ID3NoHeaderError, Exception):  # sin etiqueta o etiqueta rota
        return Etiquetas(None, None, None)
    candidatas = [
        "\n".join(str(t) for t in f.text)
        for f in id3.getall("TXXX")
        if (f.desc or "").strip().lower().startswith("lyrics")
    ]
    candidatas += [f.text for f in id3.getall("USLT")]
    candidatas = [c for c in candidatas if c and c.strip()]
    letra = max(candidatas, key=len) if candidatas else None

    def texto(clave):
        f = id3.get(clave)
        return str(f.text[0]).strip() if f and f.text and str(f.text[0]).strip() else None

    return Etiquetas(letra, texto("TIT2"), texto("TALB"))


# ---------------------------------------------------------------------------
# Preparación del texto: encabezados de sección y versos
# ---------------------------------------------------------------------------

# La regla es la MISMA que usa la app (src/lyrics/lines.ts → isSectionLine y plainLyricLines):
# si se cambia allí, hay que cambiarla aquí, o la app pintará como verso lo que aquí no se alineó.
PALABRAS_SECCION = [
    "intro", "outro", "verso", "verse", "strofa", "strophe", "coro", "chorus", "ritornello",
    "refrain", "refrán", "estribillo", "puente", "bridge", "ponte", "brücke", "pre-coro",
    "precoro", "pre-chorus", "prechorus", "pre-ritornello", "interludio", "interlude",
    "zwischenspiel", "instrumental", "hook", "final", "finale", "hablado", "spoken", "parlato",
    "gesprochen", "pre-refrain", "finaler", "schluss", "chiusura", "cierre",
    # Rótulos de voz en los duetos: «(Lei)», «Sie:», «(Entrambi — Mantra finale)».
    "lei", "lui", "entrambi", "ella", "él", "ambos", "sie", "er", "beide", "duetto", "dueto",
    "duet", "chor", "hintergrund", "background",
]
GUION = "[-\u2010-\u2015]"  # guion normal y sus variantes tipográficas («Pre‑Coro» con U+2011)
_PALABRA = "(?:" + "|".join(re.escape(w).replace(r"\-", f"(?:{GUION}| )?", 1) for w in PALABRAS_SECCION) + ")"
_PALABRA_SECCION = re.compile(
    # «Verso 2», «Finaler Refrain», «Coro final», «Coro Finale – Ampio», «Intro (susurrado)», «Coro:»
    rf"^{_PALABRA}(?:\s+{_PALABRA})?(?:\s*[0-9]+)?(?:\s+(?:final|finale|finales|largo|corto|doble|x[0-9]+))?"
    rf"\s*(?::|{GUION}.*|\(.*\))?\s*$",
    re.IGNORECASE,
)
COMILLAS = "“”„‟\"«»‹›"


def _largo_js(texto: str) -> int:
    """Longitud como la cuenta JavaScript (unidades UTF-16)."""
    return len(texto.encode("utf-16-le")) // 2


def es_encabezado(texto: str) -> bool:
    """Port de isSectionLine: «[Coro]», «(Intro – Voce profonda)», «Verso 1», «Coro final»."""
    t = texto.strip()
    if not t:
        return False
    if re.fullmatch(r"\[.*\]", t):
        return True
    m = re.fullmatch(r"\((.*)\)", t)
    # Una acotación con raya entre paréntesis: «(Schluss – Chor a cappella)», «(Métrica 7–10 sílabas)».
    if m and re.search("[–—]| - ", m.group(1)):
        return True
    interior = m.group(1).strip() if m else t
    return _largo_js(interior) <= 60 and bool(_PALABRA_SECCION.match(interior))


def es_titulo(texto: str) -> bool:
    """Primera línea de la letra con raya («Dietro la Maschera” – Versione Cantabile…»)."""
    t = texto.strip()
    return bool(re.search(f" {GUION} ", t)) and _largo_js(t) <= 90


def _limpiar_inicio(linea: str) -> str:
    """Quita emojis y símbolos decorativos del principio («🎶 [Coro]» → «[Coro]»)."""
    i = 0
    while i < len(linea):
        c = linea[i]
        if c.isalnum() or c in "([{" + COMILLAS + "‘’¿¡":
            break
        if unicodedata.category(c).startswith(("S", "Z", "C", "M")) or c in "*#_~•·":
            i += 1
            continue
        break
    return linea[i:].strip()


def _normal(texto: str) -> str:
    t = unicodedata.normalize("NFKD", texto.casefold())
    return "".join(c for c in t if c.isalnum())


@dataclass
class Linea:
    texto: str
    encabezado: bool
    inicio: float = 0.0
    fin: float = 0.0


def partir_verso(verso: str, maximo: int = MAX_CARACTERES) -> list[str]:
    """Parte un verso demasiado largo (letras escritas como párrafo) en frases."""
    if len(verso) <= maximo:
        return [verso]
    # Fin de frase: tras . ! ? … (con comilla opcional) seguido de mayúscula, o tras «)».
    # Un coro corto entre paréntesis se queda con su frase («Ich bin der Zeuge! (Hinter der
    # Haut)»); uno largo, de 4 palabras o más, va en línea propia.
    mayuscula = r"[¿¡\"“„«]?[A-ZÀ-ÖØ-Þ]"
    frases = re.split(
        rf"(?<=[.!?…])\s+(?={mayuscula}|\((?:[^)\s]+\s+){{3,}}[^)]*\))"
        rf"|(?<=[.!?…][”“\"»’])\s+(?={mayuscula})"
        rf"|(?<=\))\s+(?={mayuscula}|\()",
        verso,
    )
    # Junta frases cortas consecutivas mientras quepan en una línea.
    juntas: list[str] = []
    for f in (f.strip() for f in frases if f.strip()):
        if juntas and len(juntas[-1]) + 1 + len(f) <= maximo * 0.75:
            juntas[-1] += " " + f
        else:
            juntas.append(f)
    salida: list[str] = []
    for f in juntas:
        salida += _partir_clausulas(f, maximo)
    return salida


def _partir_clausulas(frase: str, maximo: int) -> list[str]:
    if len(frase) <= maximo:
        return [frase]
    cortes = [m.end() for m in re.finditer(r"[,;:…]\s+|\s[–—]\s", frase)]
    cortes = [c for c in cortes if 12 <= c <= len(frase) - 12]
    if not cortes:
        if len(frase) <= maximo * 1.3:
            return [frase]
        espacios = [m.start() for m in re.finditer(r"\s", frase)]
        if not espacios:
            return [frase]
        cortes = espacios
    medio = len(frase) / 2
    corte = min(cortes, key=lambda c: abs(c - medio))
    izq, der = frase[:corte].strip(), frase[corte:].strip()
    return _partir_clausulas(izq, maximo) + _partir_clausulas(der, maximo)


def preparar(letra: str, partir: bool = True) -> list[Linea]:
    """Separa encabezados y versos. Los encabezados se escriben sin el emoji decorativo
    del principio («🎶 [Coro – …]» → «[Coro – …]») para que la app los reconozca."""
    lineas: list[Linea] = []
    for cruda in letra.splitlines():
        original = cruda.strip()
        limpia = _limpiar_inicio(original)
        if not limpia:
            continue
        if es_encabezado(limpia) or (not lineas and es_titulo(limpia)):
            lineas.append(Linea(limpia, True))
            continue
        trozos = partir_verso(original) if partir else [original]
        if any(es_encabezado(t) for t in trozos):  # un trozo no puede parecer encabezado
            trozos = [original]
        lineas += [Linea(t, False) for t in trozos]
    return lineas


# ---------------------------------------------------------------------------
# Idioma
# ---------------------------------------------------------------------------

PALABRAS_IDIOMA = {
    "es": "el la los las que de del y en un una es por para con no se mi tu su yo me te soy eres "
          "como pero más cuando donde quien sin sobre hay muy todo nada nos lo le al este esta "
          "sus mis tus cada porque también desde hasta ya sí",
    "it": "il lo la gli le che di del della e è un una per con non si mi ti sono sei io tu "
          "come ma più quando dove chi senza nel nella al alla questo questa ogni perché anche "
          "già ci ne sua mio mia tuo",
    "de": "der die das und ist ich du nicht ein eine in den dem des mit sich auf für bin bist "
          "wir mir mich dich dir wenn aber auch was wer wie nur noch doch sie er es zu im am",
    "en": "the and is are you i me my your of to in on with not a an be am was this that "
          "what when where who but all love",
    "fr": "le la les et est je tu il elle nous vous de des du un une dans avec pas pour mon "
          "ma ton ta qui que suis es",
    "pt": "o a os as e é um uma de do da em com não para eu tu você sou meu minha que mais "
          "quando onde quem sem",
}
_IDIOMAS = {k: set(v.split()) for k, v in PALABRAS_IDIOMA.items()}


def idioma_por_texto(versos: list[str]) -> tuple[str | None, float]:
    tokens = re.findall(r"[^\W\d_]+", " ".join(versos).casefold())
    if not tokens:
        return None, 0.0
    puntos = {k: sum(t in v for t in tokens) / len(tokens) for k, v in _IDIOMAS.items()}
    orden = sorted(puntos.items(), key=lambda kv: kv[1], reverse=True)
    (mejor, p1), (_, p2) = orden[0], orden[1]
    margen = (p1 - p2) / p1 if p1 else 0.0
    return (mejor if p1 >= 0.08 else None), margen


def idioma_por_audio(modelo, audio) -> str | None:
    import whisper
    import torch

    sr = 16000
    centro = len(audio) // 2
    trozo = audio[max(0, centro - 15 * sr): centro + 15 * sr]
    mel = whisper.log_mel_spectrogram(whisper.pad_or_trim(trozo), n_mels=modelo.dims.n_mels)
    with torch.no_grad():
        _, probs = modelo.detect_language(mel.to(modelo.device, dtype=_dtype(modelo)))
    return max(probs, key=probs.get) if probs else None


# ---------------------------------------------------------------------------
# Modelo y alineación
# ---------------------------------------------------------------------------

def _dtype(modelo):
    return next(modelo.parameters()).dtype


def cargar_modelo(nombre: str, dispositivo: str):
    import torch
    import stable_whisper

    if dispositivo == "auto":
        dispositivo = "cuda" if torch.cuda.is_available() else "cpu"
    if dispositivo != "cuda":
        return stable_whisper.load_model(nombre, device="cpu"), dispositivo

    # En GPU los pesos van en fp16 (la mitad de VRAM: large-v3 cabe en 4 GB). Para no llenar la
    # RAM (el sistema ya mató el proceso una vez al cargar large-v3 por la vía normal, que lee el
    # archivo entero para comprobarlo, lo carga y crea el modelo en fp32), el punto de control se
    # abre con mmap y el modelo se construye directamente en la GPU y en fp16.
    import whisper
    from whisper.model import ModelDimensions, Whisper
    from stable_whisper.whisper_word_level.original_whisper import modify_model

    raiz = os.path.join(os.getenv("XDG_CACHE_HOME", os.path.join(os.path.expanduser("~"), ".cache")),
                        "whisper")
    ruta = nombre
    if nombre in whisper._MODELS:
        ruta = os.path.join(raiz, os.path.basename(whisper._MODELS[nombre]))
        if not os.path.isfile(ruta):  # la primera vez: descarga y comprueba el SHA-256
            ruta = whisper._download(whisper._MODELS[nombre], raiz, False)
    punto = torch.load(ruta, map_location="cpu", weights_only=True, mmap=True)
    previo = torch.get_default_dtype()
    torch.set_default_dtype(torch.float16)
    try:
        with torch.device("cuda"):
            modelo = Whisper(ModelDimensions(**punto["dims"]))
    finally:
        torch.set_default_dtype(previo)
    modelo.load_state_dict(punto["model_state_dict"])
    del punto
    if nombre in whisper._ALIGNMENT_HEADS:
        modelo.set_alignment_heads(whisper._ALIGNMENT_HEADS[nombre])
    for m in modelo.modules():  # Whisper calcula LayerNorm en float32
        if isinstance(m, torch.nn.LayerNorm):
            m.float()
    modify_model(modelo)  # añade transcribe/align de stable-ts
    return modelo.to("cuda"), dispositivo


def liberar_gpu() -> None:
    """Devuelve la VRAM de los modelos que ya no se usan (quien llama suelta antes su referencia)."""
    import gc
    import torch

    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def alinear(modelo, audio, lineas: list[Linea], idioma: str) -> dict:
    """Alinea los versos con el audio. Rellena inicio/fin de cada Linea de verso."""
    versos = [ln for ln in lineas if not ln.encabezado]
    texto = "\n".join(v.texto for v in versos)
    # original_split: un segmento por línea del texto (cada verso conserva su línea).
    with warnings.catch_warnings(record=True) as avisos_st:
        warnings.simplefilter("always")
        resultado = modelo.align(audio, texto, language=idioma, original_split=True, verbose=None)
    fallidos = 0
    for w in avisos_st:  # stable-ts avisa «N/M segments failed to align.»
        m = re.search(r"(\d+)/\d+ segments failed to align", str(w.message))
        if m:
            fallidos += int(m.group(1))
    palabras = [p for s in resultado.segments for p in s.words]

    # Reparte las palabras alineadas entre los versos contando caracteres alfanuméricos.
    limites, acumulado = [], 0
    for v in versos:
        acumulado += len(_normal(v.texto))
        limites.append(acumulado)
    por_verso: list[list] = [[] for _ in versos]
    contador, i = 0, 0
    for p in palabras:
        n = len(_normal(p.word))
        centro = contador + n / 2
        while i < len(versos) - 1 and centro > limites[i]:
            i += 1
        por_verso[i].append(p)
        contador += n
    sin_palabras = 0
    for v, ps in zip(versos, por_verso):
        if ps:
            v.inicio, v.fin = ps[0].start, ps[-1].end
        else:
            v.inicio = v.fin = -1.0
            sin_palabras += 1
    # Versos sin palabras (no debería pasar): toman el final del verso anterior.
    for k, v in enumerate(versos):
        if v.inicio < 0:
            antes = next((x.fin for x in reversed(versos[:k]) if x.inicio >= 0), 0.0)
            v.inicio = v.fin = antes
    cero = sum(1 for p in palabras if p.end - p.start <= 0.02)
    return {"palabras": len(palabras), "palabras_cero": cero, "versos_sin_palabras": sin_palabras,
            "versos_fallidos": fallidos}


def ajustar_tiempos(lineas: list[Linea], duracion: float) -> None:
    previo = 0.0
    for ln in lineas:
        if ln.encabezado:
            continue
        ln.inicio = min(max(ln.inicio, previo), duracion)
        ln.fin = min(max(ln.fin, ln.inicio), duracion)
        previo = ln.inicio
    # Encabezado = tiempo del primer verso que le sigue (o el fin del último, si no hay más).
    siguiente = max((ln.fin for ln in lineas if not ln.encabezado), default=duracion)
    for ln in reversed(lineas):
        if ln.encabezado:
            ln.inicio = ln.fin = siguiente
        else:
            siguiente = ln.inicio


# ---------------------------------------------------------------------------
# Verificación: transcribe alrededor de algunos versos y compara
# ---------------------------------------------------------------------------

def cobertura(esperado: str, oido: str) -> float:
    """Qué parte del verso (en letras, sin tildes ni signos) aparece en lo transcrito, en
    tramos de 3 letras o más: tolera «sus sombras se deshacen» frente a «su sombra se deshace»."""
    a, b = _normal(esperado), _normal(oido)
    if not a:
        return 1.0
    bloques = difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks()
    return sum(x.size for x in bloques if x.size >= 3) / len(a)


def verificar(modelo, audio, lineas: list[Linea], idioma: str, n: int) -> list[dict]:
    sr = 16000
    candidatos = [ln for ln in lineas if not ln.encabezado and len(ln.texto.split()) >= 4]
    if not candidatos or n <= 0:
        return []
    n = min(n, len(candidatos))
    paso = len(candidatos) / n
    elegidos = [candidatos[int(paso * k + paso / 2)] for k in range(n)]
    informes = []
    fp16 = _dtype(modelo) != __import__("torch").float32
    for ln in elegidos:
        a, b = max(0.0, ln.inicio - 0.5), min(len(audio) / sr, max(ln.fin, ln.inicio + 2) + 0.5)
        trozo = audio[int(a * sr): int(b * sr)]
        r = modelo.transcribe(trozo, language=idioma, fp16=fp16, verbose=None, regroup=False,
                              condition_on_previous_text=False)
        oido = r.text.strip()
        parecido = cobertura(ln.texto, oido)
        informes.append({"tiempo": ln.inicio, "verso": ln.texto, "oido": oido,
                         "parecido": parecido})
    return informes


# ---------------------------------------------------------------------------
# Transcripción de las canciones sin letra (--transcribir)
# ---------------------------------------------------------------------------

MODELO_TRANSCRIPCION = "large-v3-turbo"  # medido: mismo WER que large-v3, más completo en salsa, 3× más rápido
MODELO_CONTRASTE = "large-v3"
AUTOR_TRANSCRIPCION = "Transcripción automática (Whisper), revisar"
AUTOR_REVISADA = "Letra revisada a mano; tiempos alineados con Whisper"
SR = 16000
MAX_VERSO = 60        # caracteres por línea transcrita
PAUSA_VERSO = 0.6     # segundos de silencio que cortan un verso
PAUSA_ESTROFA = 4.0   # segundos de silencio que separan estrofas en el .txt
PROB_DUDOSA = 0.4     # palabra con probabilidad menor: «[?]» en el .txt
# Filtro de segmentos. no_speech_prob por sí solo no sirve con voz cantada: large-v3 da 0,76–0,97
# en estrofas transcritas a la perfección (y turbo da siempre ~0), así que, como hace Whisper, solo
# cuenta junto con un avg_logprob flojo. Las estrofas reales salen con avg_logprob de −0,1 a −0,4.
NO_VOZ_MAX = 0.6       # no_speech_prob mayor…
LOGPROB_NO_VOZ = -0.5  # …y avg_logprob menor que esto: tramo sin voz, se descarta
LOGPROB_MIN = -1.0     # avg_logprob menor: confianza muy baja, se descarta
PROB_SEGMENTO_MIN = 0.1  # probabilidad media de las palabras menor: invención («Gracias.» da 0,00)
COMPRESION_MAX = 2.4   # segmento más repetitivo que esto (zlib): bucle, se descarta
MIN_PALABRAS = 15     # con menos palabras útiles la canción se da por instrumental

# Frases que Whisper se inventa en tramos sin voz (vienen de los subtítulos con que se entrenó).
_ALUCINACIONES = re.compile(
    r"gracias por (ver|mirar|escuchar|su atencion)|suscribete|suscribanse|amara ?org|subtitulos|"
    r"sottotitoli|untertitel|thanks? (you )?for watching|dale like|"
    r"^(musica|musik|music|musica de fondo|aplausos|risas|silencio|instrumental)$|"
    r"^(muchas )?gracias$|^grazie( a tutti| mille)?$|^danke( schon)?$|^thank you$|^amen$|^$"
)


@dataclass
class Palabra:
    texto: str
    inicio: float
    fin: float
    prob: float


@dataclass
class Transcripcion:
    idioma: str
    segmentos: list[list[Palabra]]        # lo que pasa el filtro
    descartados: list[tuple[float, str, str]] = field(default_factory=list)  # (inicio, texto, motivo)
    segundos: float = 0.0

    def palabras(self) -> list[str]:
        return [_normal(p.texto) for s in self.segmentos for p in s if _normal(p.texto)]


def _plano(texto: str) -> str:
    """Minúsculas, sin tildes ni signos: para comparar frases."""
    t = unicodedata.normalize("NFKD", texto.casefold())
    t = "".join(c if c.isalnum() or c.isspace() else " " for c in t if not unicodedata.combining(c))
    return " ".join(t.split())


def _clave_audio(ruta: Path) -> str:
    import hashlib

    st = ruta.stat()
    return hashlib.sha1(f"{ruta.resolve()}|{st.st_size}|{int(st.st_mtime)}".encode()).hexdigest()[:16]


def separar_voces(rutas: list[Path], cache: Path, nombres: dict[Path, str] | None = None
                  ) -> dict[Path, tuple[Path, float]]:
    """Aísla la voz de cada MP3 con Demucs (htdemucs) y la guarda en caché (16 kHz, mono, .npy).
    Devuelve, por MP3, el .npy y los segundos que costó (0 si ya estaba en caché)."""
    import numpy as np
    import torch

    salida = {r: (cache / "voz" / f"{_clave_audio(r)}.npy", 0.0) for r in rutas}
    faltan = [r for r, (d, _) in salida.items() if not d.exists()]
    if faltan:
        from stable_whisper.audio.demucs import demucs_audio, load_demucs_model

        dispositivo = "cuda" if torch.cuda.is_available() else "cpu"
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            demucs = load_demucs_model(cache=False)
            for r in faltan:
                print(f"  separando la voz (Demucs): {(nombres or {}).get(r, r.name)}")
                t0 = time.perf_counter()
                voz = demucs_audio(str(r), output_sr=SR, model=demucs, device=dispositivo, verbose=None)
                voz = voz.float()
                if voz.dim() > 1:
                    voz = voz.mean(dim=0)
                destino = salida[r][0]
                destino.parent.mkdir(parents=True, exist_ok=True)
                np.save(destino, voz.cpu().numpy().astype(np.float32))
                salida[r] = (destino, time.perf_counter() - t0)
        demucs = None
        liberar_gpu()
    return salida


def idioma_de_voz(modelo, voz) -> tuple[str, float]:
    """Detecta el idioma en los 30 s con más voz (no al principio, que suele ser instrumental)."""
    import numpy as np
    import torch
    import whisper

    n = len(voz) // SR
    ventana = 30
    inicio = 0
    if n > ventana:
        energia = np.sqrt(np.mean(voz[: n * SR].reshape(n, SR) ** 2, axis=1))
        inicio = int(np.argmax(np.convolve(energia, np.ones(ventana), "valid")))
    trozo = whisper.pad_or_trim(np.ascontiguousarray(voz[inicio * SR:(inicio + ventana) * SR]))
    mel = whisper.log_mel_spectrogram(trozo, n_mels=modelo.dims.n_mels)
    with torch.no_grad():
        _, probs = modelo.detect_language(mel.to(modelo.device, dtype=_dtype(modelo)))
    mejor = max(probs, key=probs.get)
    return mejor, float(probs[mejor])


def transcribir_voz(modelo, voz, idioma: str, vad: bool = True) -> Transcripcion:
    """Transcribe y descarta lo que no es letra: alucinaciones típicas, segmentos sin voz o
    de muy baja confianza y bucles (el mismo texto tres veces seguidas)."""
    import torch

    t0 = time.perf_counter()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        r = modelo.transcribe(voz, language=idioma, fp16=_dtype(modelo) != torch.float32,
                              verbose=None, regroup=False, vad=vad, word_timestamps=True,
                              condition_on_previous_text=False)
    tr = Transcripcion(idioma, [])
    recientes: list[str] = []
    for s in r.segments:
        plano = _plano(s.text)
        motivo = None
        if _ALUCINACIONES.search(plano):
            motivo = "alucinación típica"
        elif (s.no_speech_prob or 0) > NO_VOZ_MAX and (s.avg_logprob or 0) < LOGPROB_NO_VOZ:
            motivo = f"sin voz (no_speech_prob {s.no_speech_prob:.2f}, avg_logprob {s.avg_logprob:.2f})"
        elif (s.avg_logprob or 0) < LOGPROB_MIN:
            motivo = f"confianza muy baja (avg_logprob {s.avg_logprob:.2f})"
        elif s.words and sum(w.probability or 0 for w in s.words) / len(s.words) < PROB_SEGMENTO_MIN:
            motivo = "palabras improbables"
        elif (s.compression_ratio or 0) > COMPRESION_MAX:
            motivo = "texto repetitivo"
        elif recientes[-2:] == [plano, plano]:
            motivo = "bucle"
        if motivo:
            tr.descartados.append((s.start, s.text.strip(), motivo))
            continue
        palabras = [Palabra(w.word.strip(), w.start, w.end, float(w.probability or 0))
                    for w in s.words if w.word.strip()]
        if palabras:
            tr.segmentos.append(palabras)
            recientes.append(plano)
    tr.segundos = time.perf_counter() - t0
    return tr


def agrupar_versos(segmentos: list[list[Palabra]]) -> list[list[Palabra]]:
    """Versos legibles: corta en las pausas, tras punto, antes de «¿»/«¡» y al cambiar de
    segmento, sin pasar de MAX_VERSO caracteres (si no cabe, corta en la última coma)."""
    versos: list[list[Palabra]] = []
    actual: list[Palabra] = []

    def largo(ps):
        return len(" ".join(p.texto for p in ps))

    for seg in segmentos:
        for i, p in enumerate(seg):
            if actual:
                previa = actual[-1]
                if (p.inicio - previa.fin >= PAUSA_VERSO or previa.texto.endswith((".", "?", "!", "…"))
                        or p.texto.startswith(("¿", "¡")) or (i == 0 and len(actual) >= 3)):
                    versos.append(actual)
                    actual = []
                elif largo(actual) + 1 + len(p.texto) > MAX_VERSO:
                    comas = [j for j, x in enumerate(actual[:-1]) if x.texto.endswith((",", ";", ":"))]
                    j = comas[-1] + 1 if comas and largo(actual[:comas[-1] + 1]) >= MAX_VERSO * 0.4 else len(actual)
                    versos.append(actual[:j])
                    actual = actual[j:]
            actual.append(p)
    if actual:
        versos.append(actual)
    return versos


def _con_duda(p: Palabra) -> str:
    if p.prob >= PROB_DUDOSA:
        return p.texto
    m = re.match(r"^(.*?)([.,;:!?…»”\"')]*)$", p.texto)
    return f"{m.group(1)}[?]{m.group(2)}"


def coincidencia(a: list[str], b: list[str]) -> float:
    """Parecido entre dos transcripciones (0–1), palabra a palabra."""
    if not a and not b:
        return 1.0
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()


def escribir_transcripcion(destino: Path, versos: list[list[Palabra]], titulo: str | None,
                           album: str | None, duracion: float) -> None:
    """`<nombre>.lrc` (con [by:…]) y `<nombre>.txt` con «[?]» tras las palabras dudosas."""
    lineas = [Linea(" ".join(p.texto for p in v), False, v[0].inicio, v[-1].fin) for v in versos]
    escribir_lrc(destino, lineas, titulo, album, duracion, autor=AUTOR_TRANSCRIPCION)
    filas = []
    for k, v in enumerate(versos):
        if k and v[0].inicio - versos[k - 1][-1].fin >= PAUSA_ESTROFA:
            filas.append("")
        filas.append(" ".join(_con_duda(p) for p in v))
    destino.with_suffix(".txt").write_bytes(("\n".join(filas) + "\n").encode("utf-8"))


def transcribir_pendientes(pendientes: list[tuple[Cancion, Etiquetas, Resumen]], args) -> None:
    """Fase de transcripción: descarga, aísla la voz de todas (Demucs) y transcribe con el modelo
    principal y luego con el de contraste, de uno en uno para no juntar dos modelos en la GPU."""
    import numpy as np
    import whisper
    from mutagen.mp3 import MP3

    print(f"\n▶ Transcripción de {len(pendientes)} canciones sin letra")
    rutas: dict[str, Path] = {}
    for item in list(pendientes):
        cancion, _, res = item
        t0 = time.perf_counter()
        try:
            rutas[cancion.etiqueta] = descargar(cancion, args.cache)
        except Exception as e:
            res.estado = f"error: {e}"
            pendientes.remove(item)
        res.segundos += time.perf_counter() - t0
    if not pendientes:
        return
    voces: dict[str, Path] = {}
    if not args.sin_separar:
        separadas = separar_voces(list(rutas.values()), args.cache, {r: e for e, r in rutas.items()})
        for cancion, _, res in pendientes:
            npy, segundos = separadas[rutas[cancion.etiqueta]]
            voces[cancion.etiqueta] = npy
            res.segundos += segundos

    def audio_de(cancion):
        if args.sin_separar:
            return whisper.load_audio(str(rutas[cancion.etiqueta]))
        return np.load(voces[cancion.etiqueta])

    resultados: dict[str, dict[str, Transcripcion]] = {c.etiqueta: {} for c, _, _ in pendientes}
    idiomas: dict[str, str] = {}

    def transcribir_con(nombre: str, principal: bool) -> None:
        print(f"  cargando modelo {nombre}…")
        modelo, _ = cargar_modelo(nombre, args.dispositivo)
        for cancion, _, res in pendientes:
            if res.estado.startswith(("error", "instrumental")):
                continue
            try:
                audio = audio_de(cancion)
                if cancion.etiqueta not in idiomas:
                    idiomas[cancion.etiqueta] = args.idioma or idioma_de_voz(modelo, audio)[0]
                tr = transcribir_voz(modelo, audio, idiomas[cancion.etiqueta])
                resultados[cancion.etiqueta][nombre] = tr
                res.segundos += tr.segundos
                print(f"  {nombre} · {cancion.etiqueta}: {len(tr.palabras())} palabras "
                      f"({tr.segundos:.0f} s)")
                if principal:
                    for inicio, texto, motivo in tr.descartados:
                        print(f"      descartado en {marca(inicio)} [{motivo}]: {texto[:70]}")
            except Exception as e:
                if principal:
                    res.estado = f"error: {e}"
                else:
                    res.avisos.append(f"sin contraste ({nombre}): {e}")
                print(f"  ERROR en {cancion.etiqueta}: {e}")
        modelo = None
        liberar_gpu()

    # 1) Modelo principal. Los archivos se escriben ya: si el contraste falla, no se pierden.
    transcribir_con(args.modelo_transcripcion, principal=True)
    for cancion, etiquetas, res in pendientes:
        if res.estado.startswith("error"):
            continue
        tr = resultados[cancion.etiqueta][args.modelo_transcripcion]
        res.idioma = f"{tr.idioma} (audio)"
        if tr.descartados:
            motivos: dict[str, int] = {}
            for _, _, motivo in tr.descartados:
                clave = motivo.split(" (")[0]
                motivos[clave] = motivos.get(clave, 0) + 1
            res.avisos.append("segmentos descartados: " + ", ".join(f"{n} por {m}" for m, n in motivos.items()))
        palabras = [p for s in tr.segmentos for p in s]
        if len(palabras) < MIN_PALABRAS:
            res.estado = "instrumental (no se escribe nada)"
            continue
        versos = agrupar_versos(tr.segmentos)
        album = etiquetas.album or (Path(cancion.carpeta).name if cancion.carpeta else None)
        escribir_transcripcion(res.lrc, versos, etiquetas.titulo or cancion.base, album,
                               MP3(rutas[cancion.etiqueta]).info.length or 0.0)
        res.estado = "transcrito"
        res.versos = len(versos)
        res.palabras = len(palabras)
        res.dudosas = sum(1 for p in palabras if p.prob < PROB_DUDOSA)
        print(f"  → {res.lrc} (+ .txt)")

    # 2) Contraste: la misma voz con otro modelo; la coincidencia palabra a palabra es la confianza.
    if args.contraste in ("ninguno", args.modelo_transcripcion):
        return
    if not any(res.estado == "transcrito" for _, _, res in pendientes):
        return
    transcribir_con(args.contraste, principal=False)
    for cancion, _, res in pendientes:
        otra = resultados[cancion.etiqueta].get(args.contraste)
        if res.estado != "transcrito" or otra is None:
            continue
        principal = resultados[cancion.etiqueta][args.modelo_transcripcion]
        res.confianza = coincidencia(principal.palabras(), otra.palabras())
        if res.confianza < 0.6:
            res.avisos.append("los dos modelos discrepan mucho: revisar la letra entera")


# ---------------------------------------------------------------------------
# LRC
# ---------------------------------------------------------------------------

def marca(segundos: float) -> str:
    cs = max(0, round(segundos * 100))
    return f"{cs // 6000:02d}:{(cs % 6000) // 100:02d}.{cs % 100:02d}"


def tiempos_de_lrc(ruta: Path) -> list[tuple[float, str]]:
    """Las líneas con tiempo de un .lrc: (segundos, texto)."""
    filas = []
    for fila in ruta.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\[(\d+):(\d+(?:\.\d+)?)\](.*)$", fila.strip())
        if m:
            filas.append((int(m[1]) * 60 + float(m[2]), m[3].strip()))
    return filas


def conservar_tiempos(lineas: list[Linea], anterior: list[tuple[float, str]]) -> int:
    """Al realinear una letra revisada: las líneas que no cambiaron, o que cambiaron de palabras pero
    siguen en su sitio (sustitución una a una), conservan el tiempo del .lrc anterior. En una
    transcripción ese tiempo sale de los tiempos por palabra y es más fiable que realinear, que a
    veces junta dos versos. Las líneas nuevas se quedan con el de la alineación. Devuelve cuántas conservó."""
    viejas = [_normal(t) for _, t in anterior]
    nuevas = [_normal(ln.texto) for ln in lineas]
    conservadas = 0
    for op, a0, a1, b0, b1 in difflib.SequenceMatcher(a=viejas, b=nuevas, autojunk=False).get_opcodes():
        if op == "equal" or (op == "replace" and a1 - a0 == b1 - b0):
            for k in range(b1 - b0):
                lineas[b0 + k].inicio = anterior[a0 + k][0]
                conservadas += 1
    for i in range(1, len(lineas)):  # el orden manda: nada antes que la línea anterior
        lineas[i].inicio = max(lineas[i].inicio, lineas[i - 1].inicio)
    return conservadas


def escribir_lrc(destino: Path, lineas: list[Linea], titulo: str | None, album: str | None,
                 duracion: float, autor: str | None = None) -> None:
    filas = []
    if titulo:
        filas.append(f"[ti:{titulo}]")
    if album:
        filas.append(f"[al:{album}]")
    if autor:
        filas.append(f"[by:{autor}]")
    total = round(duracion)
    filas.append(f"[length:{total // 60:02d}:{total % 60:02d}]")
    for ln in lineas:
        texto = " ".join(ln.texto.split())
        if texto:
            filas.append(f"[{marca(ln.inicio)}]{texto}")
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(("\n".join(filas) + "\n").encode("utf-8"))


# ---------------------------------------------------------------------------
# Programa
# ---------------------------------------------------------------------------

@dataclass
class Resumen:
    cancion: str
    estado: str
    idioma: str = ""
    versos: int = 0
    secciones: int = 0
    segundos: float = 0.0
    avisos: list[str] = field(default_factory=list)
    lrc: Path | None = None
    confianza: float | None = None  # solo transcripciones: coincidencia con el modelo de contraste
    palabras: int = 0
    dudosas: int = 0


def avisos_de_calidad(lineas: list[Linea], duracion: float, stats: dict) -> list[str]:
    avisos = []
    versos = [ln for ln in lineas if not ln.encabezado]
    if not versos:
        return ["sin versos"]
    if versos[0].inicio < 0.5:
        avisos.append("el primer verso empieza en 0:00")
    if versos[-1].inicio > duracion - 1:
        avisos.append("el último verso cae al final del audio")
    cubierto = (versos[-1].fin - versos[0].inicio) / duracion if duracion else 0
    if len(versos) <= 3 or cubierto < 0.35:
        avisos.append(f"la letra solo cubre el {cubierto:.0%} de la canción: ¿letra incompleta?")
    pegados = [b for a, b in zip(versos, versos[1:]) if b.inicio - a.inicio < 0.3]
    if len(pegados) >= 2:
        avisos.append(f"{len(pegados)} versos casi sin separación, desde {marca(pegados[0].inicio)} "
                      "(alineación dudosa ahí)")
    if stats["versos_fallidos"]:
        avisos.append(f"stable-ts no pudo alinear {stats['versos_fallidos']} versos")
    if stats["palabras"] and stats["palabras_cero"] / stats["palabras"] > 0.15:
        avisos.append(f"{stats['palabras_cero']} de {stats['palabras']} palabras sin duración")
    if stats["versos_sin_palabras"]:
        avisos.append(f"{stats['versos_sin_palabras']} versos sin palabras alineadas")
    return avisos


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
        except (AttributeError, ValueError):
            pass

    ap = argparse.ArgumentParser(description="Genera letras sincronizadas .lrc para Sonaura.")
    origen = ap.add_mutually_exclusive_group()
    origen.add_argument("--drive", metavar="ID", help=f"carpeta pública de Drive (por defecto {DRIVE_RAIZ})")
    origen.add_argument("--carpeta", type=Path, help="carpeta local con MP3 (recorre subcarpetas)")
    ap.add_argument("--solo", help="procesa solo las canciones cuya ruta contenga este texto")
    ap.add_argument("--modelo", default=MODELO_DEFECTO, help=f"modelo Whisper (por defecto {MODELO_DEFECTO})")
    ap.add_argument("--dispositivo", default="auto", choices=["auto", "cuda", "cpu"])
    ap.add_argument("--salida", type=Path, default=SALIDA_DEFECTO, help="carpeta de los .lrc (por defecto letras/ del repo)")
    ap.add_argument("--cache", type=Path, default=CACHE_DEFECTO, help="dónde guardar los MP3 bajados de Drive")
    ap.add_argument("--forzar", action="store_true", help="regenera los .lrc que ya existen")
    ap.add_argument("--idioma", help="fuerza el idioma (es, it, de…) en vez de detectarlo")
    ap.add_argument("--sin-partir", action="store_true", help="no parte los versos largos en frases")
    ap.add_argument("--verificar", type=int, default=0, metavar="N",
                    help="transcribe N versos por canción y compara con la letra (control de calidad)")
    ap.add_argument("--transcribir", action="store_true",
                    help="transcribe con Whisper las canciones SIN letra (si no, se saltan)")
    ap.add_argument("--modelo-transcripcion", default=MODELO_TRANSCRIPCION,
                    help=f"modelo para transcribir (por defecto {MODELO_TRANSCRIPCION})")
    ap.add_argument("--contraste", default=MODELO_CONTRASTE,
                    help=f"segundo modelo para medir la confianza (por defecto {MODELO_CONTRASTE}; «ninguno» lo omite)")
    ap.add_argument("--sin-separar", action="store_true",
                    help="transcribe la mezcla tal cual, sin aislar la voz con Demucs")
    ap.add_argument("--desde-txt", action="store_true",
                    help="usa la letra corregida del .txt junto al .lrc y la alinea con el audio "
                         "(con --forzar y --solo, tras revisar una transcripción)")
    args = ap.parse_args(argv)

    if args.carpeta:
        canciones = listar_local(args.carpeta)
        origen_txt = str(args.carpeta)
    else:
        canciones = listar_drive(args.drive or DRIVE_RAIZ)
        origen_txt = f"Drive {args.drive or DRIVE_RAIZ}"
    if args.solo:
        canciones = [c for c in canciones if args.solo.casefold() in c.etiqueta.casefold()]
    print(f"{len(canciones)} MP3 en {origen_txt}")

    modelo = dispositivo = None
    resumenes: list[Resumen] = []
    pendientes: list[tuple[Cancion, Etiquetas, Resumen]] = []
    for cancion in canciones:
        destino = args.salida / cancion.carpeta / f"{cancion.base}.lrc"
        res = Resumen(cancion.etiqueta, "", lrc=destino)
        resumenes.append(res)
        if destino.exists() and not args.forzar:
            res.estado = "ya existía"
            continue
        t0 = time.perf_counter()
        print(f"\n▶ {cancion.etiqueta}")
        try:
            fuente = cancion.ruta if cancion.ruta else etiqueta_remota(cancion, args.cache)
            etiquetas = leer_etiquetas(fuente)
            revisada = destino.with_suffix(".txt")
            autor = None
            if args.desde_txt and revisada.exists():
                # La letra corregida a mano en el .txt de una transcripción: se alinea con el audio
                # como la del ID3, respetando sus líneas tal cual.
                lineas = preparar(revisada.read_text(encoding="utf-8").replace("[?]", ""), partir=False)
                autor = AUTOR_REVISADA
                print(f"  letra revisada: {revisada.name}")
            elif not etiquetas.letra:
                if args.transcribir:
                    res.estado = "pendiente de transcribir"
                    pendientes.append((cancion, etiquetas, res))
                    print("  sin letra en la etiqueta ID3: se transcribirá al final")
                else:
                    res.estado = "sin letra (saltada)"
                    print("  sin letra en la etiqueta ID3: se salta (usa --transcribir)")
                continue
            else:
                lineas = preparar(etiquetas.letra, partir=not args.sin_partir)
            versos = [ln.texto for ln in lineas if not ln.encabezado]
            if not versos:
                res.estado = "sin versos (saltada)"
                continue
            ruta = descargar(cancion, args.cache)

            import whisper  # noqa: F401  (va con stable-ts)
            from mutagen.mp3 import MP3

            if modelo is None:
                print(f"  cargando modelo {args.modelo}…")
                modelo, dispositivo = cargar_modelo(args.modelo, args.dispositivo)
                print(f"  modelo {args.modelo} en {dispositivo}")
            audio = whisper.load_audio(str(ruta))
            duracion = MP3(ruta).info.length or len(audio) / 16000

            idioma, metodo = args.idioma, "forzado"
            if not idioma:
                idioma, margen = idioma_por_texto(versos)
                metodo = "texto"
                if not idioma or margen < 0.25:
                    idioma, metodo = idioma_por_audio(modelo, audio), "audio"
            res.idioma = f"{idioma} ({metodo})"
            print(f"  idioma {res.idioma}; {len(versos)} versos; alineando…")

            if autor == AUTOR_REVISADA and not args.sin_separar:
                # Las transcritas suelen ser salsa con mucha percusión: se alinea sobre la voz aislada
                # (la de la caché, si ya se separó al transcribir).
                import numpy as np

                npy, _ = separar_voces([ruta], args.cache, {ruta: cancion.etiqueta})[ruta]
                audio = np.load(npy)
            stats = alinear(modelo, audio, lineas, idioma)
            ajustar_tiempos(lineas, duracion)
            if autor == AUTOR_REVISADA and destino.exists():
                conservadas = conservar_tiempos(lineas, tiempos_de_lrc(destino))
                print(f"  {conservadas} de {len(lineas)} líneas conservan el tiempo del .lrc anterior")
            album = etiquetas.album or (Path(cancion.carpeta).name if cancion.carpeta else None)
            escribir_lrc(destino, lineas, etiquetas.titulo or cancion.base, album, duracion, autor=autor)
            res.versos = len(versos)
            res.secciones = sum(1 for ln in lineas if ln.encabezado)
            res.avisos = avisos_de_calidad(lineas, duracion, stats)
            if args.verificar:
                for v in verificar(modelo, audio, lineas, idioma, args.verificar):
                    nota = "ok" if v["parecido"] >= 0.6 else "NO COINCIDE"
                    print(f"  [{marca(v['tiempo'])}] {nota} {v['parecido']:.0%}\n"
                          f"      letra: {v['verso']}\n      oído:  {v['oido']}")
                    if v["parecido"] < 0.6:
                        res.avisos.append(f"verificación: no coincide en {marca(v['tiempo'])}")
            res.estado = "generado"
        except Exception as e:  # una canción rota no detiene al resto
            res.estado = f"error: {e}"
            print(f"  ERROR: {e}")
        finally:
            res.segundos = time.perf_counter() - t0
            if res.estado == "generado":
                print(f"  → {destino} ({res.segundos:.0f} s)")

    if pendientes:
        if modelo is not None:  # deja la GPU libre para Demucs y el modelo de transcripción
            modelo = None
            liberar_gpu()
        transcribir_pendientes(pendientes, args)

    print("\n=== Resumen ===")
    if dispositivo is not None:
        print(f"alineación: modelo {args.modelo} en {dispositivo}")
    if pendientes:
        contraste = "" if args.contraste == "ninguno" else f", contraste {args.contraste}"
        print(f"transcripción: modelo {args.modelo_transcripcion}{contraste}, "
              f"{'sin separar la voz' if args.sin_separar else 'voz aislada con Demucs'}, VAD")
    for r in resumenes:
        linea = f"- {r.cancion}: {r.estado}"
        if r.estado == "generado":
            linea += f" · {r.idioma} · {r.versos} versos, {r.secciones} encabezados · {r.segundos:.0f} s"
        elif r.estado == "transcrito":
            confianza = f"confianza {r.confianza:.0%} · " if r.confianza is not None else ""
            linea += (f" · {r.idioma} · {r.versos} versos · {confianza}{r.dudosas} de {r.palabras} "
                      f"palabras dudosas · {r.segundos:.0f} s")
        elif r.estado.startswith("instrumental"):
            linea += f" · {r.segundos:.0f} s"
        print(linea)
        for a in r.avisos:
            print(f"    aviso: {a}")
    return 1 if any(r.estado.startswith("error") for r in resumenes) else 0


if __name__ == "__main__":
    sys.exit(main())
