import type { Track } from '@/catalog';
import { freshList } from '@/player/freshTracks';
import { usePlayer } from '@/player/store';
import { useDownloads } from '@/state/downloads';
import { useLibrary } from '@/state/library';
import { useNetwork } from '@/state/network';

/**
 * Lo que entra en la cola, en su versión de la biblioteca (favoritos y descargas guardan copias
 * que pueden no saber de un `.lrc` nuevo). Sin conexión solo entran las pistas descargadas.
 */
export function playable(context: Track[]): Track[] {
  const tracks = freshList(context, useLibrary.getState().tracksById);
  if (useNetwork.getState().online) return tracks;
  const items = useDownloads.getState().items;
  return tracks.filter((t) => items[t.id]);
}

/** Reproduce `track` usando `context` (álbum, favoritos, resultados…) como cola. */
export function playFrom(context: Track[], track: Track) {
  const list = playable(context);
  const index = list.findIndex((t) => t.id === track.id);
  if (index >= 0) usePlayer.getState().playTracks(list, index);
}

export function playAll(context: Track[], shuffle = false) {
  const list = playable(context);
  if (list.length === 0) return;
  const start = shuffle ? Math.floor(Math.random() * list.length) : 0;
  usePlayer.getState().playTracks(list, start, { shuffle });
}
