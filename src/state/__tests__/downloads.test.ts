import type { Track } from '@/catalog';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Almacenamiento falso: cada descarga tarda un poco, como en un teléfono real.
const mockDownload = jest.fn(
  (_kind: string, _url: string, _name: string, opts?: { onProgress?: (r: number) => void }) =>
    new Promise<number>((resolve) => {
      opts?.onProgress?.(0.5);
      setTimeout(() => resolve(4_000_000), 5);
    }),
);
jest.mock('@/state/fileStore', () => ({
  fileStore: {
    supported: true,
    init: async () => {},
    ensureDirs: async () => {},
    download: (...args: Parameters<typeof mockDownload>) => mockDownload(...args),
    readHead: async () => Uint8Array.from([0x49, 0x44, 0x33]), // "ID3"
    exists: async () => true,
    remove: async () => {},
    uri: (kind: string, name: string) => `file:///${kind}/${name}`,
  },
}));

import { useDownloads } from '../downloads';

const track = (n: number): Track => ({
  id: `t${n}`,
  title: `Pista ${n}`,
  fileName: `0${n} - Pista.mp3`,
  trackNumber: n,
  albumId: 'album-1',
  albumTitle: 'Álbum',
  streamUrl: `https://example.com/t${n}`,
  artworkUrl: 'https://example.com/cover',
});

const settle = () => new Promise((r) => setTimeout(r, 60));

beforeEach(() => {
  mockDownload.mockClear();
  useDownloads.setState({ items: {}, covers: {}, progress: {}, failed: {} });
});

it('descarga un álbum completo y guarda la portada una sola vez', async () => {
  useDownloads.getState().enqueue([track(1), track(2), track(3), track(4)]);
  await settle();

  const { items, covers, progress } = useDownloads.getState();
  expect(Object.keys(items).sort()).toEqual(['t1', 't2', 't3', 't4']);
  expect(items.t1.fileName).toBe('t1.mp3');
  expect(progress).toEqual({});
  expect(covers['album-1']).toBe('album-1.jpg');

  const coverCalls = mockDownload.mock.calls.filter(([kind]) => kind === 'covers');
  expect(coverCalls).toHaveLength(1);
});

it('no vuelve a encolar lo ya descargado', async () => {
  useDownloads.getState().enqueue([track(1)]);
  await settle();
  mockDownload.mockClear();
  useDownloads.getState().enqueue([track(1)]);
  await settle();
  expect(mockDownload).not.toHaveBeenCalled();
});

it('marca como fallida una descarga que en realidad es HTML de Drive', async () => {
  const { fileStore } = jest.requireMock('@/state/fileStore');
  const original = fileStore.readHead;
  fileStore.readHead = async () => Uint8Array.from('<!DOCTYPE html>', (c: string) => c.charCodeAt(0));
  useDownloads.getState().enqueue([track(5)]);
  await settle();
  fileStore.readHead = original;

  const { items, failed } = useDownloads.getState();
  expect(items.t5).toBeUndefined();
  expect(failed.t5).toMatch(/limitó/);
});
