// Genera <salida>/sitemap.xml tras `expo export -p web`: las páginas fijas y una por álbum.
// Los álbumes salen de la carpeta pública de Drive, igual que en la app (src/catalog/buildLibrary.ts):
// cada carpeta con audio, hasta 3 niveles, y la raíz si tiene canciones sueltas.
// Si Drive no responde, el sitemap lleva solo las páginas fijas: nunca rompe el export.
//
//   node scripts/sitemap.mjs dist-web

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SITE_URL = 'https://sonaura.genaropretill.com';
const STATIC_PAGES = ['/', '/descargar'];
const MAX_DEPTH = 3;
const AUDIO = /\.(mp3|m4a|aac|wav|flac)$/i;

async function rootFolderId() {
  if (process.env.EXPO_PUBLIC_DRIVE_FOLDER_ID) return process.env.EXPO_PUBLIC_DRIVE_FOLDER_ID;
  const config = await readFile(new URL('../src/config.ts', import.meta.url), 'utf8');
  const id = /DRIVE_FOLDER_ID\s*=[^']*'([A-Za-z0-9_-]+)'/.exec(config)?.[1];
  if (!id) throw new Error('No encuentro DRIVE_FOLDER_ID en src/config.ts');
  return id;
}

/** Entradas de una carpeta pública, desde la vista embebida de Drive (no necesita clave). */
async function listFolder(id) {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Drive respondió ${res.status} para ${id}`);
  const html = await res.text();
  const entries = [];
  const re = /<div class="flip-entry" id="entry-([A-Za-z0-9_-]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<div class="flip-entry-title">([^<]*)</g;
  for (let m; (m = re.exec(html)); ) {
    entries.push({ id: m[1], folder: m[2].includes('/folders/'), name: m[3] });
  }
  return entries;
}

async function albumIds(rootId) {
  const ids = [];
  const pending = [{ id: rootId, depth: 0 }];
  while (pending.length) {
    const { id, depth } = pending.shift();
    const entries = await listFolder(id);
    if (entries.some((e) => !e.folder && AUDIO.test(e.name))) ids.push(id);
    if (depth < MAX_DEPTH) for (const e of entries) if (e.folder) pending.push({ id: e.id, depth: depth + 1 });
  }
  return ids;
}

const outDir = process.argv[2] ?? 'dist-web';
let paths = [...STATIC_PAGES];
try {
  const albums = await albumIds(await rootFolderId());
  paths = [...paths, ...albums.map((id) => `/album/${id}`)];
  console.log(`sitemap: ${STATIC_PAGES.length} páginas fijas y ${albums.length} álbumes`);
} catch (error) {
  console.warn(`sitemap: sin álbumes (${error.message}); solo las páginas fijas`);
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join('\n')}
</urlset>
`;
await writeFile(join(outDir, 'sitemap.xml'), xml);
