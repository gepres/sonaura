import { Directory, File, FileMode, Paths } from 'expo-file-system';

import type { FileKind, FileStore } from './fileStore.types';

const dir = (kind: FileKind) => new Directory(Paths.document, 'sonaura', kind);
const file = (kind: FileKind, fileName: string) => new File(dir(kind), fileName);

/** Android / iOS: expo-file-system, en la carpeta de documentos de la app. */
export const fileStore: FileStore = {
  supported: true,
  init: async () => {},
  ensureDirs: async () => {
    for (const kind of ['tracks', 'covers'] as const) {
      const d = dir(kind);
      if (!d.exists) d.create({ intermediates: true, idempotent: true });
    }
  },
  download: async (kind, url, fileName, opts) => {
    const onProgress = opts?.onProgress;
    const result = await File.downloadFileAsync(url, file(kind, fileName), {
      idempotent: true,
      signal: opts?.signal,
      onProgress: onProgress
        ? ({ bytesWritten, totalBytes }) => {
            if (totalBytes > 0) onProgress(bytesWritten / totalBytes);
          }
        : undefined,
    });
    return result.size ?? 0;
  },
  readHead: async (kind, fileName, length) => {
    const handle = file(kind, fileName).open(FileMode.ReadOnly);
    try {
      return handle.readBytes(length);
    } finally {
      handle.close();
    }
  },
  exists: async (kind, fileName) => file(kind, fileName).exists,
  remove: async (kind, fileName) => {
    const f = file(kind, fileName);
    if (f.exists) f.delete();
  },
  uri: (kind, fileName) => file(kind, fileName).uri,
};
