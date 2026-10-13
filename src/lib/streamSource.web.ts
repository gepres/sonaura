import { convertFileSrc, isTauri } from '@tauri-apps/api/core';

import type { Track } from '@/catalog';

/**
 * Drive responde 403 a un `<audio>` de otro origen (el navegador envía `Sec-Fetch-Site:
 * cross-site` y no se puede quitar). En escritorio el audio pasa por el protocolo `drive://`
 * de la app, que hace la petición desde Rust; en Windows queda `http://drive.localhost/<id>`.
 */
export const streamSource = (track: Track): string =>
  isTauri() ? convertFileSrc(track.id, 'drive') : track.streamUrl;
