import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../scripts/ingest/summarize.js';

const stories = [{ id: 'abc', topics: ['fisica'], summary: 'x', sources: [{ source: 'CERN', title: 'New boson' }] }];

test('summarize is skipped without an API key', async () => {
  assert.equal(await summarize(stories, { apiKey: '' }), null);
});

test('summarize parses the Gemini JSON response', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.match(url, /generateContent$/);
    assert.equal(init.headers['x-goog-api-key'], 'k');
    const text = '```json\n{"briefing":"Hoy…","stories":[{"id":"abc","resumen":"El CERN…"}]}\n```';
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
  });
  const res = await summarize(stories, { apiKey: 'k' });
  assert.equal(res.briefing, 'Hoy…');
  assert.deepEqual(res.summaries, { abc: 'El CERN…' });
});
