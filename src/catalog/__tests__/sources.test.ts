/// <reference types="jest" />
/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as catalog from '../index';
import { createApiSource, createDefaultSource, createEmbeddedSource } from '../sources';
import { CatalogError, type FolderSource } from '../types';

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

function mockedFetch() {
  return jest.fn<Promise<Response>, [input: RequestInfo | URL, init?: RequestInit]>();
}

const sourceFactories: [string, (fetchImpl: typeof fetch) => FolderSource][] = [
  ['embedded', (fetchImpl) => createEmbeddedSource(fetchImpl)],
  ['API', (fetchImpl) => createApiSource('test-key', fetchImpl)],
];

describe('createEmbeddedSource', () => {
  test('fetches and parses the real root fixture', async () => {
    const html = readFileSync(join(__dirname, '..', '__fixtures__', 'root.html'), 'utf8');
    const fetchImpl = mockedFetch().mockResolvedValue(response(html));
    const listing = await createEmbeddedSource(fetchImpl).listFolder('root&other');
    expect(fetchImpl).toHaveBeenCalledWith('https://drive.google.com/embeddedfolderview?id=root%26other');
    expect(listing.title).toBe('musica');
    expect(listing.entries.filter((entry) => entry.kind === 'folder')).toHaveLength(3);
    expect(listing.entries.filter((entry) => entry.kind === 'file')).toHaveLength(7);
  });

  test('propagates parser access errors from a 200 sign-in page', async () => {
    const fetchImpl = mockedFetch().mockResolvedValue(response('<title>Sign in</title><form>Google Accounts</form>'));
    await expect(createEmbeddedSource(fetchImpl).listFolder('private')).rejects.toMatchObject({ code: 'not_public' });
  });

  test('reports response body transport failures as network', async () => {
    const broken = response('');
    broken.text = jest.fn().mockRejectedValue(new Error('Disconnected'));
    const fetchImpl = mockedFetch().mockResolvedValue(broken);
    await expect(createEmbeddedSource(fetchImpl).listFolder('root')).rejects.toMatchObject({ code: 'network' });
  });
});

