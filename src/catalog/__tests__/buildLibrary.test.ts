/// <reference types="jest" />
/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildLibrary, cleanTrackTitle } from '../buildLibrary';
import { coverUrl, streamUrl } from '../driveUrls';
import { parseEmbeddedFolderView } from '../embeddedFolderView';
import { CatalogError, type DriveEntry, type FolderListing, type FolderSource } from '../types';

const rootId = '1Bj2CW9jD-rbQwdVeB7ZEOkkI9obYZBMw';
const esistenzaId = '1hI64DMOsDHSJjYDBj1mQsohQhP_cWwyv';
const file = (id: string, name: string): DriveEntry => ({ id, name, kind: 'file' });
const folder = (id: string, name = id): DriveEntry => ({ id, name, kind: 'folder' });

function fixtureSource(): FolderSource {
  return {
    async listFolder(id) {
      const fixture = id === rootId ? 'root' : id;
      return parseEmbeddedFolderView(readFileSync(join(__dirname, '..', '__fixtures__', `${fixture}.html`), 'utf8'));
    },
  };
}

function fakeSource(listings: Record<string, FolderListing>) {
  return { listFolder: jest.fn(async (id: string) => listings[id]) };
}

describe('cleanTrackTitle', () => {
  test.each<[string, string, number | null]>([
    ['01 - Caminar descalzo.mp3', 'Caminar descalzo', 1],
    ['04 - il Risveglio.mp3', 'Il Risveglio', 4],
    ['1. song.MP3', 'Song', 1],
    ['01_song.mp3', 'Song', 1],
    ['07) song.mp3', 'Song', 7],
    ['10 song.wav', 'Song', 10],
    ['02-song_name.FLAC', 'Song name', 2],
    ['track-1-salsa.mp3', 'Track 1 salsa', null],
    ['track_2_salsa.m4a', 'Track 2 salsa', null],
    ['  canción   del\tmar.aac  ', 'Canción del mar', null],
    ['música en vivo - parte_2.mp3', 'Música en vivo - parte_2', null],
    ['la_luce_dell’Essere.mp3', 'La luce dell’Essere', null],
    ['präsenz.mp3', 'Präsenz', null],
    ['Song 10.mp3', 'Song 10', null],
    ['1984.mp3', '1984', null],
    ['song.v2.mp3', 'Song.v2', null],
    ['song', 'Song', null],
    ['', '', null],
  ])('cleans %s', (fileName, title, trackNumber) => {
    expect(cleanTrackTitle(fileName)).toEqual({ title, trackNumber });
  });
});

