# Estadísticas de escucha · PostHog

Para saber qué música se escucha más, cuál se completa o se salta y cuál se marca como favorita, en la
web, en Windows y en Android. Tarjeta SRMAI-19.

**Decidido por el dueño (2026-11-13):** los eventos van al proyecto de PostHog que ya usa Repaso
energético (región US). El plan gratis admite un solo proyecto. Para separarlos se filtra por
`app = sonaura`; los nombres de evento, además, son propios de Sonaura. Si algún día se crea un proyecto
aparte, basta con cambiar `EXPO_PUBLIC_POSTHOG_KEY` y volver a generar las apps.

## Cómo funciona

| Archivo | Qué hace |
|---|---|
| `src/analytics/listens.ts` | Decide cuándo una pista cuenta como escuchada, completa o saltada. Lógica pura, con pruebas. |
| `src/analytics/client.ts` | Cliente mínimo de la API de captura (`POST /batch/`): cola guardada, lotes de 50, reintentos. |
| `src/analytics/platform(.web).ts` | Plataforma, sistema y si se mide aquí; en la web, el proxy `/pulso`. |
| `src/analytics/index.ts` | `track()`, `trackSong()` y el contador de escuchas que usa el reproductor. |

- **Sin SDK.** No usa `posthog-js` ni `posthog-react-native`: solo hacen falta eventos (sin grabaciones
  ni mapas de calor). Es el mismo código en las tres plataformas y no añade módulos nativos.
- **Anónimo.** Un identificador aleatorio por instalación (o por navegador) y
  `$process_person_profile: false`: PostHog no crea perfiles de persona. No se manda nada personal.
- **Sin conexión.** Los eventos esperan en una cola guardada (`sonaura.analytics.v1`) y salen al volver
  la red; si la app se cierra antes, salen en la siguiente apertura. Cada evento lleva un `uuid` y un
  reintento no lo duplica.
- **En la web** los envíos pasan por el propio dominio, `/pulso/*` (regla en `public/_redirects`), para
  que los bloqueadores no los corten. Se mide solo en `sonaura.genaropretill.com` y
  `sonaura-app.netlify.app`, y no si el navegador pide «no rastrear» (DNT o GPC).
- **En Windows y Android** van directos a `us.i.posthog.com` (la CSP de Tauri lo permite).
- **No se mide** en desarrollo (`__DEV__`) ni si falta la clave.

Para probar un build de la web en local: en la consola del navegador,
`localStorage.setItem('sonaura.analytics', 'forzar')` y recargar. Para que un navegador no mida:
`localStorage.setItem('sonaura.analytics', 'no')`.

## Eventos

| Evento | Cuándo | Propiedades propias |
|---|---|---|
| `app_abierta` | Al abrir la app o la web | — |
| `cancion_escuchada` | 30 s de escucha real (la mitad si la canción dura menos de 1 min). Saltar con la barra no suma. Repetir una canción cuenta otra vez. | canción, `segundos`, `duracion`, `sin_conexion` |
| `cancion_completa` | Llegó al final habiendo escuchado al menos el 80 % | ídem |
| `cancion_saltada` | Pasó a otra antes de contar como escuchada (si llegó a sonar) | ídem |
| `favorito_agregado` · `favorito_quitado` | Al tocar el corazón | canción |
| `cancion_guardada` | Terminó de descargarse para escuchar sin conexión (Android y Windows) | canción |
| `descargas_vista` | Se abre la página `/descargar` (web) | `sistema_visitante` |
| `app_descargada` | Se toca un botón de descarga (web) | `sistema`: `android`, `androidUniversal` o `windows` |

**Propiedades de canción:** `cancion` (título), `album`, `cancion_id`, `album_id` (ids de Drive).

**Propiedades de todos los eventos:** `app` (`sonaura`), `plataforma` (`web`, `windows`, `android`),
`version`, `$os`, `$device_type` y, en la web, `$host`.

## Ver el ranking en PostHog

En PostHog: **Product analytics → New insight → Trends**.

1. **Lo más escuchado.** Serie `cancion_escuchada` · *Total count*. *Breakdown by* `cancion` (o `album`). Filtro
   `app = sonaura`. Vista **Table** (o *Bar chart*). Rango: últimos 30 días o *All time*.
2. **Cuántas personas lo escuchan.** Lo mismo con *Unique users* en vez de *Total count*.
3. **Favoritos.** Dos series, `favorito_agregado` y `favorito_quitado`, con *Breakdown by* `cancion` y la
   fórmula `A - B` (*Formula mode*): el saldo de corazones por canción.
4. **Qué gusta y qué no.** `cancion_completa` frente a `cancion_saltada` con *Breakdown by* `cancion`; la
   fórmula `A / (A + B)` da la tasa de canciones completas.
5. **Desde dónde se escucha.** `cancion_escuchada` con *Breakdown by* `plataforma`.
6. **Descargas de la app.** `app_descargada` con *Breakdown by* `sistema`.

Guarda cada insight en un dashboard «Sonaura».
