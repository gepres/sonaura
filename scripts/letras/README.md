# Letras sincronizadas (`.lrc`)

`alinear.py` genera un `.lrc` por canción a partir de la letra que Suno guarda en la etiqueta
ID3 del MP3 (`TXXX` «lyrics-…» o `USLT`), alineándola con el audio mediante alineación forzada
(stable-ts sobre Whisper). Es una herramienta local: no forma parte de la app.

## Instalación (una vez)

Necesita Python 3.12 y `ffmpeg` en el PATH. El entorno va en C: (pesa unos 5 GB con PyTorch) y el
modelo (~1,6 GB) se descarga solo la primera vez en `%USERPROFILE%\.cache\whisper`.

```powershell
python -m venv $env:LOCALAPPDATA\sonaura-letras\venv
$py = "$env:LOCALAPPDATA\sonaura-letras\venv\Scripts\python.exe"
& $py -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu126  # sin GPU NVIDIA: quita --index-url…
& $py -m pip install -r scripts\letras\requirements.txt
```

## Uso

```powershell
& $py scripts\letras\alinear.py                         # toda la carpeta pública de Drive → letras\
& $py scripts\letras\alinear.py --solo "La Maschera" --forzar --verificar 4
& $py scripts\letras\alinear.py --carpeta D:\musica\Esistenza
```

| Opción | Qué hace |
| --- | --- |
| `--drive ID` | Carpeta pública de Drive (por defecto la de Sonaura); recorre las subcarpetas. |
| `--carpeta RUTA` | MP3 locales en vez de Drive (también recorre subcarpetas). |
| `--solo TEXTO` | Solo las canciones cuya ruta `álbum/nombre.mp3` contenga el texto. |
| `--salida RUTA` | Dónde dejar los `.lrc` (por defecto `letras/` en la raíz del repo, ignorada por git). |
| `--forzar` | Regenera los `.lrc` que ya existen (si no, se saltan). |
| `--cache RUTA` | Dónde guardar los MP3 bajados de Drive (por defecto `%LOCALAPPDATA%\sonaura-letras\cache`). |
| `--modelo NOMBRE` | Modelo Whisper (por defecto `large-v3-turbo`, en fp16 cabe en 4 GB de VRAM). |
| `--dispositivo` | `auto` (CUDA si hay, si no CPU), `cuda` o `cpu`. |
| `--idioma es` | Fuerza el idioma en vez de detectarlo. |
| `--verificar N` | Control de calidad: transcribe N versos por canción alrededor de su tiempo y los compara con la letra. |
| `--sin-partir` | No parte los versos largos (ver abajo). |

La salida replica las carpetas de Drive: `letras/<álbum>/<nombre del MP3>.lrc`. Cada `.lrc` se
sube junto a su MP3, en la misma carpeta de Drive. Los MP3 bajados se guardan en
`%LOCALAPPDATA%\sonaura-letras\cache` (de cada MP3 solo se lee primero la etiqueta, con una
petición parcial; las canciones sin letra no se descargan enteras).

## Cómo trata la letra

- **Encabezados de sección** (no se cantan: no se alinean y van en el `.lrc` con el tiempo del
  verso siguiente). La regla es la misma que la de la app (`src/lyrics/lines.ts`,
  `isSectionLine`); si cambia allí, hay que cambiar `es_encabezado()` aquí. Una línea es
  encabezado si:
  1. va entera entre corchetes: `[Coro – romántico]`;
  2. va entre paréntesis y lleva una raya (– o —) o un « - »: `(Schluss – Chor a cappella)`, `(Métrica 7–10 sílabas)`;
  3. va entre paréntesis y lo de dentro empieza por una palabra de sección: `(Intro – Voce profonda, con eco)`, `(Lei)`;
  4. sin paréntesis, empieza por una palabra de sección: `Verso 1`, `Pre‑Coro`, `Coro final`, `Finaler Refrain`, `Sie:`, `VERSO 1 — Voce maschile`.

  Palabras de sección: intro, outro, verso, verse, strofa, strophe, coro, chorus, ritornello,
  refrain, refrán, estribillo, puente, bridge, ponte, brücke, pre-coro/pre-chorus/pre-ritornello/
  pre-refrain (con cualquier guion o espacio), interludio, interlude, zwischenspiel, instrumental,
  hook, final, finale, finaler, hablado, spoken, parlato, gesprochen, schluss, chiusura, cierre y los
  rótulos de voz de los duetos (lei, lui, entrambi, ella, él, ambos, sie, er, beide, duetto, dueto,
  duet, chor, hintergrund, background). Puede ir seguida de otra palabra de sección
  (`Finaler Refrain`), de un número, de un calificativo (final, finale, finales, largo, corto,
  doble, xN) y de `:`, `– detalle` o `(detalle)`; 60 caracteres como mucho. También es encabezado la primera línea si lleva « – » o « — » y no pasa de 90
  caracteres (`Dietro la Maschera” – Versione Cantabile in Italiano`).
  El emoji decorativo del principio se quita (`🎶 [Coro]` → `[Coro]`) para que la app lo reconozca.
  Lo que va entre paréntesis sin palabra de sección **sí se canta** (coros de fondo de Suno,
  como `(Metto il divino, l’amore per primo)`) y se alinea como un verso.
- **Versos largos**: hay letras escritas como párrafos (un «verso» de 300 caracteres). Una línea
  de más de 72 caracteres se parte en frases (tras `. ! ? …` seguido de mayúscula) y, si aún es
  larga, por comas. `--sin-partir` lo desactiva.
- **Idioma**: la etiqueta dice `lyrics-eng` aunque la letra sea española, italiana o alemana, así
  que se detecta por las palabras frecuentes del texto (es, it, de, en, fr, pt); si el resultado
  es dudoso, Whisper lo detecta en el audio.

## Avisos del resumen

Al final se lista cada canción con idioma, número de versos y tiempo (en una RTX 3050 Ti de
4 GB, alrededor de un minuto por canción; en CPU es bastante más lento). Avisos posibles: la
letra cubre poco de la canción (letra incompleta en la etiqueta), el primer verso empieza en
0:00, varios versos sin separación entre sí, versos que stable-ts no pudo alinear y, con
`--verificar`, los versos en los que lo transcrito no coincide con la letra. Un aviso no
significa que el `.lrc` esté mal, sino que conviene escuchar ese tramo. Las canciones sin letra
se saltan.
