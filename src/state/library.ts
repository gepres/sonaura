import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { buildLibrary, CatalogError, createDefaultSource, type Library, type Track } from '@/catalog';
import { DRIVE_FOLDER_ID } from '@/config';
import { appFetch } from '@/lib/http';
import { safeStorage } from '@/state/storage';

type LibraryState = {
  library: Library | null;
  /** Índice id → pista, derivado de `library` (no se persiste). */
  tracksById: Record<string, Track>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

function indexTracks(library: Library | null): Record<string, Track> {
  const map: Record<string, Track> = {};
  for (const album of library?.albums ?? []) for (const t of album.tracks) map[t.id] = t;
  return map;
}

function describeError(err: unknown): string {
  if (err instanceof CatalogError) {
    if (err.code === 'not_public') return 'La carpeta de Drive no es pública o ya no existe.';
    if (err.code === 'network') return 'Sin conexión. Mostrando tu biblioteca guardada.';
  }
  return 'No se pudo actualizar la biblioteca desde Drive.';
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      library: null,
      tracksById: {},
      loading: false,
      error: null,
      refresh: async () => {
        if (get().loading) return;
        set({ loading: true, error: null });
        try {
          const library = await buildLibrary(DRIVE_FOLDER_ID, createDefaultSource(appFetch));
          set({ library, tracksById: indexTracks(library), loading: false });
        } catch (err) {
          // Se conserva la biblioteca en caché: la app sigue usable sin conexión.
          set({ loading: false, error: describeError(err) });
        }
      },
    }),
    {
      name: 'sonaura.library.v1',
      storage: safeStorage(),
      partialize: (s) => ({ library: s.library }),
      // El índice se deriva antes de publicar el estado hidratado, no mutándolo después.
      merge: (persisted, current) => {
        const library = (persisted as Partial<LibraryState> | undefined)?.library ?? current.library;
        return { ...current, library, tracksById: indexTracks(library) };
      },
    },
  ),
);

export function useAlbum(albumId: string | undefined) {
  return useLibrary((s) => s.library?.albums.find((a) => a.id === albumId) ?? null);
}
