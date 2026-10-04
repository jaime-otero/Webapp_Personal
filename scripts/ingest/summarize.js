// AI summaries with the Gemini API free tier: one request per section and run (8 sections × 12
// runs/day ≈ 100 requests/day). Without GEMINI_API_KEY (or on failure) the caller keeps the
// previous summaries and the site still works.

import { isSpoilerText } from '../../web/lib/spoilers.js';

// Google retires model versions often, so try a configured model first and then the
// "latest" aliases; 404 (retired), 429 (quota) and 5xx (overloaded) move on to the next one.
const MODELS = [...new Set([process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean))];
const endpoint = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

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

export async function summarize(stories, { apiKey = process.env.GEMINI_API_KEY, label, nba = false } = {}) {
  if (!apiKey || stories.length === 0) return null;

  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: buildPrompt(stories, { label, nba }) }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 16384 },
  });
  let res;
  let model;
  const errors = [];
  for (model of MODELS) {
    res = await fetch(endpoint(model), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body,
      signal: AbortSignal.timeout(120_000),
    });
    if (res.ok) break;
    errors.push(`${model} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    if (![404, 429].includes(res.status) && res.status < 500) break;
  }
  if (!res.ok) throw new Error(`Gemini: ${errors.join(' | ')}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
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
