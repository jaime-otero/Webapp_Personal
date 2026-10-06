import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeed } from './parse.js';
import { classify } from './classify.js';
import { clusterArticles } from './cluster.js';
import { summarize, hasAIKey } from './summarize.js';
import { SECTIONS } from '../../web/lib/taxonomy.js';
import { aiJobs, inSection } from './jobs.js';
import { isSpoiler } from '../../web/lib/spoilers.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'web/data/news.json');
const META = resolve(ROOT, 'web/data/meta.json');
const MAX_AGE_HOURS = 48;
const MAX_PER_SOURCE = 30;
const AI_CONCURRENCY = 3;
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

// Previous output (in Actions, restored from the cache by the workflow) so AI summaries survive a
// failed or skipped AI call.
async function loadPrevious() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return null;
  }
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

  // The same URL can come from several section feeds of one outlet: keep one, with every section hint.
  const byId = new Map();
  for (const a of perSource.flat()) {
    const prev = byId.get(a.id);
    if (prev) prev.feedSections = [...new Set([...prev.feedSections, ...a.feedSections])];
    else byId.set(a.id, a);
  }
  const articles = [...byId.values()];
  for (const a of articles) a.sections = classify(a);
  const stories = clusterArticles(articles);
  for (const s of stories) if (isSpoiler(s)) s.spoiler = true;

  const previous = await loadPrevious();
  const prevSummaries = Object.fromEntries((previous?.stories ?? []).filter((s) => s.aiSummary).map((s) => [s.id, s.aiSummary]));
  const briefings = { ...(previous?.briefings ?? {}) };
  const summaries = {};
  let fresh = 0;
  const skipAI = process.env.SKIP_AI === '1';
  // Three sections at a time: GitHub bills by wall-clock minutes, and the free Gemini tier
  // allows ~15 requests/minute. Results are applied in job order (portada first).
  const jobs = skipAI || !hasAIKey() ? [] : aiJobs(stories, now);
  const results = await mapLimit(jobs, AI_CONCURRENCY, async (job) => {
    try {
      return await summarize(job.stories, { label: job.label, nba: job.nba, now });
    } catch (err) {
      console.warn(`⚠ Resumen IA de "${job.label}" no disponible: ${err.message.slice(0, 300)}`);
      return null;
    }
  });
  jobs.forEach((job, i) => {
    const ai = results[i];
    if (!ai) return;
    if (ai.briefing) {
      briefings[job.id] = { text: ai.briefing, at: new Date(now).toISOString(), model: ai.model };
      fresh++;
    }
    for (const [id, text] of Object.entries(ai.summaries)) summaries[id] ??= text;
  });
  for (const s of stories) {
    const summary = s.spoiler ? null : summaries[s.id] ?? prevSummaries[s.id];
    if (summary) s.aiSummary = summary;
  }

  const output = {
    generatedAt: new Date(now).toISOString(),
    briefings,
    sources: status.sort((a, b) => a.id.localeCompare(b.id)),
    stories: stories.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')),
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(output));
  // Tiny file the open web app polls to know when a new edition is out.
  await writeFile(META, JSON.stringify({ generatedAt: output.generatedAt, stories: stories.length }));

  const failed = status.filter((s) => !s.ok);
  const count = (sec) => stories.filter((s) => inSection(s, sec)).length;
  console.log(`✓ ${articles.length} artículos → ${stories.length} noticias de ${status.length - failed.length}/${status.length} fuentes`);
  console.log(`  por sección: ${SECTIONS.map((s) => `${s.id} ${count(s.id)}`).join(', ')}, nba ${count('eeuu/nba')} (spoilers ${stories.filter((s) => s.spoiler).length})`);
  console.log(`  multi-fuente: ${stories.filter((s) => s.sources.length > 1).length}, con resumen IA: ${stories.filter((s) => s.aiSummary).length}, briefings nuevos: ${skipAI ? '0 (IA omitida)' : fresh}/${Object.keys(briefings).length}`);
  const models = [...new Set(Object.values(briefings).filter((b) => b.at === output.generatedAt).map((b) => b.model))];
  if (models.length) console.log(`  modelos IA: ${models.join(', ')}`);
  for (const f of failed) console.log(`  ✗ ${f.id}: ${f.error}`);
  if (failed.length === status.length) process.exit(1);
}

main();
