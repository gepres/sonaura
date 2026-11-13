/**
 * Líneas de letra listas para pintar, vengan del MP3 (sin tiempos) o de un `.lrc` (con tiempos).
 */

export type LyricLine = {
  text: string;
  /** Encabezado de sección («Verso 1», «(Intro — …)»): no se canta, se pinta como etiqueta. */
  section: boolean;
  /** Segundo en que empieza (solo en letras sincronizadas). */
  time: number | null;
  /** Empieza una estrofa nueva: se deja aire encima. */
  gap: boolean;
};

const SECTION_WORDS = [
  'intro',
  'outro',
  'verso',
  'verse',
  'strofa',
  'strophe',
  'coro',
  'chorus',
  'ritornello',
  'refrain',
  'refrán',
  'estribillo',
  'puente',
  'bridge',
  'ponte',
  'brücke',
  'pre-coro',
  'precoro',
  'pre-chorus',
  'prechorus',
  'pre-ritornello',
  'interludio',
  'interlude',
  'zwischenspiel',
  'instrumental',
  'hook',
  'final',
  'finale',
  'hablado',
  'spoken',
  'parlato',
  'gesprochen',
  'pre-refrain',
  'finaler',
  'schluss',
  'chiusura',
  'cierre',
  // Rótulos de voz en los duetos: «(Lei)», «Sie:», «(Entrambi — Mantra finale)».
  'lei',
  'lui',
  'entrambi',
  'ella',
  'él',
  'ambos',
  'sie',
  'er',
  'beide',
  'duetto',
  'dueto',
  'duet',
  'chor',
  'hintergrund',
  'background',
];
/** Guion normal y sus variantes tipográficas (Suno escribe «Pre‑Coro» con U+2011). */
const DASH = '[-\u2010-\u2015]';
const WORD = `(?:${SECTION_WORDS.map((w) => w.replace('-', `(?:${DASH}| )?`)).join('|')})`;
const sectionWord = new RegExp(
  // «Verso 2», «Finaler Refrain», «Coro final», «Coro Finale – Ampio», «Intro (susurrado)», «Coro:»
  `^${WORD}(?:\\s+${WORD})?(?:\\s*\\d+)?(?:\\s+(?:final|finale|finales|largo|corto|doble|x\\d+))?\\s*(?::|${DASH}.*|\\(.*\\))?\\s*$`,
  'i',
);

/** Lo que puede abrir un texto: letras, números, paréntesis y comillas. */
const opener = (ch: string) => /[0-9([{"“”„«»‘’'¿¡]/.test(ch) || ch.toLowerCase() !== ch.toUpperCase();

/** Quita los adornos del principio («🎶 [Coro – …]» → «[Coro – …]»). */
export function stripLeadingDecoration(text: string): string {
  const chars = Array.from(text.trim());
  let i = 0;
  while (i < chars.length && !opener(chars[i])) i++;
  return chars.slice(i).join('').trim();
}

/** La primera línea de la letra con raya es el título («Dietro la Maschera” – Versione Cantabile»). */
const isTitleLine = (text: string) => new RegExp(` ${DASH} `).test(text) && text.length <= 90;

/** Texto a pintar: a los encabezados se les quitan los adornos del principio. */
const display = (text: string, section: boolean) => (section ? stripLeadingDecoration(text) : text);

/**
 * Si la línea es un encabezado de sección y no algo que se canta.
 * - `[Coro]`: entre corchetes, siempre (son las etiquetas de Suno).
 * - `(Intro – Voce profonda)`: entre paréntesis, solo si empieza por una palabra de sección; si
 *   no, es un coro de fondo que se canta, como «(Metto il divino, l’amore per primo)».
 * - Sin paréntesis: una palabra de sección, con número o detalle opcional («Verso 1», «Coro final»).
 */
export function isSectionLine(text: string): boolean {
  const t = stripLeadingDecoration(text);
  if (!t) return false;
  if (/^\[.*\]$/.test(t)) return true;
  const paren = /^\((.*)\)$/.exec(t);
  // Una acotación con raya entre paréntesis: «(Schluss – Chor a cappella)», «(Métrica 7–10 sílabas)».
  if (paren && /[–—]| - /.test(paren[1])) return true;
  const inner = paren?.[1]?.trim() ?? t;
  return inner.length <= 60 && sectionWord.test(inner);
}

/**
 * La letra sin tiempos, tal como viene del MP3. La primera línea, si es un título con raya
 * («Dietro la Maschera — Versione Cantabile in Italiano»), también es encabezado.
 */
export function plainLyricLines(text: string): LyricLine[] {
  const lines: LyricLine[] = [];
  let gap = false;
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t) {
      gap = lines.length > 0;
      continue;
    }
    const section = isSectionLine(t) || (lines.length === 0 && isTitleLine(t));
    lines.push({ text: display(t, section), section, time: null, gap: gap || (section && lines.length > 0) });
    gap = false;
  }
  return lines;
}

const TIMESTAMP = /^\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/;

/** Letra sincronizada en formato LRC (`[mm:ss.xx]texto`). Ignora las cabeceras (`[ti:…]`). */
export function parseLrc(text: string): LyricLine[] {
  let offset = 0;
  const timed: { time: number; text: string; order: number }[] = [];
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const off = /^\[offset:\s*([+-]?\d+)\s*\]$/i.exec(line);
    if (off) {
      // Positivo = la letra va adelantada.
      offset = Number(off[1]) / 1000;
      continue;
    }
    const times: number[] = [];
    let rest = line;
    let m: RegExpExecArray | null;
    while ((m = TIMESTAMP.exec(rest))) {
      times.push(Number(m[1]) * 60 + Number(m[2].replace(':', '.')));
      rest = rest.slice(m[0].length);
    }
    for (const time of times) timed.push({ time, text: rest.trim(), order: timed.length });
  }
  timed.sort((a, b) => a.time - b.time || a.order - b.order);
  return timed.map(({ time, text: t }, i) => {
    const section = isSectionLine(t) || (i === 0 && isTitleLine(t));
    return { text: display(t, section), section, time: Math.max(0, time - offset), gap: section && i > 0 };
  });
}

/**
 * La línea que suena en `position`: la última cantada que ya empezó. Los encabezados no se
 * resaltan. -1 antes del primer verso. `lead` adelanta un poco el cambio, como al leer.
 */
export function activeLineIndex(lines: LyricLine[], position: number, lead = 0.25): number {
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    const time = lines[i].time;
    if (time === null) return -1;
    if (time > position + lead) break;
    if (!lines[i].section) active = i;
  }
  return active;
}