describe('buildLibrary', () => {
  test('builds all four fixture albums, with loose root tracks last', async () => {
    const library = await buildLibrary(rootId, fixtureSource(), { now: () => 123456 });
    expect(library).toMatchObject({ rootId, rootTitle: 'musica', fetchedAt: 123456 });
    expect(library.albums.map((album) => [album.title, album.tracks.length, album.isRoot])).toEqual([
      ['Esistenza', 4, false],
      ['Ich bin Präsenz', 2, false],
      ['La Luce dell’Essere', 5, false],
      ['Sueltos', 7, true],
    ]);
    const loose = library.albums[3];
    expect(loose.id).toBe(rootId);
    expect(loose.coverUrl).toBeNull();
    expect(loose.tracks.map((track) => track.fileName)).toEqual([
      'track-1-salsa.mp3', 'track-2-salsa.mp3', 'track-3-salsa.mp3', 'track-4.mp3',
      'track-5-salsa.mp3', 'track-6-salsa.mp3', 'track-7.mp3',
    ]);
    expect(loose.tracks.every((track) => track.trackNumber === null && track.artworkUrl === null)).toBe(true);

    const esistenza = library.albums[0];
    const artwork = 'https://drive.google.com/thumbnail?id=1K8BIiwYbkhsyAz4MyyrBJOAe1ytdn8HI&sz=w600';
    expect(esistenza.coverUrl).toBe(artwork);
    expect(esistenza.tracks[0]).toEqual({
      id: '1ClGiQrrhzPN2-usxTK1VDDm4ZwOhoZPu',
      title: 'Caminar descalzo', fileName: '01 - Caminar descalzo.mp3', trackNumber: 1,
      albumId: esistenzaId, albumTitle: 'Esistenza', artworkUrl: artwork,
      streamUrl: 'https://drive.usercontent.google.com/download?id=1ClGiQrrhzPN2-usxTK1VDDm4ZwOhoZPu&export=download',
    });
    expect(esistenza.tracks.map((track) => track.trackNumber)).toEqual([1, 2, 3, 4]);
    for (const album of library.albums) {
      for (const track of album.tracks) {
        expect(track.streamUrl).toBe(streamUrl(track.id));
        expect(track.artworkUrl).toBe(album.coverUrl);
        expect(track.albumId).toBe(album.id);
        expect(track.albumTitle).toBe(album.title);
      }
    }
  });

  test('skips a failed subfolder and retains successful albums', async () => {
    const fixtures = fixtureSource();
    const source: FolderSource = {
      async listFolder(id) {
        if (id === esistenzaId) throw new CatalogError('not_public');
        return fixtures.listFolder(id);
      },
    };
    const library = await buildLibrary(rootId, source);
    expect(library.albums.map((album) => album.title)).toEqual(['Ich bin Präsenz', 'La Luce dell’Essere', 'Sueltos']);
  });

  test('also skips a subfolder source that throws before returning a promise', async () => {
    const source: FolderSource = {
      listFolder(id) {
        if (id !== 'root') throw new CatalogError('network');
        return Promise.resolve({ title: 'Root', entries: [folder('child'), file('song', 'song.mp3')] });
      },
    };
    expect((await buildLibrary('root', source)).albums.map((album) => album.id)).toEqual(['root']);
  });

  test('propagates the original root error', async () => {
    const error = new CatalogError('network', 'Offline');
    const source = { listFolder: jest.fn().mockRejectedValue(error) };
    await expect(buildLibrary(rootId, source)).rejects.toBe(error);
    expect(source.listFolder).toHaveBeenCalledTimes(1);
  });

  test('never revisits a folder, including cycles and shared descendants', async () => {
    const source = fakeSource({
      root: { title: 'Root', entries: [folder('a', 'A'), folder('a', 'Duplicate'), folder('b', 'B')] },
      a: { title: 'A', entries: [folder('root'), folder('b'), file('song-a', 'song.mp3')] },
      b: { title: 'B', entries: [folder('a'), file('song-b', 'song.mp3')] },
    });
    const library = await buildLibrary('root', source, { maxDepth: 20 });
    expect(source.listFolder.mock.calls.map(([id]) => id)).toEqual(['root', 'a', 'b']);
    expect(library.albums.map((album) => [album.id, album.title])).toEqual([['a', 'A'], ['b', 'B']]);
  });

  test('keeps exploring audio-less parents and joins descendant folder titles', async () => {
    const source = fakeSource({
      root: { title: 'Root', entries: [folder('parent', 'Parent')] },
      parent: { title: 'Parent', entries: [folder('child', 'Child'), file('cover', 'cover.jpg')] },
      child: { title: 'Child', entries: [folder('leaf', 'Leaf'), file('song', 'song.mp3')] },
      leaf: { title: null, entries: [file('leaf-song', 'leaf.mp3')] },
    });
    const library = await buildLibrary('root', source);
    expect(library.albums.map((album) => album.title)).toEqual(['Parent · Child', 'Parent · Child · Leaf']);
    expect(library.albums.every((album) => album.coverUrl === null && !album.isRoot)).toBe(true);
  });

  test.each([0, 1, 2, 3])('includes folder depth %i and does not fetch deeper folders', async (maxDepth) => {
    const source = fakeSource({
      root: { title: 'Root', entries: [folder('a'), file('root-song', 'song.mp3')] },
      a: { title: 'A', entries: [folder('b'), file('a-song', 'song.mp3')] },
      b: { title: 'B', entries: [folder('c'), file('b-song', 'song.mp3')] },
      c: { title: 'C', entries: [folder('d'), file('c-song', 'song.mp3')] },
      d: { title: 'D', entries: [file('d-song', 'song.mp3')] },
    });
    const library = await buildLibrary('root', source, { maxDepth });
    expect(source.listFolder.mock.calls.map(([id]) => id)).toEqual(['root', 'a', 'b', 'c'].slice(0, maxDepth + 1));
    expect(library.albums).toHaveLength(maxDepth + 1);
    expect(library.albums[library.albums.length - 1].isRoot).toBe(true);
  });

  test('defaults to three nested levels', async () => {
    const source = {
      listFolder: jest.fn(async (id: string) => ({
        title: `Level ${id}`, entries: [folder(String(Number(id) + 1)), file(`song-${id}`, 'song.mp3')],
      })),
    };
    await buildLibrary('0', source);
    expect(source.listFolder.mock.calls.map(([id]) => id)).toEqual(['0', '1', '2', '3']);
  });

  test('fetches siblings concurrently with a global cap of four, including descendants', async () => {
    let active = 0;
    let peak = 0;
    const starts: string[] = [];
    const source: FolderSource = {
      async listFolder(id) {
        if (id === 'root') return { title: 'Root', entries: Array.from({ length: 9 }, (_, i) => folder(`album-${i}`)) };
        starts.push(id);
        active += 1;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return {
          title: id,
          entries: [file(`song-${id}`, 'song.mp3'), ...(id.startsWith('album-') ? [folder(`child-${id}`)] : [])],
        };
      },
    };
    const library = await buildLibrary('root', source);
    expect(peak).toBe(4);
    expect(active).toBe(0);
    expect(starts).toHaveLength(18);
    expect(library.albums).toHaveLength(18);
    expect(new Set(starts).size).toBe(18);
  });

  test('includes all supported audio extensions and ignores non-audio files and audio-named folders', async () => {
    const source = fakeSource({ root: {
      title: 'Root', entries: [
        ...['mp3', 'M4A', 'AaC', 'WAV', 'FLAC'].map((extension, i) => file(String(i), `${i + 1} - song.${extension}`)),
        file('text', 'notes.txt'), file('ogg', 'song.ogg'), file('backup', 'song.mp3.bak'), folder('fake', 'song.mp3'),
      ],
    } });
    const library = await buildLibrary('root', source, { maxDepth: 0 });
    expect(library.albums[0].tracks.map((track) => track.id)).toEqual(['0', '1', '2', '3', '4']);
  });

  test.each(['CoVeR.JPG', 'folder.JPEG', 'FRONT.PNG', 'Portada.webp', 'artwork.jpg'])('prefers a named cover: %s', async (name) => {
    const source = fakeSource({ root: { title: 'Root', entries: [file('first', 'photo.jpg'), file('cover', name), file('song', 'song.mp3')] } });
    const album = (await buildLibrary('root', source)).albums[0];
    expect(album.coverUrl).toBe(coverUrl('cover'));
    expect(album.tracks[0].artworkUrl).toBe(coverUrl('cover'));
  });

  test('falls back to the first supported image, keeping the source listing unchanged', async () => {
    const listing = { title: 'Root', entries: [file('unsupported', 'cover.gif'), file('first', 'photo.webp'), file('second', 'other.png'), file('song', 'song.mp3')] };
    const before = JSON.stringify(listing);
    const source = fakeSource({ root: listing });
    const album = (await buildLibrary('root', source)).albums[0];
    expect(album.coverUrl).toBe(coverUrl('first'));
    expect(JSON.stringify(listing)).toBe(before);
  });

  test('sorts track numbers first and ties/un-numbered files naturally', async () => {
    const source = fakeSource({ root: { title: 'Root', entries: [
      file('ten', 'track-10.mp3'), file('one-ten', '01 - song 10.MP3'), file('two', '2. second.wav'),
      file('one-two', '01 - Song 2.mp3'), file('natural-two', 'track-2.mp3'), file('zero', '00_start.aac'),
    ] } });
    expect((await buildLibrary('root', source)).albums[0].tracks.map((track) => track.id)).toEqual([
      'zero', 'one-two', 'one-ten', 'two', 'natural-two', 'ten',
    ]);
  });

  test('sorts albums naturally and keeps even an alphabetically earlier root album last', async () => {
    const source = fakeSource({
      root: { title: 'Root', entries: [folder('ten'), folder('two'), folder('one'), file('root-song', 'song.mp3')] },
      ten: { title: 'Album 10', entries: [file('ten-song', 'song.mp3')] },
      two: { title: 'album 2', entries: [file('two-song', 'song.mp3')] },
      one: { title: 'Album 1', entries: [file('one-song', 'song.mp3')] },
    });
    const library = await buildLibrary('root', source, { rootAlbumTitle: 'AAA', now: () => 42 });
    expect(library.albums.map((album) => album.title)).toEqual(['Album 1', 'album 2', 'Album 10', 'AAA']);
    expect(library.albums[3].tracks[0].albumTitle).toBe('AAA');
    expect(library.fetchedAt).toBe(42);
  });

  test('drops empty albums and uses the root ID when its title is unavailable', async () => {
    const library = await buildLibrary('root', fakeSource({ root: { title: null, entries: [file('image', 'cover.jpg')] } }));
    expect(library).toMatchObject({ rootId: 'root', rootTitle: 'root', albums: [] });
    expect(library.fetchedAt).toEqual(expect.any(Number));
  });
});
