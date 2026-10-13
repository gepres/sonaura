import { CatalogError, type DriveEntry, type FolderListing } from './types';

const namedEntities: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  hellip: '…', middot: '·', bull: '•', copy: '©', reg: '®', trade: '™',
  laquo: '«', raquo: '»', euro: '€', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009',
  iexcl: '¡', cent: '¢', pound: '£', curren: '¤', yen: '¥', brvbar: '¦', sect: '§',
  uml: '¨', ordf: 'ª', not: '¬', shy: '\u00ad', macr: '¯', deg: '°', plusmn: '±',
  sup2: '²', sup3: '³', acute: '´', micro: 'µ', para: '¶', cedil: '¸', sup1: '¹',
  ordm: 'º', frac14: '¼', frac12: '½', frac34: '¾', iquest: '¿', times: '×', divide: '÷',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ',
  Ccedil: 'Ç', Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë', Igrave: 'Ì', Iacute: 'Í',
  Icirc: 'Î', Iuml: 'Ï', ETH: 'Ð', Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô',
  Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø', Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü',
  Yacute: 'Ý', THORN: 'Þ', szlig: 'ß', agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã',
  auml: 'ä', aring: 'å', aelig: 'æ', ccedil: 'ç', egrave: 'è', eacute: 'é', ecirc: 'ê',
  euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï', eth: 'ð', ntilde: 'ñ',
  ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø', ugrave: 'ù',
  uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý', thorn: 'þ', yuml: 'ÿ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]*);/gi, (entity: string, name: string) => {
    if (!name.startsWith('#')) {
      return Object.prototype.hasOwnProperty.call(namedEntities, name) ? namedEntities[name] : entity;
    }
    const hex = name[1].toLowerCase() === 'x';
    const codePoint = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      return '\ufffd';
    }
    return String.fromCodePoint(codePoint);
  });
}

function attribute(tag: string, name: string): string | null {
  const attributes = /(?:^|\s)([a-z][a-z\d:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = attributes.exec(tag))) {
    if (match[1].toLowerCase() === name) return decodeEntities(match[2] ?? match[3] ?? match[4]);
  }
  return null;
}

type DivBlock = { openingTag: string; content: string };

function divsWithClass(html: string, className: string): DivBlock[] {
  const result: DivBlock[] = [];
  const tags = /<\/?div\b[^>]*>/gi;
  let tag: RegExpExecArray | null;
  while ((tag = tags.exec(html))) {
    if (/^<\//.test(tag[0]) || !attribute(tag[0], 'class')?.split(/\s+/).includes(className)) continue;
    const openingTag = tag[0];
    const start = tags.lastIndex;
    let depth = 1;
    while ((tag = tags.exec(html))) {
      depth += /^<\//.test(tag[0]) ? -1 : 1;
      if (depth === 0) break;
    }
    if (!tag) throw new CatalogError('parse', `Unclosed ${className} container.`);
    result.push({ openingTag, content: html.slice(start, tag.index) });
  }
  return result;
}

function textContent(html: string): string {
  // Strip tags before decoding so a literal encoded '<...>' remains part of a name.
  return decodeEntities(html.replace(/<[^>]*>/g, '')).trim();
}

export function parseEmbeddedFolderView(html: string): FolderListing {
  const markup = html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const containers = divsWithClass(markup, 'flip-entries');
  if (containers.length === 0) {
    throw new CatalogError('not_public', 'The Drive folder is not publicly accessible.');
  }

  const entries: DriveEntry[] = [];
  for (const container of containers) {
    for (const entry of divsWithClass(container.content, 'flip-entry')) {
      const id = /^entry-([A-Za-z0-9_-]+)$/.exec(attribute(entry.openingTag, 'id') ?? '')?.[1];
      const title = divsWithClass(entry.content, 'flip-entry-title')[0];
      let kind: DriveEntry['kind'] | null = null;
      const anchors = entry.content.match(/<a\b[^>]*>/gi) ?? [];
      for (const anchor of anchors) {
        const href = attribute(anchor, 'href') ?? '';
        const folder = /\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]+)(?=[/?#]|$)/.exec(href);
        const file = /\/file\/d\/([A-Za-z0-9_-]+)(?=[/?#]|$)/.exec(href);
        if (folder?.[1] === id) kind = 'folder';
        else if (file?.[1] === id) kind = 'file';
        if (kind) break;
      }
      if (!id || !title || !kind) throw new CatalogError('parse', 'Invalid Drive folder entry.');
      entries.push({ id, name: textContent(title.content), kind });
    }
  }

  const pageTitle = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(markup);
  return { title: pageTitle ? textContent(pageTitle[1]) : null, entries };
}
