import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../scripts/ingest/parse.js';
import { classify } from '../scripts/ingest/classify.js';
import { clusterArticles } from '../scripts/ingest/cluster.js';
import { cleanText } from '../scripts/ingest/text.js';

const src = { id: 'test', name: 'Test', lang: 'en', region: 'int', sections: [] };

test('cleanText strips raw, CDATA and entity-escaped HTML', () => {
  assert.equal(cleanText('<p>Hola <b>mundo</b></p>'), 'Hola mundo');
  assert.equal(cleanText('&lt;p&gt;Caf&eacute; &amp;amp; t&#233;&lt;/p&gt;'), 'Café & té');
});

test('parseFeed reads RSS 2.0 with media image', () => {
  const xml = `<?xml version="1.0"?><rss xmlns:media="http://search.yahoo.com/mrss/"><channel>
    <item><title><![CDATA[Quantum computer breaks record]]></title><link>https://ex.com/a</link>
    <description>&lt;p&gt;A new &lt;b&gt;qubit&lt;/b&gt; design.&lt;/p&gt;</description>
    <pubDate>Sun, 04 Oct 2026 10:00:00 GMT</pubDate><media:content url="https://ex.com/a.jpg" medium="image"/></item>
  </channel></rss>`;
  const [a] = parseFeed(xml, src);
  assert.equal(a.title, 'Quantum computer breaks record');
  assert.equal(a.summary, 'A new qubit design.');
  assert.equal(a.image, 'https://ex.com/a.jpg');
  assert.equal(a.publishedAt, '2026-10-04T10:00:00.000Z');
});

test('parseFeed reads Atom', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Black hole image</title>
    <link rel="alternate" href="https://ex.com/b"/><updated>2026-10-04T09:00:00Z</updated><summary>Webb sees it</summary></entry></feed>`;
  const [a] = parseFeed(xml, src);
  assert.equal(a.url, 'https://ex.com/b');
  assert.equal(a.summary, 'Webb sees it');
});

// Real headlines from 4 October 2026.
const cls = (title, feedSections, summary = '') => classify({ title, summary, categories: [], feedSections });

test('classify: España by subsection', () => {
  assert.deepEqual(cls('Sumar presentará su Frente Amplio y anunciará el candidato electoral el 17 de octubre', ['espana']), ['espana/politica']);
  assert.ok(cls('Mueren dos jóvenes ahogados en una playa de Guardamar del Segura', ['espana']).includes('espana/sociedad'));
  assert.deepEqual(cls('Póquer de Pina con un Barça de cine', ['espana/deportes']), ['espana/deportes']);
  assert.ok(cls('Los Javis y La bola negra desembarcan en Hollywood: la película aspira al Oscar', ['espana']).includes('espana/cultura'));
});

test('classify: general feeds move stories to the region they happen in', () => {
  assert.deepEqual(cls("Brazil election: Early count puts Bolsonaro ahead of Lula", ['internacional']), ['internacional/latam']);
  assert.deepEqual(cls('Torrential rain and flooding leave 2 dead and 1 missing in Spain\'s Catalonia region', ['internacional']).filter((s) => s.startsWith('espana')).length, 1);
  assert.ok(cls('Trump takes red state midterm blitz to Nebraska as GOP frets over Senate race', ['internacional']).includes('eeuu/politica'));
  assert.deepEqual(cls('Russia threatens more strikes after Zelensky vows to hit oil refineries', ['espana']), ['internacional/europa']);
});

test('classify: NBA always lands in EE. UU. → NBA, from any outlet', () => {
  assert.ok(cls('Doncic se pone la corona de los Lakers: "Estoy listo"', ['espana/deportes']).includes('eeuu/nba'));
  assert.ok(cls('Could the Bucks become the center of the trade market?', ['eeuu/nba']).includes('eeuu/nba'));
  assert.ok(!cls('Póquer de Pina con un Barça de cine', ['espana/deportes']).includes('eeuu/nba'));
});

test('classify: topical sections, stricter on general news feeds', () => {
  assert.deepEqual(cls('Giant fluctuations of focused light reveal hidden correlations in opaque materials', ['ciencia/fisica']), ['ciencia/fisica']);
  assert.ok(cls('Physicists observe a new quantum effect in superconductors', ['internacional']).includes('ciencia/fisica'));
  assert.ok(!cls('Dos muertos y un desaparecido por el fuerte temporal en Cataluña', ['espana']).some((s) => s.startsWith('ciencia')));
  assert.ok(cls('OpenAI safety leader quits, warning AI company culture is broken', ['tecnologia']).includes('tecnologia/ia'));
  assert.ok(cls('Por qué el precio del petróleo se mantiene estancado en los 100 dólares', ['espana', 'economia']).includes('economia/energia'));
});

test('clusterArticles groups the same story across outlets and keeps every section', () => {
  const mk = (id, source, title, sections) => ({ id, url: `https://x/${id}`, source, sourceId: source, title, summary: '', lang: 'es', publishedAt: '2026-10-04T10:00:00Z', image: null, sections });
  const stories = clusterArticles([
    mk('1', 'A', 'Mueren dos jóvenes ahogados en una playa de Guardamar del Segura', ['espana/sociedad']),
    mk('2', 'B', 'Mueren dos jóvenes ahogados en una playa de Guardamar de Segura, Alicante', ['espana']),
    mk('3', 'A', 'Mueren dos jóvenes ahogados en la playa de Guardamar del Segura', ['espana/deportes']),
    mk('4', 'C', 'El Gobierno aprueba los presupuestos generales', ['espana/politica']),
  ]);
  assert.equal(stories.length, 2);
  const drown = stories.find((s) => s.sources.length === 2);
  assert.deepEqual(drown.sections.sort(), ['espana', 'espana/deportes', 'espana/sociedad']);
});
