// AI summaries with the Gemini API free tier. One request per run keeps usage far below the
// free quota (12 runs/day). Without GEMINI_API_KEY (or on failure) the caller keeps the previous
// summaries and the site still works.

// Google retires model versions often, so try a configured model first and then the
// "latest" aliases; 404 (retired), 429 (quota) and 5xx (overloaded) move on to the next one.
const MODELS = [...new Set([process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean))];
const endpoint = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

function buildPrompt(stories) {
  const list = stories
    .map((s, i) => {
      const lines = s.sources.slice(0, 5).map((src) => `   - ${src.source}: ${src.title}`);
      return `[${i}] id=${s.id} temas=${s.topics.join(',')}\n   Extracto: ${s.summary || '(sin extracto)'}\n${lines.join('\n')}`;
    })
    .join('\n\n');
  return `Eres el editor de un diario personal. Abajo tienes las noticias más relevantes de las últimas horas,
cada una con los titulares de los medios que la cubren. Escribe SIEMPRE en español, con tono neutral y sin inventar
datos que no aparezcan en el texto. Si los medios discrepan, dilo.

Devuelve JSON con esta forma exacta:
{"briefing": "3-6 frases que resuman lo más importante del momento",
 "stories": [{"id": "<id>", "resumen": "2-3 frases en español"}]}

Noticias:
${list}`;
}

export async function summarize(stories, { apiKey = process.env.GEMINI_API_KEY } = {}) {
  if (!apiKey || stories.length === 0) return null;

  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: buildPrompt(stories) }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
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
  const summaries = {};
  for (const item of parsed.stories ?? []) {
    if (item?.id && typeof item.resumen === 'string') summaries[item.id] = item.resumen;
  }
  return { briefing: typeof parsed.briefing === 'string' ? parsed.briefing : null, summaries, model };
}
