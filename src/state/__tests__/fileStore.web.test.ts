import type { FileHandle } from '@tauri-apps/plugin-fs';

import type { FileStore } from '../fileStore.types';

jest.mock('@tauri-apps/api/core', () => ({ isTauri: jest.fn(), convertFileSrc: jest.fn() }));
jest.mock('@tauri-apps/api/path', () => ({ appDataDir: jest.fn(), join: jest.fn() }));
jest.mock('@tauri-apps/plugin-http', () => ({ fetch: jest.fn() }));
jest.mock('@tauri-apps/plugin-fs', () => ({
  mkdir: jest.fn(),
  exists: jest.fn(),
  remove: jest.fn(),
  open: jest.fn(),
  writeFile: jest.fn(),
}));

// jest-expo usa el entorno nativo. Estos son streams reales del runner,
// equivalentes a los estándares web que proporciona WebView2.
const webStreams = jest.requireActual<typeof import('node:stream/web')>('node:stream/web');
const originalReadable = Object.getOwnPropertyDescriptor(globalThis, 'ReadableStream');
const originalTransform = Object.getOwnPropertyDescriptor(globalThis, 'TransformStream');

beforeAll(() => {
  Object.defineProperties(globalThis, {
    ReadableStream: { configurable: true, value: webStreams.ReadableStream },
    TransformStream: { configurable: true, value: webStreams.TransformStream },
  });
});

afterAll(() => {
  if (originalReadable) Object.defineProperty(globalThis, 'ReadableStream', originalReadable);
  else Reflect.deleteProperty(globalThis, 'ReadableStream');
  if (originalTransform) Object.defineProperty(globalThis, 'TransformStream', originalTransform);
  else Reflect.deleteProperty(globalThis, 'TransformStream');
});

const base = 'C:\\Users\\Test\\AppData\\Roaming\\app.sonaura';
const tracks = `${base}\\sonaura\\tracks`;
const covers = `${base}\\sonaura\\covers`;
const target = `${tracks}\\song.mp3`;
const url = 'https://drive.google.com/song';

let core: jest.Mocked<typeof import('@tauri-apps/api/core')>;
let paths: jest.Mocked<typeof import('@tauri-apps/api/path')>;
let http: jest.Mocked<typeof import('@tauri-apps/plugin-http')>;
let fs: jest.Mocked<typeof import('@tauri-apps/plugin-fs')>;
let disk: Map<string | URL, Uint8Array[]>;
let onChunkWritten: ((chunk: Uint8Array) => void) | undefined;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function loadStore(supported = true): FileStore {
  core.isTauri.mockReturnValue(supported);
  // La extensión es explícita: el preset seleccionaría la implementación nativa.
  return jest.requireActual<{ fileStore: FileStore }>('../fileStore.web').fileStore;
}

function response(body: ReadableStream<Uint8Array> | null, total?: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    body,
    headers: { get: (name: string) => name.toLowerCase() === 'content-length' ? total ?? null : null },
  } as Response;
}

function chunks(...values: number[][]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      values.forEach((value) => controller.enqueue(Uint8Array.from(value)));
      controller.close();
    },
  });
}

function readHandle() {
  const read = jest.fn<Promise<number | null>, [Uint8Array]>();
  const close = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  fs.open.mockResolvedValue({ read, close } as unknown as FileHandle);
  return { read, close };
}

beforeEach(() => {
  jest.resetModules();
  core = jest.mocked(jest.requireMock<typeof import('@tauri-apps/api/core')>('@tauri-apps/api/core'));
  paths = jest.mocked(jest.requireMock<typeof import('@tauri-apps/api/path')>('@tauri-apps/api/path'));
  http = jest.mocked(jest.requireMock<typeof import('@tauri-apps/plugin-http')>('@tauri-apps/plugin-http'));
  fs = jest.mocked(jest.requireMock<typeof import('@tauri-apps/plugin-fs')>('@tauri-apps/plugin-fs'));
  disk = new Map();
  onChunkWritten = undefined;
  core.convertFileSrc.mockImplementation((path) => `asset://${path}`);
  paths.appDataDir.mockResolvedValue(base);
  paths.join.mockImplementation(async (...parts) => parts.join('\\'));
  fs.mkdir.mockResolvedValue(undefined);
  fs.exists.mockImplementation(async (path) => disk.has(path));
  fs.remove.mockImplementation(async (path) => { disk.delete(path); });
  fs.writeFile.mockImplementation(async (path, data) => {
    if (data instanceof Uint8Array) throw new Error('Se esperaba un stream');
    const written: Uint8Array[] = [];
    disk.set(path, written);
    const reader = data.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        written.push(value);
        onChunkWritten?.(value);
      }
    } finally {
      reader.releaseLock();
    }
  });
});

