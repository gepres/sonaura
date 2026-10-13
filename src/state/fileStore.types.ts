/** Carpetas de la app: canciones descargadas y portadas guardadas. */
export type FileKind = 'tracks' | 'covers';

/**
 * Almacenamiento de archivos de la plataforma. Móvil: expo-file-system (fileStore.ts).
 * Escritorio: Tauri (fileStore.web.ts). Los nombres de archivo son relativos a la carpeta
 * de su tipo; las rutas absolutas no se persisten nunca.
 */
export interface FileStore {
  /** Si se pueden descargar archivos en esta plataforma (en un navegador normal, no). */
  readonly supported: boolean;
  /** Prepara rutas base. Se espera antes de pintar la app; luego `uri()` es síncrono. */
  init(): Promise<void>;
  ensureDirs(): Promise<void>;
  /**
   * Descarga `url` en `kind/fileName` y devuelve los bytes escritos.
   * Rechaza si `signal` se aborta; `onProgress` recibe 0..1 cuando se conoce el total.
   */
  download(
    kind: FileKind,
    url: string,
    fileName: string,
    opts?: { signal?: AbortSignal; onProgress?: (ratio: number) => void },
  ): Promise<number>;
  /** Primeros `length` bytes del archivo (para validar que no es una página HTML). */
  readHead(kind: FileKind, fileName: string, length: number): Promise<Uint8Array>;
  exists(kind: FileKind, fileName: string): Promise<boolean>;
  remove(kind: FileKind, fileName: string): Promise<void>;
  /** URI reproducible / mostrable por la plataforma. Síncrono (requiere `init()`). */
  uri(kind: FileKind, fileName: string): string;
}
