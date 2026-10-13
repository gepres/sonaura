# Sonaura

**Tu música, tu energía.** Reproductor MP3 para Android e iOS que lee la música directamente de una
carpeta pública de Google Drive, con favoritos y escucha sin conexión.

- Catálogo en vivo desde Drive: cada subcarpeta es un álbum y su `cover.*` es la portada; los MP3
  sueltos de la raíz forman el álbum «Sueltos».
- Streaming con barra de progreso, cola, aleatorio, repetir (todo / una) y temporizador de apagado.
- Sigue sonando con la pantalla apagada, con controles en la notificación y en la pantalla de bloqueo.
- Favoritos que se guardan en el dispositivo.
- Descarga de canciones o álbumes completos para escucharlos en modo avión.
- Búsqueda, mezcla aleatoria de toda la biblioteca y reanudación de la última sesión.

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

## APK para instalar a mano

```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease     # en Windows: gradlew.bat assembleRelease
```

El APK sale en `android/app/build/outputs/apk/release/app-release.apk`: universal (~110 MB) y con el
JavaScript empaquetado, así que funciona sin Metro. Para uno más ligero solo para teléfonos, añade
`-PreactNativeArchitectures=arm64-v8a,armeabi-v7a`.

Va firmado con la clave de depuración de la plantilla: sirve para instalarlo en un teléfono (activando
«Instalar apps desconocidas»), **no para Play Store**. Para la tienda hace falta una clave propia o EAS.

## Configuración

Copia `.env.example` a `.env.local` si necesitas cambiar algo:

| Variable | Para qué |
|---|---|
| `EXPO_PUBLIC_DRIVE_FOLDER_ID` | Carpeta pública de Drive con la música. |
| `EXPO_PUBLIC_DRIVE_API_KEY` | Opcional. Usa la Drive API v3 en lugar de la vista pública embebida. |

La carpeta debe estar compartida como «Cualquier persona con el enlace».

## Estructura

```
src/app/          pantallas (expo-router): Inicio, Favoritos, Sin conexión, Álbum, Reproductor
src/catalog/      lectura de la carpeta de Drive → álbumes y pistas
src/player/       cola (funciones puras) y motor de reproducción
src/state/        biblioteca, favoritos, descargas y red (zustand persistido)
src/components/   UI reutilizable
assets/brand/     SVG fuente del icono
```