it('en un navegador desactiva descargas y no llama a Tauri', async () => {
  const store = loadStore(false);
  expect(store.supported).toBe(false);
  await expect(store.init()).resolves.toBeUndefined();
  await expect(store.ensureDirs()).resolves.toBeUndefined();
  await expect(store.exists('tracks', 'song.mp3')).resolves.toBe(false);
  await expect(store.remove('tracks', 'song.mp3')).resolves.toBeUndefined();
  expect(store.uri('tracks', 'song.mp3')).toBe('');
  const message = 'Las descargas solo están disponibles en la app de escritorio';
  await expect(store.download('tracks', url, 'song.mp3')).rejects.toThrow(message);
  await expect(store.readHead('tracks', 'song.mp3', 4)).rejects.toThrow(message);
  expect(paths.appDataDir).not.toHaveBeenCalled();
  expect(paths.join).not.toHaveBeenCalled();
  expect(core.convertFileSrc).not.toHaveBeenCalled();
  expect(http.fetch).not.toHaveBeenCalled();
  Object.values(fs).forEach((mock) => expect(mock).not.toHaveBeenCalled());
});

it('comparte init pendiente y resuelve URI síncronas con las rutas absolutas', async () => {
  const baseReady = deferred<string>();
  paths.appDataDir.mockReturnValue(baseReady.promise);
  const store = loadStore();
  expect(store.supported).toBe(true);
  expect(store.uri('tracks', 'song.mp3')).toBe('');
  const first = store.init();
  expect(store.init()).toBe(first);
  const pendingExists = store.exists('tracks', 'song.mp3');
  const pendingDirs = store.ensureDirs();
  expect(fs.exists).not.toHaveBeenCalled();
  expect(fs.mkdir).not.toHaveBeenCalled();
  expect(store.uri('covers', 'cover.jpg')).toBe('');
  baseReady.resolve(base);
  await Promise.all([first, pendingExists, pendingDirs]);
  await store.init();
  expect(paths.appDataDir).toHaveBeenCalledTimes(1);
  expect(paths.join).toHaveBeenCalledTimes(2);
  expect(paths.join).toHaveBeenCalledWith(base, 'sonaura', 'tracks');
  expect(paths.join).toHaveBeenCalledWith(base, 'sonaura', 'covers');
  expect(fs.exists).toHaveBeenCalledWith(target);
  expect(store.uri('tracks', 'song.mp3')).toBe(`asset://${target}`);
  expect(store.uri('covers', 'cover.jpg')).toBe(`asset://${covers}\\cover.jpg`);
  expect(core.convertFileSrc).toHaveBeenCalledWith(target);
  expect(core.convertFileSrc).toHaveBeenCalledWith(`${covers}\\cover.jpg`);
});

it('admite rutas POSIX en uri()', async () => {
  paths.appDataDir.mockResolvedValue('/home/test/.local/share/sonaura');
  paths.join.mockImplementation(async (...parts) => parts.join('/'));
  const store = loadStore();
  await store.init();
  expect(store.uri('covers', 'cover.jpg')).toBe('asset:///home/test/.local/share/sonaura/sonaura/covers/cover.jpg');
});

it('crea ambas carpetas recursivamente y admite llamadas repetidas', async () => {
  const store = loadStore();
  await store.ensureDirs();
  await store.ensureDirs();
  expect(fs.mkdir.mock.calls).toEqual([
    [tracks, { recursive: true }], [covers, { recursive: true }],
    [tracks, { recursive: true }], [covers, { recursive: true }],
  ]);
  expect(paths.appDataDir).toHaveBeenCalledTimes(1);
});

