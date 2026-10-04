import { tokens } from './text.js';

const SIMILARITY = 0.4;

// Mix of Jaccard and overlap coefficient: headlines of the same story vary a lot in length
// ("Merz visits Kyiv" vs "German chancellor visits Ukraine in show of support").
function similarity(a, b) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  if (inter < 2) return 0;
  const jaccard = inter / (a.size + b.size - inter);
  const overlap = inter / Math.min(a.size, b.size);
  return Math.max(jaccard, inter >= 3 ? overlap * 0.7 : 0);
}

// Groups articles about the same story across outlets (same language only: title overlap
// does not work across languages). Greedy single pass, newest first; good enough for a few
// thousand articles.
export function clusterArticles(articles) {
  const sorted = [...articles].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  const clusters = [];
  for (const art of sorted) {
    const tk = new Set(tokens(`${art.title}`));
    let best = null;
    let bestScore = SIMILARITY;
    for (const c of clusters) {
      if (c.lang !== art.lang || tk.size < 3) continue;
      const s = Math.max(...c.articleTokens.map((t) => similarity(tk, t)));
      if (s >= bestScore) {
        best = c;
        bestScore = s;
      }
    }
    if (best && !best.articles.some((a) => a.sourceId === art.sourceId || a.source === art.source)) {
      best.articles.push(art);
      best.articleTokens.push(tk);
    } else if (best) {
      // Same outlet republishing in another section: keep it out as a duplicate.
      continue;
    } else {
      clusters.push({ lang: art.lang, articleTokens: [tk], articles: [art] });
    }
  }
  return clusters.map((c) => {
    const lead = c.articles.find((a) => a.image) ?? c.articles[0];
    const topics = [...new Set(c.articles.flatMap((a) => a.topics))];
    return {
      id: c.articles[c.articles.length - 1].id,
      title: lead.title,
      summary: lead.summary,
      image: lead.image,
      lang: c.lang,
      topics,
      publishedAt: c.articles.map((a) => a.publishedAt).filter(Boolean).sort().at(-1) ?? null,
      sources: c.articles.map(({ title, url, source, sourceId, publishedAt }) => ({ title, url, source, sourceId, publishedAt })),
    };
  });
}
