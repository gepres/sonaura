/// <reference types="jest" />
/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseEmbeddedFolderView } from '../embeddedFolderView';
import { CatalogError, type DriveEntry } from '../types';

const file = (id: string, name: string): DriveEntry => ({ id, name, kind: 'file' });
const folder = (id: string, name: string): DriveEntry => ({ id, name, kind: 'folder' });

const fixtures: [string, string, DriveEntry[]][] = [
  ['root.html', 'musica', [
    folder('1hI64DMOsDHSJjYDBj1mQsohQhP_cWwyv', 'Esistenza'),
    folder('1Z0LYoPj4cnziNinTw3d88YU3qRcs2UlO', 'Ich bin Präsenz'),
    folder('1FI4hA6pdDLxDUbj7nMux_RAiUBvGo_Cj', 'La Luce dell’Essere'),
    file('1cxb9LDRKp84twc2plF8qmBdeKZH5AL0j', 'track-1-salsa.mp3'),
    file('1fwfs7wihbleu-sQ_oM11WaKODd5cAfAT', 'track-2-salsa.mp3'),
    file('1HSR7qJ3nweTVAPTPFzUJJf89KQzccQJz', 'track-3-salsa.mp3'),
    file('1c7zRn06ejB6a9NOJAZTTPb3A-scdCa9r', 'track-4.mp3'),
    file('13qFArkX9ZGlX8m9V8NaUKvobQe8E2rA8', 'track-5-salsa.mp3'),
    file('1kBKV0leawZCa63r-X7vxxJcYD2qlaBPx', 'track-6-salsa.mp3'),
    file('1GjZlw7z0Qz9G2B26Nihj_bu0uGjufe2t', 'track-7.mp3'),
  ]],
  ['1hI64DMOsDHSJjYDBj1mQsohQhP_cWwyv.html', 'Esistenza', [
    file('1ClGiQrrhzPN2-usxTK1VDDm4ZwOhoZPu', '01 - Caminar descalzo.mp3'),
    file('13liGdMQojOsTDD0TDFmERSb8KYw8thB8', '02 - Deja de huir.mp3'),
    file('1uRLNOt3_ljEi1MmLOo8Rg3t1x-pFvOZs', '03 - Recordando quién soy.mp3'),
    file('1oWhy6SBCmutwXx71tAOq9ZRxdXRToh8P', '04 - Mi Ego es el Insurrecto.mp3'),
    file('1K8BIiwYbkhsyAz4MyyrBJOAe1ytdn8HI', 'cover.png'),
  ]],
  ['1Z0LYoPj4cnziNinTw3d88YU3qRcs2UlO.html', 'Ich bin Präsenz', [
    file('14IoEdEOOjkfea2A9KY-BAAE2C3g7dTyy', '01 - Die Maske eins.mp3'),
    file('19lG9oBxeFCGTYEksQY3qJDiRLbHOlJBM', '02 - Präsenz eins.mp3'),
    file('16hZgBwMwNbqRgVG6XfHNZA2c32Yykequ', 'cover.jpg'),
  ]],
  ['1FI4hA6pdDLxDUbj7nMux_RAiUBvGo_Cj.html', 'La Luce dell’Essere', [
    file('1Ve3UABvqlLV9wHhTstSipZa8sUbCmd-p', '01 - La Maschera.mp3'),
    file('1n6_1he5Mm8CLPGcmWeKMWBhYWMHZZ0al', '02 - La scintilla.mp3'),
    file('1D6LiLBMKfgjjxnrI-EA0pyaWOATiwj_9', '03 - La Luce dell’Essere.mp3'),
    file('1MpxeZIiDizASElaTbZuzlA2xKGxFV03q', '04 - il Risveglio.mp3'),
    file('19yKWdXbsI1aAcELtJOPUIU0OtXjPh_ub', '05 - Coscienza Primigenia.mp3'),
    file('12krV1IpK1v9fpDzeIFhCD9_7G0nMHD-C', 'cover.jpg'),
  ]],
];

function entryHtml(name: string): string {
  return `<div class="flip-entry" id="entry-song"><a href="https://drive.google.com/file/d/song/view"><div class="flip-entry-title">${name}</div></a></div>`;
}