it('escribe chunks como stream, informa progreso y devuelve los bytes escritos', async () => {
  const store = loadStore();
  const first = [1, 2];
  const second = [3, 4, 5];
  http.fetch.mockResolvedValue(response(chunks(first, second), '5'));
  const onProgress = jest.fn();
  const signal = new AbortController().signal;
  await expect(store.download('tracks', url, 'song.mp3', { signal, onProgress })).resolves.toBe(5);
  expect(http.fetch).toHaveBeenCalledWith(url, { signal });
  expect(fs.writeFile).toHaveBeenCalledTimes(1);
  expect(fs.writeFile).toHaveBeenCalledWith(target, expect.any(ReadableStream));
  expect(disk.get(target)).toEqual([Uint8Array.from(first), Uint8Array.from(second)]);
  expect(onProgress.mock.calls).toEqual([[2 / 5], [1]]);
  expect(fs.remove).not.toHaveBeenCalled();
});

it.each([undefined, '0', 'invalid', 'Infinity'])('sin total válido (%s) no informa progreso', async (total) => {
  const store = loadStore();
  http.fetch.mockResolvedValue(response(chunks([1, 2]), total));
  const onProgress = jest.fn();
  await expect(store.download('covers', url, 'cover.jpg', { onProgress })).resolves.toBe(2);
  expect(onProgress).not.toHaveBeenCalled();
  expect(disk.get(`${covers}\\cover.jpg`)).toEqual([Uint8Array.from([1, 2])]);
});

it('un cuerpo nulo guarda cero bytes', async () => {
  const store = loadStore();
  http.fetch.mockResolvedValue(response(null, undefined, 204));
  await expect(store.download('tracks', url, 'song.mp3')).resolves.toBe(0);
  expect(disk.get(target)).toEqual([]);
});

it('un signal ya abortado rechaza con AbortError sin iniciar la transferencia', async () => {
  const store = loadStore();
  const controller = new AbortController();
  controller.abort();
  await expect(store.download('tracks', url, 'song.mp3', { signal: controller.signal }))
    .rejects.toMatchObject({ name: 'AbortError' });
  expect(http.fetch).not.toHaveBeenCalled();
  expect(fs.writeFile).not.toHaveBeenCalled();
  expect(disk.has(target)).toBe(false);
});

it('abortar durante init impide iniciar HTTP después de resolver las rutas', async () => {
  const baseReady = deferred<string>();
  paths.appDataDir.mockReturnValue(baseReady.promise);
  const store = loadStore();
  const controller = new AbortController();
  const download = store.download('tracks', url, 'song.mp3', { signal: controller.signal });
  const rejected = expect(download).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  baseReady.resolve(base);
  await rejected;
  expect(http.fetch).not.toHaveBeenCalled();
  expect(fs.writeFile).not.toHaveBeenCalled();
});

it('abortar un stream detenido borra el archivo parcial y rechaza con AbortError', async () => {
  const store = loadStore();
  const firstWritten = deferred<Uint8Array>();
  onChunkWritten = firstWritten.resolve;
  const cancel = jest.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(Uint8Array.from([1, 2])); },
    cancel,
  });
  http.fetch.mockResolvedValue(response(body, '4'));
  const controller = new AbortController();
  const download = store.download('tracks', url, 'song.mp3', { signal: controller.signal });
  const rejected = expect(download).rejects.toMatchObject({ name: 'AbortError' });
  await firstWritten.promise;
  expect(disk.get(target)).toEqual([Uint8Array.from([1, 2])]);
  controller.abort();
  await rejected;
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(fs.remove).toHaveBeenCalledWith(target);
  expect(disk.has(target)).toBe(false);
});

it('normaliza el error de cancelación del plugin HTTP', async () => {
  const store = loadStore();
  const controller = new AbortController();
  http.fetch.mockImplementation(async () => {
    controller.abort();
    throw new Error('Request cancelled');
  });
  await expect(store.download('tracks', url, 'song.mp3', { signal: controller.signal }))
    .rejects.toMatchObject({ name: 'AbortError' });
  expect(fs.writeFile).not.toHaveBeenCalled();
  expect(disk.has(target)).toBe(false);
});

it('rechaza un HTTP no 2xx, cancela su cuerpo y no crea un archivo', async () => {
  const store = loadStore();
  const cancel = jest.fn();
  http.fetch.mockResolvedValue(response(new ReadableStream({ cancel }), undefined, 403));
  await expect(store.download('tracks', url, 'song.mp3')).rejects.toThrow(/HTTP 403/);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(fs.writeFile).not.toHaveBeenCalled();
  expect(disk.has(target)).toBe(false);
});

