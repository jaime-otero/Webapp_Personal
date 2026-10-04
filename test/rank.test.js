import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProfile } from '../web/lib/profile.js';
import { rankStories, scoreStory, train, featuresOf, entities, topFeatures } from '../web/lib/rank.js';

const NOW = Date.parse('2026-10-04T12:00:00Z');
let n = 0;
const story = (title, sections, extra = {}) => ({
  id: `s${n++}`, title, sections, lang: 'es', summary: '', publishedAt: '2026-10-04T11:00:00Z',
  sources: [{ sourceId: 'elpais', source: 'El País', url: 'https://x', title }], ...extra,
});
const ids = (entries) => entries.map((e) => e.story.id);

test('entities picks proper names, not the first word of the sentence', () => {
  assert.deepEqual(entities('Los Golden State Warriors fichan a un base del CERN'), ['golden state warriors', 'cern']);
  assert.deepEqual(entities('Pedro Sánchez se reúne con Merz'), ['pedro sanchez', 'merz']);
});

test('features include sections, parent section, outlet, words, pairs and entities', () => {
  const f = featuresOf(story('Gran noche de Wembanyama en San Antonio', ['eeuu/nba']));
  for (const k of ['s:eeuu/nba', 's:eeuu', 'src:elpais', 'w:wembanyama', 'b:noche wembanyama', 'e:wembanyama', 'e:san antonio']) assert.ok(k in f, k);
});

test('section preferences reorder the feed; subsections inherit from their section', () => {
  const p = defaultProfile(NOW);
  p.sections['ciencia'] = 3;
  p.sections['espana'] = 0;
  const a = story('El Madrid gana la liga', ['espana/deportes']);
  const b = story('Nuevo récord cuántico', ['ciencia/fisica']);
  assert.deepEqual(ids(rankStories([a, b], p, NOW)), [b.id, a.id]);
  p.sections['espana/deportes'] = 3;
  p.sections['ciencia/fisica'] = 0;
  assert.deepEqual(ids(rankStories([a, b], p, NOW)), [a.id, b.id]);
});

test('hidden sections, muted outlets/keywords, dislikes and languages filter stories out', () => {
  const p = defaultProfile(NOW);
  p.sections['espana/deportes'] = -2;
  assert.equal(scoreStory(story('Partido', ['espana/deportes']), p, NOW), null);
  const q = defaultProfile(NOW);
  q.sources.elpais = -1;
  assert.equal(scoreStory(story('Algo', ['ciencia']), q, NOW), null);
  const r = defaultProfile(NOW);
  r.muteKeywords = ['horóscopo'];
  assert.equal(scoreStory(story('Tu horoscopo de hoy', []), r, NOW), null);
  const d = story('No me interesa', ['ciencia']);
  r.disliked[d.id] = NOW;
  assert.equal(scoreStory(d, r, NOW), null);
  r.langs = ['es'];
  assert.equal(scoreStory(story('Hello', [], { lang: 'en' }), r, NOW), null);
});

test('a like lifts similar stories, not unrelated ones; a dislike pushes them down', () => {
  const p = defaultProfile(NOW);
  const liked = story('Wembanyama renueva con los San Antonio Spurs', ['eeuu/nba']);
  const similar = story('Los San Antonio Spurs preparan la temporada de Wembanyama', ['eeuu/nba']);
  const other = story('El Gobierno aprueba los presupuestos', ['espana/politica'], { sources: [{ sourceId: 'abc', source: 'ABC', url: 'https://x', title: 'x' }] });
  const before = { s: scoreStory(similar, p, NOW).score, o: scoreStory(other, p, NOW).score };
  train(p.model, liked, 'like', NOW);
  const after = { s: scoreStory(similar, p, NOW).score, o: scoreStory(other, p, NOW).score };
  assert.ok(after.s > before.s + 0.5, 'similar story goes up');
  assert.ok(Math.abs(after.o - before.o) < 0.1, 'unrelated story barely moves');
  assert.ok(scoreStory(similar, p, NOW).reasons.length > 0, 'and says why');
  for (let i = 0; i < 3; i++) train(p.model, liked, 'dislike', NOW);
  assert.ok(scoreStory(similar, p, NOW).score < before.s);
});

test('several likes in a subsection make it win over fresher news', () => {
  const p = defaultProfile(NOW);
  for (let i = 0; i < 6; i++) train(p.model, story(`Noticia de física número ${i} sobre materiales`, ['ciencia/fisica']), 'like', NOW);
  const physics = story('Un láser revela correlaciones ocultas', ['ciencia/fisica'], { publishedAt: '2026-10-04T05:00:00Z' });
  const fresh = story('Atasco en la M-30 por obras', ['espana/sociedad']);
  assert.equal(rankStories([fresh, physics], p, NOW)[0].story.id, physics.id);
  const { pos } = topFeatures(p.model);
  assert.ok(pos.some(([k]) => k === 's:ciencia/fisica'));
});

test('skip only blames section and outlet, never words', () => {
  const p = defaultProfile(NOW);
  train(p.model, story('Wembanyama habla', ['eeuu/nba']), 'skip', NOW);
  assert.ok(Object.keys(p.model.w).every((k) => /^(s|src):/.test(k)));
});

test('exploration slots a well-covered unusual story every 10 positions', () => {
  const p = defaultProfile(NOW);
  p.sections['espana'] = 3;
  const many = Array.from({ length: 12 }, (_, i) => story(`Política número ${i}`, ['espana/politica']));
  const covered = story('Gran noticia internacional', ['internacional/asia'], {
    publishedAt: '2026-10-03T06:00:00Z',
    sources: ['a', 'b', 'c', 'd'].map((s) => ({ sourceId: s, source: s, url: 'https://x', title: 'x' })),
  });
  p.sections['internacional'] = -1;
  const ranked = rankStories([...many, covered], p, NOW, { explore: true });
  assert.equal(ranked[9].story.id, covered.id);
  assert.equal(ranked[9].explore, true);
});