describe('parseEmbeddedFolderView', () => {
  test.each(fixtures)('reads every ID, name and kind in %s', (fixture, title, entries) => {
    const html = readFileSync(join(__dirname, '..', '__fixtures__', fixture), 'utf8');
    expect(parseEmbeddedFolderView(html)).toEqual({ title, entries });
  });

  test.each([
    ['A &amp; B &lt;live&gt; &quot;yes&quot; &apos;ok&apos;', 'A & B <live> "yes" \'ok\''],
    ['La Luce dell&#39;Essere', "La Luce dell'Essere"],
    ['La Luce dell&#8217;Essere', 'La Luce dell’Essere'],
    ['La Luce dell&#x2019;Essere', 'La Luce dell’Essere'],
    ['La Luce dell&#X2019;Essere', 'La Luce dell’Essere'],
    ['Ich bin Pr&auml;senz &Auml; &eacute; &ntilde;', 'Ich bin Präsenz Ä é ñ'],
    ['Präsenz · Luce dell’Essere', 'Präsenz · Luce dell’Essere'],
    ['A&nbsp;B &ndash; C &mdash; D &rsquo; &hellip;', 'A\u00a0B – C — D ’ …'],
    ['Music &#x1F3B5; &#127925;', 'Music 🎵 🎵'],
    ['Keep &unknown; &amp;#39;', 'Keep &unknown; &#39;'],
    ['Invalid &#0; &#xD800; &#1114112;', 'Invalid � � �'],
  ])('decodes entities once in titles and names: %s', (encoded, decoded) => {
    const listing = parseEmbeddedFolderView(`<title>${encoded}</title><div class="flip-entries">${entryHtml(encoded)}</div>`);
    expect(listing.title).toBe(decoded);
    expect(listing.entries[0].name).toBe(decoded);
  });

  test('handles attribute order, single quotes, extra class tokens and nested title markup', () => {
    const html = `<title>A &amp; B</title><DIV data-x='1' class='extra flip-entries list'>
      <div id='entry-child' class='extra flip-entry'>
        <a target='_blank' href='https://drive.google.com/drive/u/0/folders/child?usp=sharing&amp;x=1'>
          <div class='flip-entry-title extra'><span>Präsenz &amp; Luce</span></div>
        </a>
      </div>
    </DIV>`;
    expect(parseEmbeddedFolderView(html)).toEqual({ title: 'A & B', entries: [folder('child', 'Präsenz & Luce')] });
  });

  test.each([
    '<html><title>Sign in - Google Accounts</title><form action="https://accounts.google.com/">Sign in</form></html>',
    '<html><title>Access denied</title>You need access</html>',
    '<html><script>const html = \'<div class="flip-entries"></div>\';</script></html>',
    '<!-- <div class="flip-entries"></div> -->',
    '<div class="flip-entries-other"></div>',
  ])('reports not_public without a real entries container: %s', (html) => {
    expect(() => parseEmbeddedFolderView(html)).toThrow(CatalogError);
    expect(() => parseEmbeddedFolderView(html)).toThrow(expect.objectContaining({ code: 'not_public' }));
  });

  test('returns an empty public folder', () => {
    expect(parseEmbeddedFolderView('<title>Empty</title><div class="flip-entries"></div>')).toEqual({ title: 'Empty', entries: [] });
  });

  test('returns null when the public folder has no page title', () => {
    expect(parseEmbeddedFolderView('<div class="flip-entries"></div>')).toEqual({ title: null, entries: [] });
  });

  test('limits entries to the container and ignores scripts and comments', () => {
    const html = `${entryHtml('Outside.mp3')}<div class="flip-entries">
      <script>${entryHtml('Script.mp3')}</script><!-- ${entryHtml('Comment.mp3')} -->
      ${entryHtml('Inside.mp3')}</div>`;
    expect(parseEmbeddedFolderView(html).entries).toEqual([file('song', 'Inside.mp3')]);
  });

  test.each([
    '<div class="flip-entries">',
    `<div class="flip-entries">${entryHtml('Song.mp3').replace('id="entry-song"', '')}</div>`,
    `<div class="flip-entries">${entryHtml('Song.mp3').replace('/file/d/song/', '/file/d/different/')}</div>`,
    '<div class="flip-entries"><div class="flip-entry" id="entry-song"><a href="/file/d/song/view">Song</a></div></div>',
  ])('reports malformed public markup as parse: %s', (html) => {
    expect(() => parseEmbeddedFolderView(html)).toThrow(expect.objectContaining({ code: 'parse' }));
  });
});
