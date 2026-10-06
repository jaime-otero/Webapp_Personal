import { XMLParser } from 'fast-xml-parser';
import { cleanText, decodeEntities, truncate, hash } from './text.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  cdataPropName: false,
  processEntities: false,
  htmlEntities: false,
  trimValues: true,
});

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// The parser leaves entities alone, so URLs arrive as "?a=1&amp;b=2": decode them.
const cleanUrl = (u) => decodeEntities(String(u).trim());

// Audience-measurement pixels some feeds (Expansión) put in media:content.
const TRACKER = /imrworldwide\.com|doubleclick\.net|\/pixel\.gif/i;

// "… Leer" / "Leer más": the link label Unidad Editorial (El Mundo, Marca, Expansión) appends.
const READ_MORE = /\s*(Leer( más)?|Seguir leyendo|Read more)\s*[.…]*$/i;

function pickLink(item) {
  // Atom: <link href rel="alternate"/>; RSS: <link>text</link>
  for (const l of asArray(item.link)) {
    if (typeof l === 'string') return cleanUrl(l);
    if (l['@href'] && (!l['@rel'] || l['@rel'] === 'alternate')) return cleanUrl(l['@href']);
    if (l['#text']) return cleanUrl(l['#text']);
  }
  if (typeof item.guid === 'string' && item.guid.startsWith('http')) return cleanUrl(item.guid);
  if (item.guid?.['#text']?.startsWith?.('http')) return cleanUrl(item.guid['#text']);
  return '';
}

function pickImage(item) {
  const candidates = [
    ...asArray(item['media:content']),
    ...asArray(item['media:group']?.['media:content']),
    ...asArray(item['media:thumbnail']),
    ...asArray(item.enclosure),
  ];
  for (const c of candidates) {
    const url = c?.['@url'] && cleanUrl(c['@url']);
    if (!url || TRACKER.test(url)) continue;
    const type = c?.['@type'] ?? c?.['@medium'] ?? 'image';
    if (/image/.test(type)) return url;
    if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) return url;
  }
  const html = String(item['content:encoded'] ?? item.description ?? '');
  const src = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
  return src && !TRACKER.test(src) ? cleanUrl(src) : null;
}

function pickDate(item) {
  const raw = item.pubDate ?? item['dc:date'] ?? item.published ?? item.updated;
  const d = raw ? new Date(typeof raw === 'object' ? raw['#text'] : raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

export function parseFeed(xml, source) {
  const doc = parser.parse(xml);
  const rawItems = doc.rss?.channel?.item ?? doc['rdf:RDF']?.item ?? doc.feed?.entry ?? [];
  const out = [];
  for (const item of asArray(rawItems)) {
    const title = cleanText(item.title);
    const url = pickLink(item);
    if (!title || !url) continue;
    const summary = truncate(cleanText(item.description ?? item.summary ?? item['content:encoded'] ?? item.content).replace(READ_MORE, ''), 240);
    const categories = asArray(item.category).map((c) => cleanText(typeof c === 'object' ? c['#text'] ?? c['@term'] : c)).filter(Boolean);
    out.push({
      id: hash(url),
      title,
      summary: summary === title ? '' : summary,
      url,
      sourceId: source.id,
      source: source.name,
      lang: source.lang,
      publishedAt: pickDate(item),
      image: pickImage(item),
      categories,
      feedSections: source.sections ?? [],
    });
  }
  return out;
}
