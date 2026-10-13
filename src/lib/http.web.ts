import { isTauri } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

/**
 * En escritorio la petición la hace Rust (plugin HTTP de Tauri): la vista pública de la
 * carpeta de Drive no envía cabeceras CORS y el WebView la bloquearía.
 */
export const appFetch: typeof fetch = (input, init) =>
  isTauri() ? tauriFetch(input, init) : fetch(input, init);
