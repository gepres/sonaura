import { isTauri } from '@tauri-apps/api/core';

import { apiMediaUrl, streamUrl } from '@/catalog';
import { DRIVE_WEB_API_KEY } from '@/lib/driveWebKey';
import { appFetch } from '@/lib/http';

/**
 * Archivos de Drive pedidos desde la web o el escritorio, como el audio (ver streamSource.web):
 * - Escritorio: la petición la hace Rust (plugin HTTP de Tauri), sin CORS.
 * - Navegador: la API v3 de Drive con la clave web, que sí envía CORS.
 */
function url(fileId: string): string {
  if (!isTauri() && DRIVE_WEB_API_KEY) return apiMediaUrl(fileId, DRIVE_WEB_API_KEY);
  return streamUrl(fileId);
}

export async function fetchDriveBytes(fileId: string, length: number): Promise<Uint8Array> {
  const res = await appFetch(url(fileId), { headers: { Range: `bytes=0-${length - 1}` } });
  if (!res.ok) throw new Error(`Drive respondió ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function fetchDriveText(fileId: string): Promise<string> {
  const res = await appFetch(url(fileId));
  if (!res.ok) throw new Error(`Drive respondió ${res.status}`);
  return res.text();
}
