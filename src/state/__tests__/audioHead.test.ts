import { assertIsAudioHead } from '../audioHead';

const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

it('acepta un MP3 con cabecera ID3', () => {
  expect(() => assertIsAudioHead(bytes('ID3\u0004\u0000\u0000\u0000\u0000\u0001\u000cTXXX'))).not.toThrow();
});

it('acepta un MP3 que empieza por un frame (0xFF 0xFB)', () => {
  expect(() => assertIsAudioHead(Uint8Array.from([0xff, 0xfb, 0x90, 0x64, 0x00]))).not.toThrow();
});

it('rechaza la página HTML de cuota de Drive', () => {
  expect(() => assertIsAudioHead(bytes('\n  <!DOCTYPE html><html><head><title>Google Drive'))).toThrow(/limitó/);
  expect(() => assertIsAudioHead(bytes('<html lang="es">'))).toThrow(/limitó/);
});

it('rechaza una descarga vacía', () => {
  expect(() => assertIsAudioHead(new Uint8Array())).toThrow(/vacía/);
});
