import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProfile } from '../web/lib/profile.js';
import { rankStories, scoreStory, learn } from '../web/lib/rank.js';

const NOW = Date.parse('2026-10-04T12:00:00Z');
const story = (id, title, topics, extra = {}) => ({
  id, title, topics, lang: 'es', summary: '', publishedAt: '2026-10-04T11:00:00Z',
  sources: [{ sourceId: 'elpais', source: 'El País', url: 'https://x', title }], ...extra,
});

test('topic preferences reorder the feed', () => {
  const p = defaultProfile();
  p.topics.fisica = 3;
  p.topics.deportes = 0;
  const ranked = rankStories([story('d', 'El Madrid gana la liga', ['deportes']), story('f', 'Nuevo récord cuántico', ['fisica', 'ciencia'])], p, NOW);
  assert.equal(ranked[0].id, 'f');
});

test('hidden topics, muted sources, muted keywords and languages filter stories out', () => {
  const p = defaultProfile();
  p.topics.deportes = -2;
  assert.equal(scoreStory(story('a', 'Partido', ['deportes']), p, NOW), null);
  p.sources.elpais = -1;
  assert.equal(scoreStory(story('b', 'Algo', ['ciencia']), p, NOW), null);
  const q = defaultProfile();
  q.muteKeywords = ['horóscopo'];
  assert.equal(scoreStory(story('c', 'Tu horoscopo de hoy', []), q, NOW), null);
  q.langs = ['es'];
  assert.equal(scoreStory(story('d', 'Hello', [], { lang: 'en' }), q, NOW), null);
});

test('boost keywords and learning raise similar stories', () => {
  const p = defaultProfile();
  const a = story('a', 'Avances en fusión nuclear en el ITER', ['fisica']);
  const b = story('b', 'Nueva fase del reactor de fusión nuclear', ['fisica']);
  const before = scoreStory(b, p, NOW);
  learn(p, a, 'like', NOW);
  assert.ok(scoreStory(b, p, NOW) > before);
  learn(p, a, 'dislike', NOW);
  learn(p, a, 'dislike', NOW);
  assert.ok(scoreStory(b, p, NOW) < before);
  const q = defaultProfile();
  q.boostKeywords = ['ITER'];
  assert.ok(scoreStory(a, q, NOW) > scoreStory(a, defaultProfile(), NOW) + 2);
});

test('more coverage and fresher news rank higher', () => {
  const p = defaultProfile();
  const many = story('m', 'X', ['ciencia'], { sources: ['a', 'b', 'c'].map((s) => ({ sourceId: s, source: s, url: 'https://x', title: 'X' })) });
  const old = story('o', 'Y', ['ciencia'], { publishedAt: '2026-10-03T00:00:00Z' });
  const ranked = rankStories([old, story('n', 'Z', ['ciencia']), many], p, NOW);
  assert.deepEqual(ranked.map((s) => s.id), ['m', 'n', 'o']);
});
