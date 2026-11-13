# Sonaura

**Tu música, tu energía.** Reproductor MP3 para Android, Windows y la web que lee la música directamente
de una carpeta pública de Google Drive, con favoritos, letra y escucha sin conexión.

Web: https://sonaura.genaropretill.com · Apps: https://sonaura.genaropretill.com/descargar

- Catálogo en vivo desde Drive: cada subcarpeta es un álbum y su `cover.*` es la portada; los MP3
  sueltos de la raíz forman el álbum «Sueltos».
- Streaming con barra de progreso, cola, aleatorio, repetir (todo / una) y temporizador de apagado.
- Sigue sonando con la pantalla apagada, con controles en la notificación y en la pantalla de bloqueo.
- Favoritos que se guardan en el dispositivo.
- Descarga de canciones o álbumes completos para escucharlos en modo avión.
- Búsqueda, mezcla aleatoria de toda la biblioteca y reanudación de la última sesión.
- Letra en el reproductor: la que trae el MP3 (Suno la guarda en la etiqueta ID3) o, si junto a la
  canción en Drive hay un `.lrc` con el mismo nombre, sincronizada (resalta el verso y salta al tocarlo).
- Estadísticas anónimas de escucha (PostHog): qué se escucha, completa, salta y marca como favorito.
  Ver [docs/estadisticas.md](docs/estadisticas.md).

## Stack

Expo SDK 57 · React Native 0.86 · TypeScript · expo-router · expo-audio · expo-file-system · zustand.

## Desarrollo

```bash
npm install
npm run android        # build de desarrollo en un emulador o dispositivo Android
npm test               # tests (cola de reproducción y catálogo de Drive)
npm run typecheck
npm run lint
npm run icons          # regenera iconos y splash desde assets/brand/icon.svg
```

La app usa módulos nativos (audio en segundo plano, archivos), así que **no funciona en Expo Go**:
hace falta una build de desarrollo (`npm run android`, o `npx eas-cli@latest build --profile development`).

iOS no se puede compilar en Windows: se usa EAS Build en la nube (requiere cuenta Apple Developer).

## APK e instalador para publicar

```bash
node scripts/release-android.mjs   # APK arm64 y universal, firmados con la clave propia → dist/release/
```

La clave de firma vive fuera del repo (`%USERPROFILE%\.sonaura-firma\`). Los APK y el instalador de
Windows se publican en GitHub Releases con nombres fijos, y la web los enlaza desde `/descargar`. Todo
el proceso: [docs/publicar-version.md](docs/publicar-version.md).

## Escritorio (Windows)

La misma app, exportada a web con Expo y envuelta en una ventana nativa con [Tauri v2](https://tauri.app)
(WebView2). Requisitos: Rust (`rustup`) y las herramientas de C++ de Visual Studio.

```bash
npm run desktop:build   # exporta la web y genera el instalador en src-tauri/target/release/bundle/nsis/
npm run desktop:dev     # ventana de desarrollo con recarga en caliente
```

- La carpeta de Drive se lee desde Rust (plugin HTTP de Tauri): la vista pública no admite CORS.
- Teclas multimedia y el control multimedia de Windows funcionan vía Media Session.
- Atajos: Espacio (reproducir/pausar), Ctrl+→ / Ctrl+← (siguiente/anterior).
- Las descargas se guardan en `%APPDATA%\digital.collie.sonaura\sonaura\`.

## Configuración

Copia `.env.example` a `.env.local` si necesitas cambiar algo:

| Variable | Para qué |
|---|---|
| `EXPO_PUBLIC_DRIVE_FOLDER_ID` | Carpeta pública de Drive con la música. |
| `EXPO_PUBLIC_DRIVE_API_KEY` | Opcional. Usa la Drive API v3 en lugar de la vista pública embebida. |
| `EXPO_PUBLIC_DRIVE_WEB_API_KEY` | Web en el navegador: clave de Drive restringida por dominio. |
| `EXPO_PUBLIC_POSTHOG_KEY` | Estadísticas de escucha (clave pública `phc_…`). Sin ella no se mide. |

La carpeta debe estar compartida como «Cualquier persona con el enlace».

## Estructura

```
src/app/          pantallas (expo-router): Inicio, Favoritos, Sin conexión, Álbum, Reproductor
src/catalog/      lectura de la carpeta de Drive → álbumes y pistas
src/player/       cola (funciones puras) y motor de reproducción
src/state/        biblioteca, favoritos, descargas y red (zustand persistido)
src/lyrics/       letra: etiqueta ID3 del MP3, formato LRC y caché
src/analytics/    estadísticas de escucha (PostHog)
src/components/   UI reutilizable
assets/brand/     SVG fuente del icono
```
