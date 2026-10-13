import { convertFileSrc, isTauri } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { exists, mkdir, open, remove, writeFile } from '@tauri-apps/plugin-fs';
import { fetch } from '@tauri-apps/plugin-http';

import type { FileKind, FileStore } from './fileStore.types';

const supported = isTauri();
const unsupportedMessage = 'Las descargas solo están disponibles en la app de escritorio';
let directories: Record<FileKind, string> | undefined;
let initPromise: Promise<void> | undefined;

function init(): Promise<void> {
  if (!supported) return Promise.resolve();
  initPromise ??= (async () => {
    const base = await appDataDir();
    const [tracks, covers] = await Promise.all([
      join(base, 'sonaura', 'tracks'),
      join(base, 'sonaura', 'covers'),
    ]);
    directories = { tracks, covers };
  })();
  return initPromise;
}

// Los nombres son relativos; las carpetas ya están resueltas por Tauri.
// Concatenar aquí permite que uri() siga siendo síncrono en Windows y POSIX.
function filePath(kind: FileKind, fileName: string): string {
  const directory = directories?.[kind];
  if (!directory) return '';
  const separator = directory.includes('\\') ? '\\' : '/';
  return `${directory}${separator}${fileName}`;
}

function assertSupported(): void {
  if (!supported) throw new Error(unsupportedMessage);
}

function abortError(): Error {
  const error = new Error('La descarga se ha cancelado');
  error.name = 'AbortError';
  return error;
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

async function removeIfExists(path: string): Promise<void> {
  if (!(await exists(path))) return;
  try {
    await remove(path);
  } catch (error) {
    // Puede desaparecer entre exists() y remove(). Otros errores se propagan.
    if (await exists(path)) throw error;
  }
}

/** Web de escritorio: HTTP y archivos pasan por el backend de Tauri. */
export const fileStore: FileStore = {
  supported,
  init,
  ensureDirs: async () => {
    if (!supported) return;
    await init();
    await Promise.all([
      mkdir(directories!.tracks, { recursive: true }),
      mkdir(directories!.covers, { recursive: true }),
    ]);
  },
  download: async (kind, url, fileName, opts) => {
    assertSupported();
    const signal = opts?.signal;
    checkAborted(signal);
    await init();
    const path = filePath(kind, fileName);
    let body: ReadableStream<Uint8Array> | null = null;
    let stream: ReadableStream<Uint8Array> | undefined;
    let writeStarted = false;
    try {
      checkAborted(signal);
      const response = await fetch(url, { signal });
      body = response.body;
      checkAborted(signal);
      if (!response.ok) throw new Error(`Error de descarga (HTTP ${response.status})`);

      const total = Number(response.headers.get('Content-Length'));
      let received = 0;
      const counter = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          checkAborted(signal);
          received += chunk.byteLength;
          if (total > 0 && Number.isFinite(total)) opts?.onProgress?.(received / total);
          checkAborted(signal);
          controller.enqueue(chunk);
        },
      });
      // Un 204/205 tiene cuerpo nulo: se guarda un archivo vacío, igual que en móvil.
      const source = body ?? new ReadableStream<Uint8Array>({ start: (controller) => controller.close() });
      stream = source.pipeThrough(counter, { signal });
      writeStarted = true;
      // writeFile cierra su handle antes de resolver o rechazar: después se puede borrar.
      await writeFile(path, stream);
      checkAborted(signal);
      return received;
    } catch (error) {
      // También libera el cuerpo HTTP si falla la apertura o escritura del archivo.
      await (stream ?? body)?.cancel().catch(() => {});
      if (writeStarted) await remove(path).catch(() => {});
      throw signal?.aborted ? abortError() : error;
    }
  },
  readHead: async (kind, fileName, length) => {
    assertSupported();
    await init();
    const handle = await open(filePath(kind, fileName), { read: true });
    try {
      const buffer = new Uint8Array(length);
      let received = 0;
      while (received < buffer.length) {
        const count = await handle.read(buffer.subarray(received));
        if (count === null || count === 0) break;
        received += count;
      }
      return buffer.slice(0, received);
    } finally {
      await handle.close();
    }
  },
  exists: async (kind, fileName) => {
    if (!supported) return false;
    await init();
    return exists(filePath(kind, fileName));
  },
  remove: async (kind, fileName) => {
    if (!supported) return;
    await init();
    await removeIfExists(filePath(kind, fileName));
  },
  uri: (kind, fileName) => {
    if (!supported) return '';
    const path = filePath(kind, fileName);
    return path ? convertFileSrc(path) : '';
  },
};
