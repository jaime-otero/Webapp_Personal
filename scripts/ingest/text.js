export { normalize, tokens } from '../../web/lib/tokens.js';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

// Accented letters by name (&eacute;, &Ntilde;…): common in Spanish feeds.
const ACCENTS = { acute: '\u0301', grave: '\u0300', tilde: '\u0303', uml: '\u0308', circ: '\u0302', cedil: '\u0327' };
Object.assign(ENTITIES, { iexcl: '¡', iquest: '¿', ordm: 'º', ordf: 'ª', euro: '€', deg: '°', middot: '·', bull: '•', copy: '©', reg: '®', szlig: 'ß' });

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : m; // a bogus &#99999999; must not drop the feed
    }
    if (ENTITIES[e.toLowerCase()]) return ENTITIES[e.toLowerCase()];
    const acc = e.match(/^([a-z])(acute|grave|tilde|uml|circ|cedil)$/i);
    return acc ? (acc[1] + ACCENTS[acc[2].toLowerCase()]).normalize('NFC') : m;
  });
}

export function cleanText(value) {
  if (value == null) return '';
  if (typeof value === 'object') value = value['#text'] ?? '';
  // Feeds mix raw HTML, CDATA and entity-escaped HTML (&lt;p&gt;), sometimes double-escaped:
  // decode, strip tags, decode again.
  const stripTags = (s) => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  return decodeEntities(stripTags(decodeEntities(stripTags(String(value))))).replace(/\s+/g, ' ').trim();
}

export function truncate(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:]+$/, '') + '…';
}

export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
