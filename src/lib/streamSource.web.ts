import { convertFileSrc, isTauri } from '@tauri-apps/api/core';

import { apiMediaUrl, type Track } from '@/catalog';
import { DRIVE_WEB_API_KEY } from '@/lib/driveWebKey';

/**
 * Drive responde 403 a un `<audio>` de otro origen (el navegador envía `Sec-Fetch-Site:
 * cross-site` y no se puede quitar).
 * - Escritorio: el audio pasa por el protocolo `drive://` de la app, que hace la petición desde
 *   Rust; en Windows queda `http://drive.localhost/<id>`.
 * - Navegador: la API v3 de Drive sí lo sirve (CORS y Range) con la clave web.
 */
export function streamSource(track: Track): string {
  if (isTauri()) return convertFileSrc(track.id, 'drive');
  return DRIVE_WEB_API_KEY ? apiMediaUrl(track.id, DRIVE_WEB_API_KEY) : track.streamUrl;
}
