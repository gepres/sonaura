import { isTauri } from '@tauri-apps/api/core';

import { createApiSource, createDefaultSource, type FolderSource } from '@/catalog';
import { DRIVE_WEB_API_KEY } from '@/lib/driveWebKey';
import { appFetch } from '@/lib/http';

/**
 * En escritorio, la de siempre: la petición la hace Rust y no hay CORS. En un navegador la
 * vista embebida de Drive no envía CORS y se bloquea; se lista con la API v3 y la clave web,
 * que sí lo envía.
 */
export function catalogSource(): FolderSource {
  if (!isTauri() && DRIVE_WEB_API_KEY) return createApiSource(DRIVE_WEB_API_KEY);
  return createDefaultSource(appFetch);
}
