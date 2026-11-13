import { fetch } from 'expo/fetch';

import { streamUrl } from '@/catalog';

/**
 * Archivos de Drive pedidos desde el teléfono: sin CORS, directos a la descarga pública.
 * `expo/fetch` lee el cuerpo como bytes (el fetch de React Native no siempre sabe).
 */
export async function fetchDriveBytes(fileId: string, length: number): Promise<Uint8Array> {
  const res = await fetch(streamUrl(fileId), { headers: { Range: `bytes=0-${length - 1}` } });
  if (!res.ok) throw new Error(`Drive respondió ${res.status}`);
  return res.bytes();
}

export async function fetchDriveText(fileId: string): Promise<string> {
  const res = await fetch(streamUrl(fileId));
  if (!res.ok) throw new Error(`Drive respondió ${res.status}`);
  return res.text();
}
