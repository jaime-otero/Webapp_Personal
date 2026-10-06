// Section prototypes from embeddings: the mean vector of the articles that topical feeds (Marca,
// Xataka, Expansión, Agencia SINC…) filed under each topic in this same run, plus an "other news"
// prototype from politics and world feeds. classify.js uses them only to settle borderline keyword
// calls on general feeds, never on their own: measured on this run's topical feeds (leaving each
// outlet out), the nearest prototype is right 74 % of the time (90 % with a clear margin), the keyword
// rules 95 %.

import { dot, normalizeVec } from './embed.js';

export const TOPICS = ['ciencia', 'tecnologia', 'economia', 'deportes'];
const OTHER = 'otras';
const MIN_EXAMPLES = 10;
const SPORT_HINTS = ['espana/deportes', 'eeuu/nba', 'eeuu/nfl', 'eeuu/universitario'];

// The topic a feed vouches for, or null: one topical section, or none at all on a politics, world,
// society or culture feed. General feeds (España, EE. UU., Internacional) give no label.
export function feedTopic(hints = []) {
  const topics = new Set(hints.map((h) => h.split('/')[0]).filter((t) => TOPICS.includes(t)));
  if (hints.some((h) => SPORT_HINTS.includes(h))) topics.add('deportes');
  if (hints.includes('espana/economia')) topics.add('economia');
  if (topics.size === 1) return [...topics][0];
  if (!topics.size && hints.some((h) => /politica|sociedad|cultura|^internacional\//.test(h))) return OTHER;
  return null;
}

// → { score(vec) → { best, margin, sims } } or null when some topic lacks examples.
export function buildPrototypes(articles, vectors) {
  const sums = new Map();
  const counts = new Map();
  for (const a of articles) {
    const topic = feedTopic(a.feedSections);
    const v = vectors.get(a.id);
    if (!topic || !v) continue;
    const sum = sums.get(topic) ?? new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) sum[i] += v[i];
    sums.set(topic, sum);
    counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }
  const classes = [...TOPICS, OTHER];
  if (classes.some((c) => (counts.get(c) ?? 0) < MIN_EXAMPLES)) return null;
  const protos = classes.map((c) => [c, normalizeVec(sums.get(c))]);
  return {
    counts: Object.fromEntries(counts),
    score(vec) {
      const sims = protos.map(([c, p]) => [c, dot(vec, p)]).sort((a, b) => b[1] - a[1]);
      return { best: sims[0][0], margin: sims[0][1] - sims[1][1], sims: Object.fromEntries(sims) };
    },
  };
}
