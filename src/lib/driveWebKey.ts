/**
 * Clave de la API v3 de Drive para la web abierta en un navegador (no la de escritorio).
 *
 * Va restringida por dominio (HTTP referrer) en Google Cloud: Google solo la acepta si la
 * petición trae el Referer de la web. Desde Rust (Tauri) o desde el móvil no lo lleva y daría
 * 403, así que solo la importan los archivos `.web.ts` y solo cuando no hay Tauri. Es pública
 * por diseño (va en el bundle): lo que la protege es la restricción por dominio.
 */
export const DRIVE_WEB_API_KEY = process.env.EXPO_PUBLIC_DRIVE_WEB_API_KEY?.trim() ?? '';
