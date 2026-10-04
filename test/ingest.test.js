import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../scripts/ingest/parse.js';
import { classify } from '../scripts/ingest/classify.js';
import { clusterArticles } from '../scripts/ingest/cluster.js';
import { cleanText } from '../scripts/ingest/text.js';

const src = { id: 'test', name: 'Test', lang: 'en', region: 'int', topics: [] };

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
  assert.equal(a.url, 'https://ex.com/a');
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

test('classify uses keywords and feed topics', () => {
  const base = { summary: '', categories: [], region: 'int', feedTopics: [] };
  assert.ok(classify({ ...base, title: 'Physicists observe new quantum effect' }).includes('fisica'));
  assert.ok(classify({ ...base, title: 'Physicists observe new quantum effect' }).includes('ciencia'));
  assert.ok(!classify({ ...base, title: 'Los particulares compran más coches' }).includes('fisica'));
  assert.deepEqual(classify({ ...base, title: 'Something', region: 'es', feedTopics: ['espana'] }), ['espana']);
});

test('clusterArticles groups the same story across outlets but not unrelated ones', () => {
  const mk = (id, source, title) => ({ id, url: `https://x/${id}`, source, sourceId: source, title, summary: '', lang: 'es', publishedAt: '2026-10-04T10:00:00Z', image: null, topics: ['espana'] });
  const stories = clusterArticles([
    mk('1', 'A', 'Mueren dos jóvenes ahogados en una playa de Guardamar del Segura'),
    mk('2', 'B', 'Mueren dos jóvenes ahogados en una playa de Guardamar de Segura, Alicante'),
    mk('3', 'C', 'El Gobierno aprueba los presupuestos generales'),
  ]);
  assert.equal(stories.length, 2);
  assert.equal(stories.find((s) => s.sources.length === 2).sources.length, 2);
});
