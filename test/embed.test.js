import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toInt8B64, fromInt8B64, normalizeVec, dot, embedArticles, articleText } from '../scripts/ingest/embed.js';
import { buildPrototypes, feedTopic } from '../scripts/ingest/prototypes.js';

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const randomVec = (n = 384) => normalizeVec(Float32Array.from({ length: n }, rnd));

test('int8 + base64 keeps cosine similarity (512 characters for 384 dims)', () => {
  const a = randomVec();
  const b = normalizeVec(a.map((x, i) => x + (i % 7 === 0 ? 0.05 : 0)));
  const qa = fromInt8B64(toInt8B64(a));
  assert.equal(toInt8B64(a).length, 512);
  assert.ok(dot(a, qa) > 0.999);
  assert.ok(Math.abs(dot(qa, fromInt8B64(toInt8B64(b))) - dot(a, b)) < 0.005);
});

test('embedArticles only sends new or changed texts to the model and keeps the cache to this run', async () => {
  const cacheFile = join(await mkdtemp(join(tmpdir(), 'emb-')), 'embeddings.json');
  const seen = [];
  const embedder = { id: 'fake', embed: async (texts) => (seen.push(...texts), texts.map(() => randomVec(8))) };
  const arts = [1, 2, 3].map((i) => ({ id: `a${i}`, title: `Titular ${i}`, summary: '' }));
  const first = await embedArticles(arts, embedder, { cacheFile });
  assert.deepEqual([first.computed, first.cached], [3, 0]);
  arts[1].title = 'Titular 2 corregido';
  const second = await embedArticles([arts[0], arts[1]], embedder, { cacheFile });
  assert.deepEqual([second.computed, second.cached], [1, 1]);
  assert.deepEqual(seen.at(-1), articleText(arts[1]));
  const stored = JSON.parse(await readFile(cacheFile, 'utf8'));
  assert.deepEqual(Object.keys(stored.vectors).sort(), ['a1', 'a2']);
  // Another model: nothing from the cache is reused.
  const other = await embedArticles(arts, { ...embedder, id: 'other' }, { cacheFile });
  assert.equal(other.computed, 3);
});

test('feedTopic: one topical section, or "otras" for politics and world feeds; none for general feeds', () => {
  assert.equal(feedTopic(['deportes/ciclismo']), 'deportes');
  assert.equal(feedTopic(['espana/deportes']), 'deportes');
  assert.equal(feedTopic(['eeuu/nba']), 'deportes');
  assert.equal(feedTopic(['espana/politica']), 'otras');
  assert.equal(feedTopic(['espana']), null);
  assert.equal(feedTopic(['economia', 'tecnologia']), null);
});

test('buildPrototypes needs examples of every topic and returns the nearest one with its margin', () => {
  const axes = { ciencia: 0, tecnologia: 1, economia: 2, deportes: 3, otras: 4 };
  const hint = { ciencia: 'ciencia', tecnologia: 'tecnologia', economia: 'economia', deportes: 'deportes/tenis', otras: 'espana/politica' };
  const arts = [];
  const vectors = new Map();
  for (const [topic, axis] of Object.entries(axes)) {
    for (let i = 0; i < 10; i++) {
      const id = `${topic}${i}`;
      arts.push({ id, feedSections: [hint[topic]] });
      vectors.set(id, normalizeVec(Float32Array.from({ length: 5 }, (_, k) => (k === axis ? 1 : 0.1))));
    }
  }
  const protos = buildPrototypes(arts, vectors);
  const r = protos.score(normalizeVec(Float32Array.from([0.1, 0.1, 0.1, 1, 0.1])));
  assert.equal(r.best, 'deportes');
  assert.ok(r.margin > 0.3);
  assert.equal(buildPrototypes(arts.filter((a) => !a.id.startsWith('ciencia')), vectors), null);
});
