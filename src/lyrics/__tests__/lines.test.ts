import { activeLineIndex, isSectionLine, parseLrc, plainLyricLines } from '../lines';

describe('isSectionLine', () => {
  test.each([
    'Verso 1',
    'Coro',
    'Coro:',
    'Estribillo 2',
    'Pre-coro',
    'Pre‑Coro', // con guion no separable (U+2011), como lo escribe Suno
    'Pre Chorus',
    'Puente',
    'Outro',
    'Strofa 2',
    'Ritornello',
    'Strophe 1',
    'Refrain',
    '(Intro — Voce profonda, con eco)',
    '(Intro – Voce profonda, con eco)',
    '(Verso 1)',
    '[Chorus]',
    '[Instrumental break]',
    'Intro — voz susurrada',
    'Coro final',
    '(Coro Finale – Ampio, luminoso)',
    // Lo que encontró el script de alineación en la letra real:
    '🎶 [Coro – Más lento, íntimo]',
    '(Lei)',
    '(Entrambi)',
    'Sie:',
    'Er:',
    '(Pre-Refrain)',
    '(Finaler Refrain – Weit, mystisch, expansiv)',
    '(Schluss – Chor a cappella)',
    '(Hintergrund)',
    '(Hoch Deutsch aus Hannover– Cinematic)',
    '(Métrica 7–10 sílabas por verso)',
    'Chiusura (Duetto — sussurrato)',
    'Finaler Refrain',
  ])('%s es un encabezado', (line) => expect(isSectionLine(line)).toBe(true));

  test.each([
    '(Metto il divino, l’amore per primo)', // coro de fondo: Suno canta lo que va entre paréntesis
    'Bajo mis pasos duerme un mundo que recuerda,',
    'Inspira',
    'Non sei il volto che lo specchio ti dà',
    'Coro de voces que me llaman desde lejos',
    'Final de mi camino, empieza el viaje',
  ])('%s se canta', (line) => expect(isSectionLine(line)).toBe(false));
});

it('la letra del MP3: encabezados, estrofas y el título con raya', () => {
  const lines = plainLyricLines('Dietro la Maschera — Versione Cantabile in Italiano\n\n(Intro — Voce profonda)\nInspira\nEspira\n\nVerso 1\nNon sei il volto\n');
  expect(lines.map((l) => [l.text, l.section, l.gap])).toEqual([
    ['Dietro la Maschera — Versione Cantabile in Italiano', true, false],
    ['(Intro — Voce profonda)', true, true],
    ['Inspira', false, false],
    ['Espira', false, false],
    ['Verso 1', true, true],
    ['Non sei il volto', false, false],
  ]);
  expect(lines.every((l) => l.time === null)).toBe(true);
});

describe('parseLrc', () => {
  it('lee tiempos, ignora cabeceras y ordena', () => {
    const lines = parseLrc('﻿[ti:Caminar descalzo]\n[al:Esistenza]\n[00:12.50]Verso 1\n[00:12.50]Bajo mis pasos\n[01:02.05]un pulso antiguo\n\n[00:40.00]Coro\n');
    expect(lines.map((l) => [l.time, l.text, l.section])).toEqual([
      [12.5, 'Verso 1', true],
      [12.5, 'Bajo mis pasos', false],
      [40, 'Coro', true],
      [62.05, 'un pulso antiguo', false],
    ]);
  });

  it('varias marcas en una línea (un estribillo que se repite) y offset', () => {
    const lines = parseLrc('[offset:500]\n[00:10.00][00:30.00]Respira\n[00:20.00]Suelta');
    expect(lines.map((l) => [l.time, l.text])).toEqual([
      [9.5, 'Respira'],
      [19.5, 'Suelta'],
      [29.5, 'Respira'],
    ]);
  });

  it('la primera línea con raya es el título, y a los encabezados se les quita el adorno', () => {
    const lines = parseLrc('[00:00.50]Dietro la Maschera” – Versione Cantabile\n[00:00.50]Inspira…\n[00:20.00]🎶 [Coro – Ampio]\n[00:20.00]Sono chi guarda');
    expect(lines.map((l) => [l.text, l.section])).toEqual([
      ['Dietro la Maschera” – Versione Cantabile', true],
      ['Inspira…', false],
      ['[Coro – Ampio]', true],
      ['Sono chi guarda', false],
    ]);
  });

  it('un archivo sin marcas de tiempo no da líneas', () => {
    expect(parseLrc('solo texto\nsin tiempos')).toEqual([]);
  });
});

it('el verso activo es el último que empezó, sin contar encabezados', () => {
  const lines = parseLrc('[00:05.00](Intro)\n[00:05.00]Inspira\n[00:09.00]Espira\n[00:15.00]Verso 1\n[00:15.00]Non sei il volto');
  expect(activeLineIndex(lines, 1)).toBe(-1);
  expect(activeLineIndex(lines, 5)).toBe(1);
  expect(activeLineIndex(lines, 8.9)).toBe(2);
  expect(activeLineIndex(lines, 14)).toBe(2);
  expect(activeLineIndex(lines, 15)).toBe(4);
  expect(activeLineIndex(plainLyricLines('a\nb'), 3)).toBe(-1);
});
