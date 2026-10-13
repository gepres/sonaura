export type RepeatMode = 'off' | 'all' | 'one';

/**
 * Cola de reproducción inmutable. `order` son índices sobre `trackIds` en el orden en que
 * suenan (identidad o barajado) y `position` apunta dentro de `order`.
 */
export type Queue = {
  trackIds: string[];
  order: number[];
  position: number;
};

type Rng = () => number;

function shuffledRest(indices: number[], rng: Rng): number[] {
  const out = [...indices];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function identity(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/** Crea una cola que empieza en `startIndex`; con `shuffle` esa pista va primero y el resto se baraja. */
export function createQueue(trackIds: string[], startIndex: number, shuffle: boolean, rng: Rng = Math.random): Queue {
  const start = Math.min(Math.max(startIndex, 0), Math.max(trackIds.length - 1, 0));
  if (!shuffle) return { trackIds, order: identity(trackIds.length), position: start };
  const rest = identity(trackIds.length).filter((i) => i !== start);
  return { trackIds, order: [start, ...shuffledRest(rest, rng)], position: 0 };
}

export function currentTrackId(q: Queue): string | null {
  const idx = q.order[q.position];
  return idx === undefined ? null : q.trackIds[idx] ?? null;
}

/**
 * Siguiente posición. `auto` = la pista terminó sola (con repetir-una se repite);
 * si el usuario pulsa "siguiente", avanza aunque esté en repetir-una.
 * Devuelve null cuando la cola se acaba.
 */
export function nextPosition(q: Queue, repeat: RepeatMode, auto: boolean): number | null {
  if (q.order.length === 0) return null;
  if (auto && repeat === 'one') return q.position;
  if (q.position + 1 < q.order.length) return q.position + 1;
  return repeat === 'off' ? null : 0;
}

export function previousPosition(q: Queue, repeat: RepeatMode): number {
  if (q.position > 0) return q.position - 1;
  return repeat === 'all' ? Math.max(q.order.length - 1, 0) : 0;
}

/** Activa/desactiva aleatorio sin cortar la pista actual. */
export function setShuffle(q: Queue, shuffle: boolean, rng: Rng = Math.random): Queue {
  const current = q.order[q.position] ?? 0;
  if (shuffle) {
    const rest = identity(q.trackIds.length).filter((i) => i !== current);
    return { ...q, order: [current, ...shuffledRest(rest, rng)], position: 0 };
  }
  return { ...q, order: identity(q.trackIds.length), position: current };
}

export function upcomingIds(q: Queue, limit = 50): string[] {
  return q.order.slice(q.position + 1, q.position + 1 + limit).map((i) => q.trackIds[i]);
}

export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  return mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off';
}
