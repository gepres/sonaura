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
    modelo = stable_whisper.load_model(nombre, device="cpu")
    if dispositivo == "cuda":
        # Pesos en fp16 (la mitad de VRAM: cabe en 4 GB); LayerNorm se queda en fp32
        # porque Whisper la calcula en float32.
        modelo.half()
        for m in modelo.modules():
            if isinstance(m, torch.nn.LayerNorm):
                m.float()
    modelo.to(dispositivo)
    return modelo, dispositivo


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
# LRC
# ---------------------------------------------------------------------------

def marca(segundos: float) -> str:
    cs = max(0, round(segundos * 100))
    return f"{cs // 6000:02d}:{(cs % 6000) // 100:02d}.{cs % 100:02d}"


def escribir_lrc(destino: Path, lineas: list[Linea], titulo: str | None, album: str | None,
                 duracion: float) -> None:
    filas = []
    if titulo:
        filas.append(f"[ti:{titulo}]")
    if album:
        filas.append(f"[al:{album}]")
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
            if not etiquetas.letra:
                res.estado = "sin letra (saltada)"
                print("  sin letra en la etiqueta ID3: se salta")
                continue
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

            stats = alinear(modelo, audio, lineas, idioma)
            ajustar_tiempos(lineas, duracion)
            album = etiquetas.album or (Path(cancion.carpeta).name if cancion.carpeta else None)
            escribir_lrc(destino, lineas, etiquetas.titulo or cancion.base, album, duracion)
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

    print("\n=== Resumen ===")
    if modelo is not None:
        print(f"modelo {args.modelo} en {dispositivo}")
    for r in resumenes:
        linea = f"- {r.cancion}: {r.estado}"
        if r.estado == "generado":
            linea += f" · {r.idioma} · {r.versos} versos, {r.secciones} encabezados · {r.segundos:.0f} s"
        print(linea)
        for a in r.avisos:
            print(f"    aviso: {a}")
    return 1 if any(r.estado.startswith("error") for r in resumenes) else 0


if __name__ == "__main__":
    sys.exit(main())
