// AI summaries: one request per section and run (10 sections × ~9 AI runs/day ≈ 90 requests/day).
// Providers, in order: Gemini (free tier) and, if it fails or has no key, Groq (free tier).
// With neither key, or if both fail, the caller keeps the previous summaries.

import { isSpoilerText } from '../../web/lib/spoilers.js';

// Google retires model versions often, so try a configured model first and then the
// "latest" aliases; 404 (retired), 429 (quota) and 5xx (overloaded) move on to the next one.
const GEMINI_MODELS = [...new Set([process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean))];
const GROQ_MODELS = [...new Set([process.env.GROQ_MODEL, 'openai/gpt-oss-120b', 'llama-3.3-70b-versatile'].filter(Boolean))];
const TIMEOUT = 120_000;

// Try each model in turn; 404 (retired), 429 (quota) and 5xx (overloaded) move on to the next.
// A 429 that asks to wait a little (Groq's per-minute token limit) is retried on the same
// model after the requested pause, up to MAX_WAITS times.
const MAX_WAITS = 3;
const MAX_WAIT_S = 30;

async function tryModels(provider, models, request, errors) {
  for (const model of models) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(...request(model));
      if (res.ok) return { model, data: await res.json() };
      const wait = Number(res.headers.get('retry-after'));
      if (res.status === 429 && wait > 0 && wait <= MAX_WAIT_S && attempt < MAX_WAITS) {
        await res.text();
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      errors.push(`${provider} ${model} ${res.status}: ${(await res.text()).slice(0, 160)}`);
      break;
    }
    const last = errors.at(-1) ?? '';
    if (!/ (404|429|5\d\d): /.test(last)) break;
  }
  return null;
}

async function callGemini(prompt, apiKey, errors) {
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 16384 },
  });
  const r = await tryModels('gemini', GEMINI_MODELS, (model) => [
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey }, body, signal: AbortSignal.timeout(TIMEOUT) },
  ], errors);
  return r && { model: r.model, text: r.data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '' };
}

async function callGroq(prompt, apiKey, errors) {
  const r = await tryModels('groq', GROQ_MODELS, (model) => [
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.3 }),
      signal: AbortSignal.timeout(TIMEOUT),
    },
  ], errors);
  return r && { model: `groq/${r.model}`, text: r.data.choices?.[0]?.message?.content ?? '' };
}

export const hasAIKey = () => !!(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY);

const NBA_RULES = `
MUY IMPORTANTE (sección NBA, el lector no quiere spoilers): NO menciones resultados, marcadores, quién ganó o
perdió, rachas, clasificaciones, eliminatorias ni estadísticas de partidos. Habla solo de fichajes, traspasos,
lesiones, contratos, declaraciones, negocio y contexto. Si una noticia solo trata de un resultado, resume su tema
sin revelarlo.`;

export function buildPrompt(stories, { label = 'Portada', nba = false } = {}) {
  const list = stories
    .map((s, i) => {
      const lines = s.sources.slice(0, 5).map((src) => `   - ${src.source}: ${src.title}`);
      return `[${i}] id=${s.id}\n   Extracto: ${s.summary || '(sin extracto)'}\n${lines.join('\n')}`;
    })
    .join('\n\n');
  return `Eres el editor de un diario personal, sección "${label}". Abajo tienes las noticias más relevantes de
las últimas horas en esta sección, cada una con los titulares de los medios que la cubren. Escribe SIEMPRE en
español, con tono neutral y sin inventar datos que no aparezcan en el texto. Si los medios discrepan, dilo.
${nba ? NBA_RULES : ''}
Devuelve JSON con esta forma exacta, con UNA entrada en "stories" por CADA noticia de la lista
(${stories.length} en total, en el mismo orden):
{"briefing": "3-5 frases con lo más importante ahora mismo; ve directo a los hechos, sin frases como 'La sección de…' o 'Hoy destaca…'",
 "stories": [{"i": <número entre corchetes>, "id": "<id>", "resumen": "2-3 frases en español"}]}

Noticias:
${list}`;
}

// In the NBA section, drop any generated sentence that still reveals a result.
function stripSpoilers(text) {
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  return sentences.filter((s) => !isSpoilerText(s)).join('').trim();
}

export async function summarize(
  stories,
  { apiKey = process.env.GEMINI_API_KEY, groqKey = process.env.GROQ_API_KEY, label, nba = false } = {},
) {
  if ((!apiKey && !groqKey) || stories.length === 0) return null;

  const prompt = buildPrompt(stories, { label, nba });
  const errors = [];
  let out = null;
  if (apiKey) out = await callGemini(prompt, apiKey, errors);
  if (!out && groqKey) out = await callGroq(prompt, groqKey, errors);
  if (!out) throw new Error(errors.join(' | '));
  const { model, text } = out;
  const parsed = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim());
  const clean = (t) => (nba ? stripSpoilers(t) : t);
  const summaries = {};
  const ids = new Set(stories.map((s) => s.id));
  for (const item of parsed.stories ?? []) {
    if (typeof item?.resumen !== 'string') continue;
    // Models sometimes mangle the opaque id; fall back to the list index.
    const id = ids.has(item.id) ? item.id : stories[item.i]?.id;
    const summary = clean(item.resumen);
    if (id && summary) summaries[id] = summary;
  }
  const briefing = typeof parsed.briefing === 'string' ? clean(parsed.briefing) : '';
  return { briefing: briefing || null, summaries, model };
}
