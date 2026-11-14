import type { Track } from '@/catalog';

import { freshList, withFreshTracks } from '../freshTracks';

const track = (id: string, extra: Partial<Track> = {}): Track => ({
  id,
  title: `Pista ${id}`,
  fileName: `${id}.mp3`,
  trackNumber: null,
  albumId: 'raiz',
  albumTitle: 'Sueltos',
  streamUrl: `https://example.test/${id}`,
  artworkUrl: null,
  lyricsFileId: null,
  ...extra,
});

describe('withFreshTracks', () => {
  it('cambia la copia de la cola por la de la biblioteca cuando aparece un .lrc', () => {
    const cola = { a: track('a'), b: track('b') };
    const biblioteca = { a: track('a', { lyricsFileId: 'lrc-a' }), b: track('b') };
    const next = withFreshTracks(cola, biblioteca);
    expect(next?.a.lyricsFileId).toBe('lrc-a');
    expect(next?.b).toBe(cola.b); // lo que no cambió conserva la misma referencia
    expect(cola.a.lyricsFileId).toBeNull(); // no muta la cola guardada
  });

  it('las copias de antes de que existiera el campo (sin lyricsFileId) también se ponen al día', () => {
    const vieja = track('a');
    delete vieja.lyricsFileId;
    expect(withFreshTracks({ a: vieja }, { a: track('a') })?.a.lyricsFileId).toBeNull();
  });

  it('null si no cambió nada, y conserva las pistas que ya no están en la biblioteca', () => {
    const cola = { a: track('a'), borrada: track('borrada') };
    expect(withFreshTracks(cola, { a: track('a') })).toBeNull();
    expect(withFreshTracks(cola, {})).toBeNull();
    const next = withFreshTracks(cola, { a: track('a', { title: 'Nuevo título' }) });
    expect(next).toEqual({ a: track('a', { title: 'Nuevo título' }), borrada: cola.borrada });
  });
});

it('freshList usa la versión de la biblioteca y deja las que no encuentra', () => {
  const favorito = track('a');
  const suelta = track('x');
  const lista = freshList([favorito, suelta], { a: track('a', { lyricsFileId: 'lrc-a' }) });
  expect(lista.map((t) => t.lyricsFileId)).toEqual(['lrc-a', null]);
  expect(lista[1]).toBe(suelta);
});