describe('createApiSource', () => {
  test('fetches the title, follows pagination and maps folder MIME types', async () => {
    const fetchImpl = mockedFetch()
      .mockResolvedValueOnce(response({ name: 'Präsenz & Luce' }))
      .mockResolvedValueOnce(response({
        nextPageToken: 'next+/=',
        files: [
          { id: 'child', name: 'Album', mimeType: 'application/vnd.google-apps.folder' },
          { id: 'song-1', name: '01 - Caminar.mp3', mimeType: 'audio/mpeg' },
        ],
      }))
      .mockResolvedValueOnce(response({ nextPageToken: 'last', files: [] }))
      .mockResolvedValueOnce(response({ files: [
        { id: 'image', name: 'cover.png', mimeType: 'image/png' },
        { id: 'song-2', name: '02 - Luce.mp3', mimeType: 'audio/mpeg' },
      ] }));
    const listing = await createApiSource('key & value', fetchImpl).listFolder('parent');
    expect(listing).toEqual({ title: 'Präsenz & Luce', entries: [
      { id: 'child', name: 'Album', kind: 'folder' },
      { id: 'song-1', name: '01 - Caminar.mp3', kind: 'file' },
      { id: 'image', name: 'cover.png', kind: 'file' },
      { id: 'song-2', name: '02 - Luce.mp3', kind: 'file' },
    ] });
    const urls = fetchImpl.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls).toHaveLength(4);
    expect(urls[0].pathname).toBe('/drive/v3/files/parent');
    expect(urls[0].searchParams.get('fields')).toBe('name');
    for (const url of urls) {
      expect(url.origin).toBe('https://www.googleapis.com');
      expect(url.searchParams.get('key')).toBe('key & value');
    }
    for (const url of urls.slice(1)) {
      expect(url.pathname).toBe('/drive/v3/files');
      expect(url.searchParams.get('q')).toBe("'parent' in parents and trashed=false");
      expect(url.searchParams.get('fields')).toBe('nextPageToken,files(id,name,mimeType)');
      expect(url.searchParams.get('pageSize')).toBe('1000');
    }
    expect(urls.slice(1).map((url) => url.searchParams.get('pageToken'))).toEqual([null, 'next+/=', 'last']);
  });

  test('accepts an empty API folder with no files property', async () => {
    const fetchImpl = mockedFetch().mockResolvedValueOnce(response({ name: 'Empty' })).mockResolvedValueOnce(response({}));
    await expect(createApiSource('key', fetchImpl).listFolder('root')).resolves.toEqual({ title: 'Empty', entries: [] });
  });

  test('escapes folder IDs inside the query and encodes the metadata path', async () => {
    const fetchImpl = mockedFetch().mockResolvedValueOnce(response({ name: 'Root' })).mockResolvedValueOnce(response({ files: [] }));
    await createApiSource('key', fetchImpl).listFolder("a'b\\c/d");
    const urls = fetchImpl.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls[0].pathname).toBe("/drive/v3/files/a'b%5Cc%2Fd");
    expect(urls[1].searchParams.get('q')).toBe("'a\\'b\\\\c/d' in parents and trashed=false");
  });

  test.each([403, 404, 500])('classifies HTTP %i on a listing page', async (status) => {
    const fetchImpl = mockedFetch().mockResolvedValueOnce(response({ name: 'Root' })).mockResolvedValueOnce(response({}, status));
    await expect(createApiSource('key', fetchImpl).listFolder('root')).rejects.toMatchObject({
      code: status === 500 ? 'http' : 'not_public', status,
    });
  });

  test('reports a rejected pagination fetch as network', async () => {
    const fetchImpl = mockedFetch()
      .mockResolvedValueOnce(response({ name: 'Root' }))
      .mockResolvedValueOnce(response({ files: [], nextPageToken: 'next' }))
      .mockRejectedValueOnce(new Error('Offline'));
    await expect(createApiSource('key', fetchImpl).listFolder('root')).rejects.toMatchObject({ code: 'network' });
  });

  test.each([null, [], {}, { name: 42 }])('reports invalid metadata as parse: %j', async (metadata) => {
    const fetchImpl = mockedFetch().mockResolvedValue(response(metadata));
    await expect(createApiSource('key', fetchImpl).listFolder('root')).rejects.toMatchObject({ code: 'parse' });
  });

  test.each([
    null, [], { files: 'wrong' }, { files: [null] }, { files: [{ name: 'Song', mimeType: 'audio/mpeg' }] },
    { files: [{ id: 'song', name: 'Song' }] }, { files: [], nextPageToken: 42 },
  ])('reports malformed list responses as parse: %j', async (page) => {
    const fetchImpl = mockedFetch().mockResolvedValueOnce(response({ name: 'Root' })).mockResolvedValueOnce(response(page));
    await expect(createApiSource('key', fetchImpl).listFolder('root')).rejects.toMatchObject({ code: 'parse' });
  });

  test('reports invalid JSON as parse', async () => {
    const broken = response(null);
    broken.json = jest.fn().mockRejectedValue(new SyntaxError('Invalid JSON'));
    const fetchImpl = mockedFetch().mockResolvedValue(broken);
    await expect(createApiSource('key', fetchImpl).listFolder('root')).rejects.toMatchObject({ code: 'parse' });
  });

  test('reports a JSON body transport failure as network', async () => {
    const broken = response(null);
    broken.json = jest.fn().mockRejectedValue(new Error('Disconnected'));
    const fetchImpl = mockedFetch().mockResolvedValue(broken);
    await expect(createApiSource('key', fetchImpl).listFolder('root')).rejects.toMatchObject({ code: 'network' });
  });

  test('rejects repeated page tokens instead of looping indefinitely', async () => {
    const fetchImpl = mockedFetch()
      .mockResolvedValueOnce(response({ name: 'Root' }))
      .mockResolvedValue(response({ files: [], nextPageToken: 'repeat' }));
    await expect(createApiSource('key', fetchImpl).listFolder('root')).rejects.toMatchObject({ code: 'parse' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe.each(sourceFactories)('%s source errors', (_name, createSource) => {
  test.each([403, 404])('maps HTTP %i to not_public', async (status) => {
    const fetchImpl = mockedFetch().mockResolvedValue(response({}, status));
    await expect(createSource(fetchImpl).listFolder('root')).rejects.toMatchObject({ name: 'CatalogError', code: 'not_public', status });
  });

  test.each([400, 401, 429, 500])('maps HTTP %i to http', async (status) => {
    const fetchImpl = mockedFetch().mockResolvedValue(response({}, status));
    await expect(createSource(fetchImpl).listFolder('root')).rejects.toMatchObject({ code: 'http', status });
  });

  test('maps a fetch rejection to network', async () => {
    const fetchImpl = mockedFetch().mockRejectedValue(new Error('Offline'));
    await expect(createSource(fetchImpl).listFolder('root')).rejects.toBeInstanceOf(CatalogError);
    await expect(createSource(fetchImpl).listFolder('root')).rejects.toMatchObject({ code: 'network' });
  });
});

describe('createDefaultSource', () => {
  let originalKey: string | undefined;
  beforeEach(() => { originalKey = process.env.EXPO_PUBLIC_DRIVE_API_KEY; });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.EXPO_PUBLIC_DRIVE_API_KEY;
    else process.env.EXPO_PUBLIC_DRIVE_API_KEY = originalKey;
    jest.restoreAllMocks();
  });

  test.each([undefined, '', '   '])('uses embedded folders for an empty key: %s', async (key) => {
    if (key === undefined) delete process.env.EXPO_PUBLIC_DRIVE_API_KEY;
    else process.env.EXPO_PUBLIC_DRIVE_API_KEY = key;
    const fetchImpl = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response('<title>Root</title><div class="flip-entries"></div>'));
    await expect(createDefaultSource().listFolder('root')).resolves.toEqual({ title: 'Root', entries: [] });
    expect(fetchImpl).toHaveBeenCalledWith('https://drive.google.com/embeddedfolderview?id=root');
  });

  test('uses the API when the public environment key is nonempty', async () => {
    process.env.EXPO_PUBLIC_DRIVE_API_KEY = '  test-key  ';
    const fetchImpl = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({ name: 'Root' }))
      .mockResolvedValueOnce(response({ files: [] }));
    await expect(createDefaultSource().listFolder('root')).resolves.toEqual({ title: 'Root', entries: [] });
    expect(fetchImpl.mock.calls.every(([input]) => new URL(String(input)).searchParams.get('key') === 'test-key')).toBe(true);
  });
});

test('the public index exports the complete runtime contract', () => {
  expect(Object.keys(catalog).sort()).toEqual([
    'CatalogError', 'buildLibrary', 'cleanTrackTitle', 'coverUrl', 'createApiSource',
    'createDefaultSource', 'createEmbeddedSource', 'extractFolderId', 'parseEmbeddedFolderView', 'streamUrl',
  ]);
  const error = new catalog.CatalogError('http', 'Failed', 500);
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({ name: 'CatalogError', message: 'Failed', code: 'http', status: 500 });
});
