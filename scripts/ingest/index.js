import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeed } from './parse.js';
import { classify } from './classify.js';
import { clusterArticles } from './cluster.js';
import { summarize } from './summarize.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'web/data/news.json');
const MAX_AGE_HOURS = 72;
const MAX_PER_SOURCE = 40;
const AI_STORIES = 25;
const USER_AGENT = 'Mozilla/5.0 (compatible; MiDiarioBot/0.1; lector RSS personal)';

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

// Previous output (local file or the deployed site) so AI summaries survive a failed or
// skipped AI call.
async function loadPrevious() {
  try {
    if (process.env.PREVIOUS_DATA_URL) return JSON.parse(await fetchText(process.env.PREVIOUS_DATA_URL));
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return null;
  }
}

function importance(story, now) {
  const ageH = story.publishedAt ? (now - Date.parse(story.publishedAt)) / 3.6e6 : 48;
  return story.sources.length * 2 + Math.max(0, 24 - ageH) / 6;
}

function pickForAI(stories, now) {
  const ranked = [...stories].sort((a, b) => importance(b, now) - importance(a, now));
  const chosen = new Set(ranked.slice(0, 12));
  for (const topic of ['ciencia', 'fisica', 'espacio', 'tecnologia', 'internacional', 'economia']) {
    ranked.filter((s) => s.topics.includes(topic) && !chosen.has(s)).slice(0, 3).forEach((s) => chosen.add(s));
  }
  return [...chosen].slice(0, AI_STORIES);
}

async function main() {
  const now = Date.now();
  const sources = JSON.parse(await readFile(resolve(ROOT, 'sources.json'), 'utf8'));
  const status = [];

  const perSource = await mapLimit(sources, 8, async (src) => {
    try {
      const items = parseFeed(await fetchText(src.url), src)
        .filter((a) => !a.publishedAt || now - Date.parse(a.publishedAt) < MAX_AGE_HOURS * 3.6e6)
        .slice(0, MAX_PER_SOURCE);
      status.push({ id: src.id, name: src.name, ok: true, count: items.length });
      return items;
    } catch (err) {
      status.push({ id: src.id, name: src.name, ok: false, error: String(err.message ?? err) });
      return [];
    }
  });

  const seen = new Set();
  const articles = perSource.flat().filter((a) => !seen.has(a.id) && seen.add(a.id));
  for (const a of articles) a.topics = classify(a);
  const stories = clusterArticles(articles);

  const previous = await loadPrevious();
  const prevSummaries = Object.fromEntries((previous?.stories ?? []).filter((s) => s.aiSummary).map((s) => [s.id, s.aiSummary]));
  let ai = null;
  try {
    ai = await summarize(pickForAI(stories, now));
  } catch (err) {
    console.warn(`⚠ Resúmenes IA no disponibles: ${err.message}`);
  }
  for (const s of stories) {
    const summary = ai?.summaries[s.id] ?? prevSummaries[s.id];
    if (summary) s.aiSummary = summary;
  }

  const output = {
    generatedAt: new Date(now).toISOString(),
    briefing: ai?.briefing ? { text: ai.briefing, at: new Date(now).toISOString(), model: ai.model } : previous?.briefing ?? null,
    sources: status.sort((a, b) => a.id.localeCompare(b.id)),
    stories: stories.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')),
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(output));

  const failed = status.filter((s) => !s.ok);
  console.log(`✓ ${articles.length} artículos → ${stories.length} noticias de ${status.length - failed.length}/${status.length} fuentes`);
  console.log(`  multi-fuente: ${stories.filter((s) => s.sources.length > 1).length}, con resumen IA: ${stories.filter((s) => s.aiSummary).length}, briefing: ${ai?.briefing ? 'nuevo' : output.briefing ? 'anterior' : 'no'}`);
  for (const f of failed) console.log(`  ✗ ${f.id}: ${f.error}`);
  if (failed.length === status.length) process.exit(1);
}

main();
