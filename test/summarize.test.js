import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../scripts/ingest/summarize.js';

const stories = [{ id: 'abc', topics: ['fisica'], summary: 'x', sources: [{ source: 'CERN', title: 'New boson' }] }];

test('summarize is skipped without an API key', async () => {
  assert.equal(await summarize(stories, { apiKey: '', groqKey: '', githubToken: '' }), null);
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

test('NBA section: sentences that still reveal results are dropped', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    const text = JSON.stringify({ briefing: 'Curry renueva con los Warriors. Los Lakers ganan 120-110 a los Suns.', stories: [{ i: 0, id: 'x', resumen: 'Los Celtics vencen a los Knicks.' }] });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
  });
  const res = await summarize(stories, { apiKey: 'k', label: 'NBA', nba: true });
  assert.equal(res.briefing, 'Curry renueva con los Warriors.');
  assert.deepEqual(res.summaries, {});
});

const groqReply = (content) => new Response(JSON.stringify({ choices: [{ message: { content } }] }));

test('falls back to Groq when every Gemini model fails', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push(url);
    if (url.includes('generativelanguage')) return new Response('overloaded', { status: 503 });
    assert.equal(init.headers.authorization, 'Bearer g');
    assert.equal(JSON.parse(init.body).response_format.type, 'json_object');
    return groqReply('{"briefing":"Desde Groq.","stories":[{"i":0,"id":"abc","resumen":"Resumen Groq."}]}');
  });
  const res = await summarize(stories, { apiKey: 'k', groqKey: 'g' });
  assert.equal(res.briefing, 'Desde Groq.');
  assert.deepEqual(res.summaries, { abc: 'Resumen Groq.' });
  assert.match(res.model, /^groq\//);
  assert.equal(calls.filter((u) => u.includes('generativelanguage')).length, 2, 'tries both Gemini models first');
});

test('uses Groq alone when there is no Gemini key, and reports both failures', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => (url.includes('groq') ? groqReply('{"briefing":"Solo Groq.","stories":[]}') : assert.fail('Gemini called')));
  assert.equal((await summarize(stories, { apiKey: '', groqKey: 'g' })).briefing, 'Solo Groq.');
  t.mock.method(globalThis, 'fetch', async () => new Response('quota', { status: 429 }));
  await assert.rejects(summarize(stories, { apiKey: 'k', groqKey: 'g', githubToken: '' }), /gemini .*429.*groq .*429/);
});

test('waits and retries when the provider asks to (429 + retry-after)', async (t) => {
  let n = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    n++;
    if (n === 1) return new Response('slow down', { status: 429, headers: { 'retry-after': '1' } });
    return groqReply('{"briefing":"Tras esperar.","stories":[]}');
  });
  const res = await summarize(stories, { apiKey: '', groqKey: 'g' });
  assert.equal(res.briefing, 'Tras esperar.');
  assert.equal(n, 2);
});

test('falls back to GitHub Models when Gemini and Groq fail', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (!url.includes('models.github.ai')) return new Response('quota', { status: 429 });
    assert.equal(init.headers.authorization, 'Bearer gh');
    assert.equal(JSON.parse(init.body).model, 'openai/gpt-4.1-mini');
    return groqReply('{"briefing":"Desde GitHub.","stories":[{"i":0,"id":"abc","resumen":"Resumen GitHub."}]}');
  });
  const res = await summarize(stories, { apiKey: 'k', groqKey: 'g', githubToken: 'gh' });
  assert.equal(res.briefing, 'Desde GitHub.');
  assert.deepEqual(res.summaries, { abc: 'Resumen GitHub.' });
  assert.equal(res.model, 'github/openai/gpt-4.1-mini');
});

test('uses GitHub Models alone when it is the only provider', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => (url.includes('models.github.ai') ? groqReply('{"briefing":"Solo GitHub.","stories":[]}') : assert.fail(`called ${url}`)));
  assert.equal((await summarize(stories, { apiKey: '', groqKey: '', githubToken: 'gh' })).briefing, 'Solo GitHub.');
});
