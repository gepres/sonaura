import type { Track } from '@/catalog';

import { needsLoad, type LyricsEntry } from '../store';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- mock oficial de la librería
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/state/fileStore', () => ({ fileStore: { supported: false } }));
jest.mock('../remote', () => ({ fetchDriveBytes: jest.fn(), fetchDriveText: jest.fn() }));

const track = (lyricsFileId?: string | null): Track => ({
  id: 't1',
  title: 'Caminar descalzo',
  fileName: '01 - Caminar descalzo.mp3',
  trackNumber: 1,
  albumId: 'a1',
  albumTitle: 'Esistenza',
  streamUrl: 'https://example.com/t1',
  artworkUrl: null,
  ...(lyricsFileId === undefined ? {} : { lyricsFileId }),
});

const entry = (patch: Partial<LyricsEntry>): LyricsEntry => ({
  lines: [{ text: 'Bajo mis pasos', section: false, time: null, gap: false }],
  synced: false,
  lrcId: null,
  at: 1_000,
  ...patch,
});

it('sin nada guardado, se carga', () => {
  expect(needsLoad(undefined, track(null))).toBe(true);
});

it('la letra del MP3 guardada vale mientras no aparezca un .lrc', () => {
  expect(needsLoad(entry({}), track(null), 2_000)).toBe(false);
  expect(needsLoad(entry({}), track('lrc-1'), 2_000)).toBe(true);
});

it('si cambia o se quita el .lrc en Drive, se vuelve a cargar', () => {
  const synced = entry({ synced: true, lrcId: 'lrc-1' });
  expect(needsLoad(synced, track('lrc-1'), 2_000)).toBe(false);
  expect(needsLoad(synced, track('lrc-2'), 2_000)).toBe(true);
  expect(needsLoad(synced, track(null), 2_000)).toBe(true);
});

it('una pista guardada antes de existir el campo no pierde la letra sincronizada', () => {
  expect(needsLoad(entry({ synced: true, lrcId: 'lrc-1' }), track(undefined), 2_000)).toBe(false);
});

it('«sin letra» se vuelve a mirar al día siguiente', () => {
  const empty = entry({ lines: [] });
  expect(needsLoad(empty, track(null), 1_000 + 60_000)).toBe(false);
  expect(needsLoad(empty, track(null), 1_000 + 25 * 60 * 60_000)).toBe(true);
});