it('un fallo de escritura cancela la respuesta y elimina el archivo parcial', async () => {
  const store = loadStore();
  const failure = new Error('Disco lleno');
  const cancel = jest.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(Uint8Array.from([1, 2])); },
    cancel,
  });
  http.fetch.mockResolvedValue(response(body));
  onChunkWritten = () => { throw failure; };
  await expect(store.download('tracks', url, 'song.mp3')).rejects.toBe(failure);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(fs.remove).toHaveBeenCalledWith(target);
  expect(disk.has(target)).toBe(false);
});

it('un fallo del cuerpo HTTP también elimina el archivo parcial', async () => {
  const store = loadStore();
  const firstWritten = deferred<Uint8Array>();
  onChunkWritten = firstWritten.resolve;
  let source!: ReadableStreamDefaultController<Uint8Array>;
  const failure = new Error('Conexión perdida');
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      source = controller;
      controller.enqueue(Uint8Array.from([1, 2]));
    },
  });
  http.fetch.mockResolvedValue(response(body));
  const download = store.download('tracks', url, 'song.mp3');
  const rejected = expect(download).rejects.toBe(failure);
  await firstWritten.promise;
  source.error(failure);
  await rejected;
  expect(fs.remove).toHaveBeenCalledWith(target);
  expect(disk.has(target)).toBe(false);
});

it('readHead abre solo para lectura, devuelve los primeros bytes y cierra', async () => {
  const store = loadStore();
  const { read, close } = readHandle();
  read.mockImplementationOnce(async (buffer) => { buffer.set([1, 2, 3]); return 3; });
  await expect(store.readHead('tracks', 'song.mp3', 3)).resolves.toEqual(Uint8Array.from([1, 2, 3]));
  expect(fs.open).toHaveBeenCalledWith(target, { read: true });
  expect(read).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});

it('readHead continúa tras lecturas cortas y devuelve solo los bytes hasta EOF', async () => {
  const store = loadStore();
  const { read, close } = readHandle();
  read.mockImplementationOnce(async (buffer) => { buffer.set([1, 2]); return 2; });
  read.mockImplementationOnce(async (buffer) => { buffer.set([3]); return 1; });
  read.mockResolvedValueOnce(null);
  await expect(store.readHead('tracks', 'song.mp3', 5)).resolves.toEqual(Uint8Array.from([1, 2, 3]));
  expect(read.mock.calls.map(([buffer]) => buffer.length)).toEqual([5, 3, 2]);
  expect(close).toHaveBeenCalledTimes(1);
});

it.each([null, 0])('readHead devuelve vacío al recibir EOF (%s)', async (eof) => {
  const store = loadStore();
  const { read, close } = readHandle();
  read.mockResolvedValueOnce(eof);
  await expect(store.readHead('tracks', 'song.mp3', 5)).resolves.toEqual(new Uint8Array());
  expect(close).toHaveBeenCalledTimes(1);
});

it('readHead cierra el handle aunque falle la lectura', async () => {
  const store = loadStore();
  const { read, close } = readHandle();
  const failure = new Error('Error de lectura');
  read.mockRejectedValueOnce(failure);
  await expect(store.readHead('tracks', 'song.mp3', 5)).rejects.toBe(failure);
  expect(close).toHaveBeenCalledTimes(1);
});

it('exists y remove resuelven init y borrar un archivo ausente no falla', async () => {
  const store = loadStore();
  disk.set(target, [Uint8Array.from([1])]);
  await expect(store.exists('tracks', 'song.mp3')).resolves.toBe(true);
  await store.remove('tracks', 'song.mp3');
  await expect(store.exists('tracks', 'song.mp3')).resolves.toBe(false);
  await expect(store.remove('tracks', 'song.mp3')).resolves.toBeUndefined();
  expect(fs.remove).toHaveBeenCalledTimes(1);
  expect(fs.remove).toHaveBeenCalledWith(target);
});

it('remove admite que el archivo desaparezca después de exists', async () => {
  const store = loadStore();
  fs.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  fs.remove.mockRejectedValueOnce(new Error('No existe'));
  await expect(store.remove('tracks', 'song.mp3')).resolves.toBeUndefined();
});

it('remove propaga fallos reales cuando el archivo sigue presente', async () => {
  const store = loadStore();
  disk.set(target, []);
  const failure = new Error('Sin permisos');
  fs.remove.mockRejectedValueOnce(failure);
  await expect(store.remove('tracks', 'song.mp3')).rejects.toBe(failure);
});
