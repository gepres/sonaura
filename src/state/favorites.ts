import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { trackSong } from '@/analytics';
import type { Track } from '@/catalog';
import { safeStorage } from '@/state/storage';

type Favorite = { track: Track; addedAt: number };

type FavoritesState = {
  /** Se guarda la pista completa para poder listarla aunque el catálogo no cargue. */
  items: Record<string, Favorite>;
  toggle: (track: Track) => void;
};

export const useFavorites = create<FavoritesState>()(
  persist(
    (set, get) => ({
      items: {},
      toggle: (track) => {
        const added = !get().items[track.id];
        set((s) => {
          const items = { ...s.items };
          if (added) items[track.id] = { track, addedAt: Date.now() };
          else delete items[track.id];
          return { items };
        });
        trackSong(added ? 'favorito_agregado' : 'favorito_quitado', track);
      },
    }),
    { name: 'sonaura.favorites.v1', storage: safeStorage() },
  ),
);

export const useIsFavorite = (id: string) => useFavorites((s) => Boolean(s.items[id]));

/** Favoritos del más reciente al más antiguo. */
export function sortedFavorites(items: Record<string, Favorite>): Track[] {
  return Object.values(items)
    .sort((a, b) => b.addedAt - a.addedAt)
    .map((f) => f.track);
}
