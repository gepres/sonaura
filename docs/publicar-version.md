# Publicar una versión (Android y Windows)

La web (`/descargar`) enlaza a `https://github.com/gepres/sonaura/releases/latest/download/<archivo>`.
GitHub sirve ahí el archivo de la **última release**, así que la web no se toca en cada versión, siempre
que los archivos se llamen igual:

| Archivo | Qué es |
|---|---|
| `Sonaura-android.apk` | Android, teléfonos de 64 bits (arm64-v8a): casi todos los actuales |
| `Sonaura-android-universal.apk` | Android, todas las arquitecturas (32 bits, Chromebooks, emuladores) |
| `Sonaura-windows-setup.exe` | Instalador de Windows (NSIS, por usuario, sin permisos de administrador) |

## Pasos

1. **Versión.** Súbela en `app.json` (`version` y `android.versionCode`, que siempre crece),
   `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y `package.json`.
2. **Android.** `node scripts/release-android.mjs`: aplica `app.json` (`expo prebuild`), compila los dos
   APK y los firma con la clave propia. Salen en `dist/release/`.
3. **Windows.** `npm run desktop:build` y copia
   `src-tauri/target/release/bundle/nsis/Sonaura_<versión>_x64-setup.exe` a
   `dist/release/Sonaura-windows-setup.exe`.
4. **Release.** Con el código ya subido:
   `gh release create v<versión> dist/release/Sonaura-android.apk dist/release/Sonaura-android-universal.apk dist/release/Sonaura-windows-setup.exe --title "Sonaura <versión>" --notes "…"`
5. **Web.** Despliégala **después** de publicar la release (si no, los botones de descarga darían 404):
   `npx netlify-cli deploy --prod --site sonaura-app` (el build de `netlify.toml` usa `.env.local`). La
   página de descargas lee la versión y los tamaños de la API de GitHub.

## La clave de firma de Android

- Vive **fuera del repo**, en `%USERPROFILE%\.sonaura-firma\`: `sonaura-release.jks` y
  `sonaura-release.properties` (alias y contraseña). Otra carpeta: variable `SONAURA_FIRMA`.
- **Respáldala** (los dos archivos) en un gestor de contraseñas o un disco aparte. Si se pierde, las
  versiones nuevas no se instalarán encima de las que ya tiene la gente: habría que desinstalar y se
  perderían favoritos y descargas.
- Se creó el 2026-11-13. Huella SHA-256 del certificado:
  `97:A9:22:78:21:FD:81:D4:DD:41:52:AD:79:D5:8B:F5:DA:19:19:F8:8B:55:B5:55:44:48:D7:73:DD:7D:F2:E2`.
- Hasta la 1.0.0 los APK iban firmados con la clave de depuración de la plantilla. Quien tenga esa
  versión debe desinstalarla una vez antes de instalar la 1.1.0 («App no instalada» si no).
- Para Google Play haría falta subir un AAB a la consola con esta clave como clave de subida (o EAS):
  tarjeta SRMAI-7.

## Avisos al instalar

- **Android:** pide permitir «Instalar apps desconocidas» para el navegador. Es normal fuera de Play.
- **Windows:** SmartScreen avisa («Windows protegió su PC») porque el instalador no lleva firma de
  código. «Más información» → «Ejecutar de todas formas». Firmarlo requiere un certificado de firma de
  código (de pago) o Azure Trusted Signing.
