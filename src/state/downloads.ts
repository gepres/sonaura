import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Track } from '@/catalog';
import { assertIsAudioHead } from '@/state/audioHead';
import { fileStore } from '@/state/fileStore';
import { safeStorage } from '@/state/storage';

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
  reconcile: () => Promise<void>;
};

const MAX_PARALLEL = 2;
const pending: Track[] = [];
const active = new Map<string, AbortController>();
/** Portadas en descarga: varias pistas del mismo álbum terminan casi a la vez. */
const coversInFlight = new Set<string>();

function fileNameFor(track: Track): string {
  const ext = /\.([a-z0-9]{2,4})$/i.exec(track.fileName)?.[1]?.toLowerCase() ?? 'mp3';
  return `${track.id}.${ext}`;
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
        const albumId = track.albumId;
        if (!track.artworkUrl || get().covers[albumId] || coversInFlight.has(albumId)) return;
        // Un solo escritor por portada: si dos descargas la escribieran a la vez, la imagen
        // podría mostrarse a medio escribir.
        coversInFlight.add(albumId);
        const fileName = `${albumId}.jpg`;
        try {
          await fileStore.download('covers', track.artworkUrl, fileName);
          set((s) => ({ covers: { ...s.covers, [albumId]: fileName } }));
        } catch {
          // La portada es opcional: sin ella se usa el arte generado.
        } finally {
          coversInFlight.delete(albumId);
        }
      };

      const start = async (track: Track) => {
        const controller = new AbortController();
        active.set(track.id, controller);
        const fileName = fileNameFor(track);
        try {
          await fileStore.ensureDirs();
          await fileStore.remove('tracks', fileName);
          const bytes = await fileStore.download('tracks', track.streamUrl, fileName, {
            signal: controller.signal,
            onProgress: (ratio) => setProgress(track.id, ratio),
          });
          assertIsAudioHead(await fileStore.readHead('tracks', fileName, 512));
          // Se pudo cancelar mientras se validaba: no se registra.
          if (controller.signal.aborted) throw new Error('cancelada');
          const record: DownloadRecord = {
            track,
            fileName,
            bytes,
            downloadedAt: Date.now(),
          };
          const failed = { ...get().failed };
          delete failed[track.id];
          finish(track.id, { items: { ...get().items, [track.id]: record }, failed });
          void saveCover(track);
        } catch (err) {
          await fileStore.remove('tracks', fileName).catch(() => {});
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
            void fileStore.remove('tracks', record.fileName).catch(() => {});
            delete items[id];
          }
          set({ items });
        },
        reconcile: async () => {
          // Si el sistema o el usuario borró archivos, se limpian los registros huérfanos.
          const records = Object.entries(get().items);
          const missing = await Promise.all(
            records.map(async ([id, r]) => ((await fileStore.exists('tracks', r.fileName).catch(() => true)) ? null : id)),
          );
          const gone = missing.filter((id): id is string => id !== null);
          if (gone.length === 0) return;
          set((s) => {
            const items = { ...s.items };
            for (const id of gone) delete items[id];
            return { items };
          });
        },
      };
    },
    {
      name: 'sonaura.downloads.v1',
      storage: safeStorage(),
      partialize: (s) => ({ items: s.items, covers: s.covers }),
    },
  ),
);

export function localTrackUri(id: string): string | null {
  const record = useDownloads.getState().items[id];
  return record ? fileStore.uri('tracks', record.fileName) : null;
}

export function coverFileUri(fileName: string): string {
  return fileStore.uri('covers', fileName);
}

export function localCoverUri(albumId: string): string | null {
  const fileName = useDownloads.getState().covers[albumId];
  return fileName ? coverFileUri(fileName) : null;
}

/** Portada a mostrar: la guardada offline si existe. Hook, para que React vea el cambio. */
export function useCoverUri(albumId: string, remote: string | null): string | null {
  const fileName = useDownloads((s) => s.covers[albumId]);
  return fileName ? coverFileUri(fileName) : remote;
}

/** En un navegador normal no hay dónde guardar archivos: se ocultan las descargas. */
export const downloadsSupported = fileStore.supported;

export const useIsDownloaded = (id: string) => useDownloads((s) => Boolean(s.items[id]));
export const useDownloadProgress = (id: string) => useDownloads((s) => s.progress[id]);

export function totalDownloadedBytes(items: Record<string, DownloadRecord>): number {
  return Object.values(items).reduce((sum, r) => sum + r.bytes, 0);
}
