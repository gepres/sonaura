// Genera todos los iconos y el splash de Sonaura a partir de assets/brand/*.svg.
// Uso: npm run icons
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = (f) => path.join(root, 'assets', 'brand', f);
const out = (f) => path.join(root, 'assets', 'images', f);

const full = await readFile(brand('icon.svg'), 'utf8');

// Variantes derivadas del mismo SVG para no duplicar el dibujo.
const background = full.replace(/<g id="mark">[\s\S]*?<\/g>\s*<\/g>/, '');
const markOnly = full.replace(/<rect width="1024" height="1024" fill="url\(#bg\)"\/>/, '');
// El foreground adaptativo de Android se recorta a un círculo de ~61 % del lienzo:
// se reduce la marca para que el anillo quede dentro de la zona segura.
const scaled = (svg, k) =>
  svg.replace('<g id="mark">', `<g id="mark" transform="translate(${512 * (1 - k)} ${512 * (1 - k)}) scale(${k})">`);
const monochrome = scaled(markOnly, 0.8)
  .replace(/<circle[^>]*filter="url\(#glow\)"\/>/, '')
  .replace(/url\(#aura\)/g, '#FFFFFF')
  .replace(/url\(#bars\)/g, '#FFFFFF');

const render = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 });

const jobs = [
  ['icon.png', render(full, 1024).flatten({ background: '#0A0717' })],
  ['android-icon-background.png', render(background, 1024)],
  ['android-icon-foreground.png', render(scaled(markOnly, 0.8), 1024)],
  ['android-icon-monochrome.png', render(monochrome, 1024)],
  ['splash-icon.png', render(markOnly, 1024)],
  ['favicon.png', render(full, 48)],
];

for (const [name, pipeline] of jobs) {
  await writeFile(out(name), await pipeline.toBuffer());
  console.log('✓', name);
}
