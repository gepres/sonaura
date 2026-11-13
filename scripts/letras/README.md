# Letras sincronizadas (`.lrc`)

`alinear.py` genera un `.lrc` por canción a partir de la letra que Suno guarda en la etiqueta
ID3 del MP3 (`TXXX` «lyrics-…» o `USLT`), alineándola con el audio mediante alineación forzada
(stable-ts sobre Whisper). Es una herramienta local: no forma parte de la app.

## Instalación (una vez)

Necesita Python 3.12 y `ffmpeg` en el PATH. El entorno va en C: (pesa unos 5 GB con PyTorch) y los
modelos se descargan solos la primera vez: Whisper `large-v3-turbo` (~1,6 GB) en
`%USERPROFILE%\.cache\whisper`; con `--transcribir`, además `large-v3` (~3 GB, mismo sitio) y
Demucs (~80 MB, caché de Hugging Face).

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
| `--transcribir` | Transcribe con IA las canciones **sin** letra (ver «Canciones sin letra»); sin esta opción se saltan. |
| `--modelo-transcripcion` | Modelo para transcribir (por defecto `large-v3-turbo`). |
| `--contraste NOMBRE` | Segundo modelo para medir la confianza (por defecto `large-v3`; `ninguno` lo omite y va el doble de rápido). |
| `--sin-separar` | Transcribe la mezcla tal cual, sin aislar la voz (peor: ver abajo). |
| `--desde-txt` | Tras revisar una transcripción: usa la letra corregida del `.txt` y regenera el `.lrc` (ver «Después de revisar»). |

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

## Canciones sin letra: `--transcribir`

```powershell
& $py scripts\letras\alinear.py --transcribir      # alinea las que tienen letra y transcribe las que no
```

Para los MP3 sin letra en la etiqueta (y sin `.lrc` ya hecho), al final de la pasada:

1. **Aísla la voz** con Demucs (`htdemucs`, en GPU) y la guarda en `cache\voz\` (16 kHz, mono).
2. **Transcribe** la voz aislada con Whisper `large-v3-turbo`, con VAD (Silero) y sin arrastrar el
   texto anterior entre ventanas (evita bucles). El idioma se detecta del audio, en los 30 s con
   más voz (el principio suele ser instrumental).
3. **Filtra** lo que Whisper se inventa: frases típicas de tramos sin voz («Gracias por ver»,
   «Suscríbete», «Amara.org», «Música», «¡Gracias!»…), segmentos sin voz (`no_speech_prob` > 0,6
   **y** `avg_logprob` < −0,5), de confianza muy baja (`avg_logprob` < −1), con palabras
   improbables (probabilidad media < 0,1), repetitivos (`compression_ratio` > 2,4) y bucles (el
   mismo texto por tercera vez seguida). `no_speech_prob` solo no sirve con voz cantada:
   large-v3 dio 0,76–0,97 en estrofas transcritas a la perfección y turbo da siempre ~0.
4. **Agrupa en versos**: corta en las pausas (≥ 0,6 s), tras punto, antes de `¿`/`¡` y al cambiar
   de segmento, sin pasar de 60 caracteres (si no cabe, corta en la última coma).
5. Con menos de 15 palabras útiles la canción se da por **instrumental**: no se escribe nada
   (y se vuelve a intentar en la siguiente pasada con `--transcribir`).
6. Escribe `<nombre>.lrc` con la cabecera `[by:Transcripción automática (Whisper), revisar]` y
   `<nombre>.txt` con la letra en texto plano para revisarla: `[?]` detrás de las palabras con
   probabilidad < 0,4 y una línea en blanco entre estrofas (silencios ≥ 4 s).
7. **Confianza**: vuelve a transcribir con `large-v3` y da el porcentaje de coincidencia palabra
   a palabra entre los dos modelos. Por debajo del 60 % avisa de revisar la letra entera.

Los modelos se cargan de uno en uno (large-v3 en fp16 ocupa ~3,4 GB de VRAM, justo en 4 GB) y
sin pasar por la RAM: el punto de control se abre con mmap y el modelo se crea directamente en
la GPU en fp16. Los `.lrc`/`.txt` se escriben en cuanto termina el modelo principal; si el
contraste falla o el equipo va justo de memoria, no se pierden (`--contraste ninguno` se lo
salta del todo).

Por qué esta configuración (medido con «Caminar descalzo», cuya letra real se conoce: 373
palabras; WER = palabras mal sobre el total):

| | mezcla sin separar | voz aislada (Demucs) |
| --- | --- | --- |
| `large-v3-turbo` | WER 23 % · 15 s | **WER 3 %** · 35 s · 1,6 GB VRAM |
| `large-v3` | WER 23 % · 41 s | WER 3 % · 49 s · 3,4 GB VRAM |

En una salsa (`track-1-salsa`) sin separar la voz solo salen 125 palabras; con la voz aislada,
337 (turbo) y 305 (large-v3, que además se saltó 0:11–0:33 y escribió «Gracias.» en su lugar).
Por eso: voz aislada siempre, turbo como modelo principal (igual de preciso, más completo y
3 veces más rápido) y large-v3 como contraste.

**Ojo: a veces turbo se salta un tramo entero.** En `track-4` dejó fuera la intro hablada
(0:00–0:30, ocho frases que large-v3 oyó con probabilidad 0,96–1,00). Si la letra empieza tarde o
hay un hueco largo con voz, compara con large-v3 en ese tramo.

### Después de revisar: `--desde-txt`

La app lee el `.lrc`, no el `.txt`. Cuando se corrige el `.txt` (palabras, versos que faltaban,
estribillos que el filtro quitó), se regenera el `.lrc` de esa canción:

```powershell
& $py scripts\letras\alinear.py --desde-txt --forzar --solo "track-2"
```

Usa las líneas del `.txt` tal cual (sin los `[?]`) y las alinea con la voz aislada. Las líneas que
no cambiaron (o que cambiaron de palabras pero siguen en su sitio) **conservan el tiempo del `.lrc`
anterior**, que viene de los tiempos por palabra y es más fiable: realinear a veces junta dos
versos. Las líneas nuevas toman el tiempo de la alineación. El `.lrc` queda con la cabecera
`[by:Letra revisada a mano; tiempos alineados con Whisper]`.

## Avisos del resumen

Al final se lista cada canción con idioma, número de versos y tiempo (en una RTX 3050 Ti de
4 GB, alrededor de un minuto por canción; en CPU es bastante más lento). Avisos posibles: la
letra cubre poco de la canción (letra incompleta en la etiqueta), el primer verso empieza en
0:00, varios versos sin separación entre sí, versos que stable-ts no pudo alinear y, con
`--verificar`, los versos en los que lo transcrito no coincide con la letra. Un aviso no
significa que el `.lrc` esté mal, sino que conviene escuchar ese tramo. Las canciones sin letra
se saltan, salvo con `--transcribir`: entonces el resumen da idioma, versos, confianza (coincidencia
entre los dos modelos), palabras dudosas y segmentos descartados, o «instrumental».
