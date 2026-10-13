import {
  createQueue,
  currentTrackId,
  nextPosition,
  nextRepeatMode,
  previousPosition,
  setShuffle,
  upcomingIds,
} from '../queue';

const ids = ['a', 'b', 'c', 'd', 'e'];
// rng determinista para que el barajado sea reproducible
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('createQueue', () => {
  it('sin aleatorio respeta el orden y arranca en la pista pedida', () => {
    const q = createQueue(ids, 2, false);
    expect(q.order).toEqual([0, 1, 2, 3, 4]);
    expect(currentTrackId(q)).toBe('c');
  });

  it('con aleatorio la pista elegida va primero y el resto es una permutación', () => {
    const q = createQueue(ids, 3, true, seq(0.1, 0.7, 0.3, 0.9));
    expect(q.position).toBe(0);
    expect(currentTrackId(q)).toBe('d');
    expect([...q.order].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('acota startIndex fuera de rango y tolera colas vacías', () => {
    expect(currentTrackId(createQueue(ids, 99, false))).toBe('e');
    expect(currentTrackId(createQueue([], 0, false))).toBeNull();
  });
});

describe('nextPosition', () => {
  const last = { ...createQueue(ids, 4, false) };

  it('avanza en medio de la cola', () => {
    expect(nextPosition(createQueue(ids, 1, false), 'off', true)).toBe(2);
  });

  it('al final: off se detiene, all vuelve al inicio', () => {
    expect(nextPosition(last, 'off', true)).toBeNull();
    expect(nextPosition(last, 'all', true)).toBe(0);
  });

  it('repetir-una repite solo cuando la pista termina sola', () => {
    const q = createQueue(ids, 1, false);
    expect(nextPosition(q, 'one', true)).toBe(1);
    expect(nextPosition(q, 'one', false)).toBe(2);
  });

  it('cola vacía no tiene siguiente', () => {
    expect(nextPosition(createQueue([], 0, false), 'all', true)).toBeNull();
  });
});

describe('previousPosition', () => {
  it('retrocede, y al inicio depende de repetir', () => {
    expect(previousPosition(createQueue(ids, 2, false), 'off')).toBe(1);
    expect(previousPosition(createQueue(ids, 0, false), 'off')).toBe(0);
    expect(previousPosition(createQueue(ids, 0, false), 'all')).toBe(4);
  });
});

describe('setShuffle', () => {
  it('activar no cambia la pista que suena', () => {
    const q = setShuffle(createQueue(ids, 3, false), true, seq(0.5));
    expect(currentTrackId(q)).toBe('d');
    expect(q.position).toBe(0);
  });

  it('desactivar vuelve al orden original manteniendo la pista', () => {
    const shuffled = createQueue(ids, 3, true, seq(0.2, 0.8));
    const q = setShuffle(shuffled, false);
    expect(q.order).toEqual([0, 1, 2, 3, 4]);
    expect(currentTrackId(q)).toBe('d');
  });
});

it('upcomingIds lista lo que sigue', () => {
  expect(upcomingIds(createQueue(ids, 1, false), 2)).toEqual(['c', 'd']);
});

it('nextRepeatMode cicla off → all → one → off', () => {
  expect(nextRepeatMode('off')).toBe('all');
  expect(nextRepeatMode('all')).toBe('one');
  expect(nextRepeatMode('one')).toBe('off');
});
