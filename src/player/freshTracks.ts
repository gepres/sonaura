import type { Track } from '@/catalog';

function sameTrack(a: Track, b: Track): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof Track)[]);
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}

/**
 * La cola, los favoritos y las descargas guardan copias de las pistas. Cuando la biblioteca se
 * renueva desde Drive (p. ej. aparece un `.lrc`), esas copias se quedan atrás. Devuelve el mapa
 * con las pistas puestas al día, o `null` si no cambió nada. Las que ya no están en la biblioteca
 * (borradas en Drive, o sin conexión) se conservan tal cual.
 */
export function withFreshTracks(
  tracks: Record<string, Track>,
  library: Record<string, Track>,
): Record<string, Track> | null {
  let next: Record<string, Track> | null = null;
  for (const [id, track] of Object.entries(tracks)) {
    const fresh = library[id];
    if (!fresh || sameTrack(track, fresh)) continue;
    next ??= { ...tracks };
    next[id] = fresh;
  }
  return next;
}

/** La versión de la biblioteca de cada pista, si la hay. */
export function freshList(tracks: Track[], library: Record<string, Track>): Track[] {
  return tracks.map((t) => library[t.id] ?? t);
}
