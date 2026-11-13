import { id3TagSize, readId3Lyrics } from '../id3';

const utf8 = (s: string) => Array.from(new TextEncoder().encode(s));
const utf16le = (s: string) => {
  const out = [0xff, 0xfe];
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff, s.charCodeAt(i) >> 8);
  return out;
};
const syncsafe = (n: number) => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

function frame(id: string, body: number[], version: 3 | 4) {
  return [...Array.from(id, (c) => c.charCodeAt(0)), ...(version === 4 ? syncsafe(body.length) : be32(body.length)), 0, 0, ...body];
}

function tag(frames: number[][], version: 3 | 4 = 4, padding = 64) {
  const body = [...frames.flat(), ...new Array(padding).fill(0)];
  return Uint8Array.from([0x49, 0x44, 0x33, version, 0, 0, ...syncsafe(body.length), ...body, 0xff, 0xfb, 0x90]);
}

/** Como lo escribe Suno: TXXX con descripción «lyrics-eng», en UTF-8. */
const sunoLyrics = (text: string, version: 3 | 4 = 4) =>
  frame('TXXX', [3, ...utf8('lyrics-eng'), 0, ...utf8(text)], version);

const LETRA = 'Verso 1\nBajo mis pasos duerme un mundo que recuerda,\nun pulso antiguo que respira en la oscuridad.\nMe enseñaron a olvidar';

it('mide la etiqueta ID3 para saber cuántos bytes pedir', () => {
  const t = tag([sunoLyrics(LETRA)]);
  expect(id3TagSize(t)).toBe(t.length - 3);
  expect(id3TagSize(Uint8Array.from([0xff, 0xfb, 0x90, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
});

it('lee la letra que guarda Suno (TXXX lyrics-eng, UTF-8) entre otras etiquetas', () => {
  const t = tag([
    frame('TIT2', [3, ...utf8('Caminando')], 4),
    frame('TPE1', [3, ...utf8('lucisone')], 4),
    frame('TXXX', [3, ...utf8('comment'), 0, ...utf8('made with suno')], 4),
    sunoLyrics(LETRA),
  ]);
  expect(readId3Lyrics(t)).toBe(LETRA);
});

it('lee ID3v2.3 y la letra estándar (USLT) en UTF-16', () => {
  const t = tag([frame('USLT', [1, ...utf8('ita'), ...utf16le('desc'), 0, 0, ...utf16le('Dietro la Maschera\nInspira')], 3)], 3);
  expect(readId3Lyrics(t)).toBe('Dietro la Maschera\nInspira');
});

it('lee Latin-1 con acentos y diéresis', () => {
  const latin1 = Array.from('Präsenz eins\nIch bin', (c) => c.charCodeAt(0));
  const t = tag([frame('USLT', [0, ...utf8('deu'), 0, ...latin1], 4)]);
  expect(readId3Lyrics(t)).toBe('Präsenz eins\nIch bin');
});

it('un TXXX que no es de letra no se toma por letra', () => {
  const t = tag([frame('TXXX', [3, ...utf8('comment'), 0, ...utf8('made with suno')], 4)]);
  expect(readId3Lyrics(t)).toBeNull();
});

it('sin etiqueta ID3, o con la etiqueta cortada a medias, no rompe', () => {
  expect(readId3Lyrics(Uint8Array.from([0xff, 0xfb, 0x90, 0x00]))).toBeNull();
  const t = tag([frame('TIT2', [3, ...utf8('x')], 4), sunoLyrics(LETRA)]);
  expect(readId3Lyrics(t.subarray(0, 30))).toBeNull();
});

it('normaliza los saltos de línea de Windows', () => {
  expect(readId3Lyrics(tag([sunoLyrics('uno\r\ndos\r\n')]))).toBe('uno\ndos');
});
