import { Directory, File, Paths } from 'expo-file-system';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Track } from '@/catalog';
import { persistStorage } from '@/state/storage';

type DownloadRecord = {
  track: Track;
  /** Solo el nombre: en iOS la ruta absoluta del contenedor cambia entre actualizaciones. */
  fileName: string;
  bytes: number;
  downloadedAt: number;
};

type DownloadsState = {
  items: Record<string, DownloadRecord>;
  /** albumId → nombre del archivo de portada guardado. */
  covers: Record<string, string>;
  /** Descargas en cola o en curso: id → progreso 0..1. */
  progress: Record<string, number>;
  failed: Record<string, string>;
  enqueue: (tracks: Track[]) => void;
  cancel: (id: string) => void;
  remove: (ids: string[]) => void;
  reconcile: () => void;
};

const MAX_PARALLEL = 2;
const pending: Track[] = [];
const active = new Map<string, AbortController>();

const baseDir = () => new Directory(Paths.document, 'sonaura');
const tracksDir = () => new Directory(baseDir(), 'tracks');
const coversDir = () => new Directory(baseDir(), 'covers');

function ensureDirs() {
  for (const dir of [baseDir(), tracksDir(), coversDir()]) {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  }
}

function fileNameFor(track: Track): string {
  const ext = /\.([a-z0-9]{2,4})$/i.exec(track.fileName)?.[1]?.toLowerCase() ?? 'mp3';
  return `${track.id}.${ext}`;
}

/** Drive devuelve una página HTML (no el audio) cuando limita la descarga de un archivo. */
async function assertIsAudio(file: File) {
  const size = file.size ?? 0;
  if (size === 0) throw new Error('Descarga vacía');
  if (size < 256 * 1024) {
    const head = (await file.text()).slice(0, 512).toLowerCase();
    if (head.includes('<html') || head.includes('<!doctype')) {
      throw new Error('Drive limitó la descarga, inténtalo más tarde');
    }
  }
}

export const useDownloads = create<DownloadsState>()(
  persist(
    (set, get) => {
      const setProgress = (id: string, value: number) => {
        const rounded = Math.round(value * 100) / 100;
        if (get().progress[id] === rounded) return;
        set((s) => (id in s.progress ? { progress: { ...s.progress, [id]: rounded } } : s));
      };

      const finish = (id: string, patch: Partial<Pick<DownloadsState, 'items' | 'failed'>> = {}) => {
        active.delete(id);
        set((s) => {
          const progress = { ...s.progress };
          delete progress[id];
          return { ...patch, progress };
        });
        pump();
      };

      const saveCover = async (track: Track) => {
        if (!track.artworkUrl || get().covers[track.albumId]) return;
        const fileName = `${track.albumId}.jpg`;
        try {
          await File.downloadFileAsync(track.artworkUrl, new File(coversDir(), fileName), { idempotent: true });
          set((s) => ({ covers: { ...s.covers, [track.albumId]: fileName } }));
        } catch {
          // La portada es opcional: sin ella se usa el arte generado.
        }
      };

      const start = async (track: Track) => {
        const controller = new AbortController();
        active.set(track.id, controller);
        const dest = new File(tracksDir(), fileNameFor(track));
        try {
          ensureDirs();
          if (dest.exists) dest.delete();
          const file = await File.downloadFileAsync(track.streamUrl, dest, {
            idempotent: true,
            signal: controller.signal,
            onProgress: ({ bytesWritten, totalBytes }) => {
              if (totalBytes > 0) setProgress(track.id, bytesWritten / totalBytes);
            },
          });
          await assertIsAudio(file);
          const record: DownloadRecord = {
            track,
            fileName: fileNameFor(track),
            bytes: file.size ?? 0,
            downloadedAt: Date.now(),
          };
          const failed = { ...get().failed };
          delete failed[track.id];
          finish(track.id, { items: { ...get().items, [track.id]: record }, failed });
          void saveCover(track);
        } catch (err) {
          try {
            if (dest.exists) dest.delete();
          } catch {}
          if (controller.signal.aborted) return finish(track.id);
          const message = err instanceof Error ? err.message : 'Error de descarga';
          finish(track.id, { failed: { ...get().failed, [track.id]: message } });
        }
      };

      const pump = () => {
        while (active.size < MAX_PARALLEL && pending.length > 0) {
          const next = pending.shift()!;
          void start(next);
        }
      };

      return {
        items: {},
        covers: {},
        progress: {},
        failed: {},
        enqueue: (tracks) => {
          const { items, progress } = get();
          const fresh = tracks.filter((t) => !items[t.id] && !(t.id in progress));
          if (fresh.length === 0) return;
          pending.push(...fresh);
          set((s) => {
            const next = { ...s.progress };
            for (const t of fresh) next[t.id] = 0;
            return { progress: next };
          });
          pump();
        },
        cancel: (id) => {
          const idx = pending.findIndex((t) => t.id === id);
          if (idx >= 0) {
            pending.splice(idx, 1);
            set((s) => {
              const progress = { ...s.progress };
              delete progress[id];
              return { progress };
            });
          }
          active.get(id)?.abort();
        },
        remove: (ids) => {
          const items = { ...get().items };
          for (const id of ids) {
            const record = items[id];
            if (!record) continue;
            try {
              const file = new File(tracksDir(), record.fileName);
              if (file.exists) file.delete();
            } catch {}
            delete items[id];
          }
          set({ items });
        },
        reconcile: () => {
          // Si el sistema o el usuario borró archivos, se limpian los registros huérfanos.
          const items = { ...get().items };
          let changed = false;
          for (const [id, record] of Object.entries(items)) {
            if (!new File(tracksDir(), record.fileName).exists) {
              delete items[id];
              changed = true;
            }
          }
          if (changed) set({ items });
        },
      };
    },
    {
      name: 'sonaura.downloads.v1',
      storage: persistStorage,
      partialize: (s) => ({ items: s.items, covers: s.covers }),
    },
  ),
);

export function localTrackUri(id: string): string | null {
  const record = useDownloads.getState().items[id];
  return record ? new File(tracksDir(), record.fileName).uri : null;
}

export function localCoverUri(albumId: string): string | null {
  const fileName = useDownloads.getState().covers[albumId];
  return fileName ? new File(coversDir(), fileName).uri : null;
}

export const useIsDownloaded = (id: string) => useDownloads((s) => Boolean(s.items[id]));
export const useDownloadProgress = (id: string) => useDownloads((s) => s.progress[id]);

export function totalDownloadedBytes(items: Record<string, DownloadRecord>): number {
  return Object.values(items).reduce((sum, r) => sum + r.bytes, 0);
}
