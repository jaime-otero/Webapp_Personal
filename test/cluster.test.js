import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clusterArticles, entities } from '../scripts/ingest/cluster.js';
import { normalizeVec } from '../scripts/ingest/embed.js';
import { isSpoiler, isNbaStory } from '../web/lib/spoilers.js';

// Hand-made vectors stand in for the model: what matters to cluster.js is their cosine.
const v = (...xs) => normalizeVec(Float32Array.from(xs));
const mk = (id, source, title, vec, extra = {}) => ({
  id, source, sourceId: source.toLowerCase(), title, summary: '', url: `https://ex.com/${id}`, lang: 'es', image: null,
  sections: ['internacional'], publishedAt: '2026-10-06T10:00:00Z', vec, ...extra,
});
const run = (arts, link = 0.66) => clusterArticles(arts, { vectors: new Map(arts.map((a) => [a.id, a.vec])), link });
const bySize = (stories) => stories.map((s) => s.sources.length).sort((a, b) => b - a);

test('entities: proper names and numbers, not the first word, stopwords or years', () => {
  const e = entities({ title: 'El Supremo levanta la orden contra Puigdemont', summary: 'Llarena firma el auto de 12 páginas en 2026' });
  assert.ok(e.has('puigdemont') && e.has('llarena') && e.has('12'));
  assert.ok(!e.has('el') && !e.has('2026'));
});

test('groups the same story across languages and outlets; the lead is a Spanish outlet', () => {
  const stories = run([
    // Cosine 0.6 is below the threshold: the shared name (Medvedev) is what links them.
    mk('1', 'BBC News', 'Daniil Medvedev disqualified from China Open for hitting fan', v(1, 0, 0), { lang: 'en', image: 'https://ex.com/a.jpg' }),
    mk('2', 'Marca', 'Pelotazo de Medvedev, descalificado en Pekín', v(0.6, 0.8, 0), { image: 'https://ex.com/b.jpg' }),
    mk('3', 'El País', 'El Gobierno aprueba los presupuestos', v(0, 0, 1)),
  ]);
  assert.deepEqual(bySize(stories), [2, 1]);
  const s = stories.find((x) => x.sources.length === 2);
  assert.deepEqual(s.langs.sort(), ['en', 'es']);
  assert.equal(s.lang, 'es');
  assert.match(s.title, /Pekín/);
});

test('without a shared name, the same cosine is not enough', () => {
  const stories = run([mk('1', 'A', 'Un tenista descalificado en China', v(1, 0, 0)), mk('2', 'B', 'Pelotazo y expulsión en el torneo', v(0.6, 0.8, 0))]);
  assert.equal(stories.length, 2);
});

test('average linkage does not chain two stories through a third that looks like both', () => {
  // a ~ b and b ~ c, but a and c have nothing in common: single linkage would make one story.
  const a = v(1, 0, 0);
  const c = v(0, 0, 1);
  const b = v(1, 0, 1);
  const stories = run([mk('a', 'A', 'Uno', a), mk('b', 'B', 'Dos', b), mk('c', 'C', 'Tres', c)], 0.66);
  assert.equal(stories.length, 2);
});

test('articles more than 36 h apart stay apart; a different score line keeps two matches apart', () => {
  const same = v(1, 0.2, 0);
  const far = run([mk('1', 'A', 'Mismo suceso', same), mk('2', 'B', 'Mismo suceso', same, { publishedAt: '2026-10-03T10:00:00Z' })]);
  assert.equal(far.length, 2);
  const near = v(1, 0.95, 0); // cosine 0.72: above the threshold on its own
  const matches = run([mk('1', 'A', 'Victoria del líder por 2-1', v(1, 0, 0)), mk('2', 'B', 'Victoria del líder por 3-0', near)]);
  assert.equal(matches.length, 2);
  const sameMatch = run([mk('1', 'A', 'Victoria del líder por 2-1', v(1, 0, 0)), mk('2', 'B', 'El líder gana 2-1', near)]);
  assert.equal(sameMatch.length, 1);
});

test('same outlet twice is one source with both sections; the id is the oldest article', () => {
  const x = v(1, 0, 0);
  const [s] = run([
    mk('new', 'El País', 'Nobel de Física para Halzen', x, { sections: ['ciencia/fisica'], publishedAt: '2026-10-06T11:00:00Z' }),
    mk('live', 'El País', 'Nobel de Física para Halzen, en directo', x, { sections: ['internacional'], publishedAt: '2026-10-06T10:30:00Z' }),
    mk('old', 'SINC', 'Halzen gana el Nobel de Física', x, { sections: ['ciencia/fisica'], publishedAt: '2026-10-06T10:00:00Z' }),
  ]);
  assert.equal(s.id, 'old');
  assert.equal(s.sources.length, 2);
  assert.deepEqual(s.articleIds.sort(), ['live', 'new', 'old']);
  assert.ok(s.sections.includes('ciencia/fisica'));
});

test('a big story drops sections few of its outlets filed it under, but never the NBA', () => {
  const x = v(1, 0, 0);
  const arts = ['A', 'B', 'C', 'D', 'E'].map((src, i) => mk(String(i), src, `Los Lakers fichan a un base ${i}`, x, { sections: ['eeuu/sociedad'] }));
  arts[0].sections = ['eeuu/sociedad', 'espana/deportes'];
  arts[1].sections = ['eeuu/nba', 'deportes/baloncesto'];
  arts[1].title = 'Lakers beat Warriors 120-110';
  const [s] = run(arts);
  assert.ok(!s.sections.includes('espana/deportes'));
  assert.ok(isNbaStory(s));
  // Spoiler check reads every outlet's headline, not just the lead's.
  assert.ok(isSpoiler(s));
});

test('without vectors, the word-overlap algorithm (same language only)', () => {
  const stories = clusterArticles([
    mk('1', 'A', 'Mueren dos jóvenes ahogados en una playa de Guardamar de Segura', null),
    mk('2', 'B', 'Two young men drown on a beach in Guardamar de Segura', null, { lang: 'en' }),
  ]);
  assert.equal(stories.length, 2);
  assert.deepEqual(stories[0].langs, [stories[0].lang]);
});

test('the lead outlet comes first in sources, so the card links the headline it shows', () => {
  const x = v(1, 0, 0);
  const [s] = run([
    mk('1', 'BBC News', 'Halzen wins physics Nobel', x, { lang: 'en' }),
    mk('2', 'El Mundo', 'Halzen gana el Nobel de Física', x, { image: 'https://ex.com/i.jpg', publishedAt: '2026-10-06T09:00:00Z' }),
  ]);
  assert.equal(s.title, 'Halzen gana el Nobel de Física');
  assert.equal(s.sources[0].source, 'El Mundo');
});

test('an oversized chain of related articles is split, not left as loose single stories', () => {
  // 320 articles in one connected block (above the 300 limit): two tight stories, cosine 0.75 apart.
  const a = v(1, 0, 0);
  const b = v(0.75, 0.66, 0);
  const arts = Array.from({ length: 320 }, (_, i) => mk(`x${i}`, `Medio ${i}`, `Titular ${i}`, i < 160 ? a : b));
  assert.deepEqual(bySize(run(arts)), [160, 160]);
});
