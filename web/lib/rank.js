import { normalize, tokens } from './tokens.js';

const HOUR = 3.6e6;
const MAX_TERMS = 600;

const containsKeyword = (text, kw) => kw && normalize(text).includes(normalize(kw));

// Returns a score, or null when the story must not be shown at all.
export function scoreStory(story, profile, now = Date.now()) {
  if (profile.hidden[story.id]) return null;
  if (!profile.langs.includes(story.lang)) return null;
  const sourceWeights = story.sources.map((s) => profile.sources[s.sourceId] ?? 0);
  if (sourceWeights.every((w) => w < 0)) return null;
  const text = `${story.title} ${story.summary ?? ''}`;
  if (profile.muteKeywords.some((k) => containsKeyword(text, k))) return null;

  const topicWeights = story.topics.map((t) => (profile.topics[t] ?? 1) + (profile.learned.topics[t] ?? 0));
  if (story.topics.length && story.topics.every((t) => (profile.topics[t] ?? 1) <= -2)) return null;
  const topicScore = topicWeights.length ? Math.max(...topicWeights) + 0.2 * (topicWeights.reduce((a, b) => a + b, 0) / topicWeights.length) : 0.5;

  const terms = tokens(story.title);
  const learned = terms.reduce((acc, t) => acc + (profile.learned.terms[t] ?? 0), 0) / Math.sqrt(terms.length || 1);

  const boost = profile.boostKeywords.filter((k) => containsKeyword(text, k)).length * 3;
  const sourceScore = Math.max(...sourceWeights) * 1.5;
  const coverage = Math.log2(story.sources.length) * 1.2;
  const ageH = story.publishedAt ? Math.max(0, (now - Date.parse(story.publishedAt)) / HOUR) : 36;
  const recency = -ageH / 8;
  const readPenalty = profile.read[story.id] ? -4 : 0;

  return topicScore * 1.5 + Math.max(-3, Math.min(3, learned)) + boost + sourceScore + coverage + recency + readPenalty + (story.aiSummary ? 0.3 : 0);
}

// Sort by score with a small diversity penalty so the top is not ten stories on one topic.
export function rankStories(stories, profile, now = Date.now()) {
  const scored = [];
  for (const story of stories) {
    const score = scoreStory(story, profile, now);
    if (score !== null) scored.push({ story, score });
  }
  scored.sort((a, b) => b.score - a.score);

  const result = [];
  const pool = scored.slice(0, 300);
  const seenTopics = {};
  while (pool.length) {
    let bestI = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < Math.min(pool.length, 15); i++) {
      const main = pool[i].story.topics[0];
      const val = pool[i].score - 0.6 * (seenTopics[main] ?? 0);
      if (val > bestVal) {
        bestVal = val;
        bestI = i;
      }
    }
    const [picked] = pool.splice(bestI, 1);
    const main = picked.story.topics[0];
    seenTopics[main] = (seenTopics[main] ?? 0) + 1;
    result.push(picked.story);
  }
  return result.concat(scored.slice(300).map((s) => s.story));
}

const SIGNALS = { open: 1, like: 2.5, save: 2, dislike: -2.5, hide: -1.5 };

// Implicit learning: reinforce (or weaken) the title terms and topics of the story.
export function learn(profile, story, signal, now = Date.now()) {
  const w = SIGNALS[signal];
  if (!w) return profile;
  decay(profile, now);
  const { terms, topics } = profile.learned;
  for (const t of new Set(tokens(story.title))) terms[t] = clamp((terms[t] ?? 0) + w * 0.5, -4, 4);
  for (const t of story.topics) topics[t] = clamp((topics[t] ?? 0) + w * 0.1, -1.5, 1.5);

  const entries = Object.entries(terms);
  if (entries.length > MAX_TERMS) {
    entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    profile.learned.terms = Object.fromEntries(entries.slice(0, MAX_TERMS));
  }
  return profile;
}

// Old interests fade: 3 % per day.
function decay(profile, now) {
  const days = (now - (profile.learned.updatedAt ?? now)) / 864e5;
  if (days >= 1) {
    const f = Math.pow(0.97, days);
    for (const map of [profile.learned.terms, profile.learned.topics]) {
      for (const k of Object.keys(map)) {
        map[k] *= f;
        if (Math.abs(map[k]) < 0.05) delete map[k];
      }
    }
    profile.learned.updatedAt = now;
  }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
