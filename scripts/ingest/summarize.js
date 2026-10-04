// AI summaries with the Gemini API free tier. One request per run keeps usage far below the
// free quota (24 runs/day). Without GEMINI_API_KEY (or on failure) the caller keeps the previous
// summaries and the site still works.

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

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

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(stories) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  const parsed = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim());
  const summaries = {};
  for (const item of parsed.stories ?? []) {
    if (item?.id && typeof item.resumen === 'string') summaries[item.id] = item.resumen;
  }
  return { briefing: typeof parsed.briefing === 'string' ? parsed.briefing : null, summaries, model: MODEL };
}
