/**
 * Letra guardada dentro del MP3, en su etiqueta ID3v2 (2.3 o 2.4).
 *
 * Suno la escribe en un frame `TXXX` con la descripción `lyrics-eng` (aunque la letra esté en
 * otro idioma); el estándar es `USLT`. Se aceptan los dos. Solo hace falta el principio del
 * archivo: la etiqueta va delante del audio.
 */

const syncsafe = (b: Uint8Array, o: number) =>
  ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);

const uint32 = (b: Uint8Array, o: number) => b[o] * 0x1000000 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);

/** Bytes que ocupa la etiqueta ID3 al inicio del archivo (cabecera incluida), o null si no hay. */
export function id3TagSize(head: Uint8Array): number | null {
  if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return null;
  const footer = head[5] & 0x10 ? 10 : 0;
  return 10 + syncsafe(head, 6) + footer;
}

/** Deshace la «desincronización» de ID3 (0xFF 0x00 → 0xFF). */
function unsync(b: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < b.length; i++) {
    out.push(b[i]);
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return Uint8Array.from(out);
}

function decodeUtf8(b: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(b);
  let out = '';
  for (let i = 0; i < b.length; ) {
    const c = b[i];
    let code = 0xfffd;
    let len = 1;
    if (c < 0x80) code = c;
    else if (c >= 0xc2 && c < 0xe0 && i + 1 < b.length) {
      code = ((c & 0x1f) << 6) | (b[i + 1] & 0x3f);
      len = 2;
    } else if (c >= 0xe0 && c < 0xf0 && i + 2 < b.length) {
      code = ((c & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f);
      len = 3;
    } else if (c >= 0xf0 && c < 0xf5 && i + 3 < b.length) {
      code = ((c & 0x07) << 18) | ((b[i + 1] & 0x3f) << 12) | ((b[i + 2] & 0x3f) << 6) | (b[i + 3] & 0x3f);
      len = 4;
    }
    out += String.fromCodePoint(code);
    i += len;
  }
  return out;
}

function decodeUtf16(b: Uint8Array, bigEndian: boolean): string {
  let start = 0;
  if (b[0] === 0xff && b[1] === 0xfe) {
    bigEndian = false;
    start = 2;
  } else if (b[0] === 0xfe && b[1] === 0xff) {
    bigEndian = true;
    start = 2;
  }
  let out = '';
  for (let i = start; i + 1 < b.length; i += 2) {
    out += String.fromCharCode(bigEndian ? (b[i] << 8) | b[i + 1] : (b[i + 1] << 8) | b[i]);
  }
  return out;
}

function decode(b: Uint8Array, encoding: number): string {
  switch (encoding) {
    case 1:
      return decodeUtf16(b, false);
    case 2:
      return decodeUtf16(b, true);
    case 3:
      return decodeUtf8(b);
    default: {
      let out = '';
      for (let i = 0; i < b.length; i++) out += String.fromCharCode(b[i]);
      return out;
    }
  }
}

/** Separa un texto terminado en nulo (uno o dos bytes según la codificación) del resto. */
function splitTerminated(b: Uint8Array, encoding: number): [Uint8Array, Uint8Array] {
  const wide = encoding === 1 || encoding === 2;
  for (let i = 0; i < b.length; i += wide ? 2 : 1) {
    if (b[i] === 0 && (!wide || b[i + 1] === 0)) return [b.subarray(0, i), b.subarray(i + (wide ? 2 : 1))];
  }
  return [b, new Uint8Array(0)];
}

const clean = (text: string) => text.replace(/\0+$/, '').replace(/\r\n?/g, '\n').trim();

/**
 * Letra del MP3 a partir de sus primeros bytes, o null si no la trae. Si `data` corta la
 * etiqueta a medias, se lee lo que haya (mejor pedir `id3TagSize` bytes).
 */
export function readId3Lyrics(data: Uint8Array): string | null {
  const size = id3TagSize(data);
  const major = data[3];
  if (size === null || (major !== 3 && major !== 4)) return null;
  const flags = data[5];
  let tag = data.subarray(10, Math.min(data.length, 10 + syncsafe(data, 6)));
  if (major === 3 && flags & 0x80) tag = unsync(tag);

  let pos = 0;
  if (flags & 0x40 && tag.length >= 4) pos = major === 4 ? syncsafe(tag, 0) : uint32(tag, 0) + 4;

  let uslt: string | null = null;
  let txxx: string | null = null;
  while (pos + 10 <= tag.length) {
    const id = String.fromCharCode(tag[pos], tag[pos + 1], tag[pos + 2], tag[pos + 3]);
    // Relleno o basura: se acabaron los frames.
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const frameSize = major === 4 ? syncsafe(tag, pos + 4) : uint32(tag, pos + 4);
    const format = tag[pos + 9];
    let body = tag.subarray(pos + 10, pos + 10 + frameSize);
    pos += 10 + frameSize;
    if (frameSize <= 1 || (id !== 'TXXX' && id !== 'USLT')) continue;
    if (major === 4) {
      // Comprimido o cifrado: no se puede leer.
      if (format & 0x0c) continue;
      if (format & 0x01) body = body.subarray(4);
      if (format & 0x02) body = unsync(body);
    } else if (format & 0xc0) {
      continue;
    }
    const encoding = body[0];
    if (id === 'TXXX') {
      const [description, value] = splitTerminated(body.subarray(1), encoding);
      if (!txxx && /^lyrics/i.test(decode(description, encoding).trim())) txxx = clean(decode(value, encoding)) || null;
    } else if (!uslt) {
      // Codificación, idioma (3 bytes), descripción y la letra.
      const [, value] = splitTerminated(body.subarray(4), encoding);
      uslt = clean(decode(value, encoding)) || null;
    }
  }
  return uslt ?? txxx;
}
