import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Track } from '@/catalog';
import { persistStorage } from '@/state/storage';

type Favorite = { track: Track; addedAt: number };

type FavoritesState = {
  /** Se guarda la pista completa para poder listarla aunque el catálogo no cargue. */
  items: Record<string, Favorite>;
  toggle: (track: Track) => void;
};

export const useFavorites = create<FavoritesState>()(
  persist(
    (set) => ({
      items: {},
      toggle: (track) =>
        set((s) => {
          const items = { ...s.items };
          if (items[track.id]) delete items[track.id];
          else items[track.id] = { track, addedAt: Date.now() };
          return { items };
        }),
    }),
    { name: 'sonaura.favorites.v1', storage: persistStorage },
  ),
);

export const useIsFavorite = (id: string) => useFavorites((s) => Boolean(s.items[id]));

/** Favoritos del más reciente al más antiguo. */
export function sortedFavorites(items: Record<string, Favorite>): Track[] {
  return Object.values(items)
    .sort((a, b) => b.addedAt - a.addedAt)
    .map((f) => f.track);
}
