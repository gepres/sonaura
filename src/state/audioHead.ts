/**
 * Drive devuelve una página HTML (no el audio) cuando limita la descarga de un archivo.
 * Se miran solo los primeros bytes, sin decodificar el binario como texto.
 */
export function assertIsAudioHead(head: Uint8Array) {
  if (head.length === 0) throw new Error('Descarga vacía');
  const text = String.fromCharCode(...head.subarray(0, 512))
    .trimStart()
    .toLowerCase();
  if (text.startsWith('<') && (text.includes('<html') || text.includes('<!doctype'))) {
    throw new Error('Drive limitó la descarga, inténtalo más tarde');
  }
}
