// Section corrections: the person says where a story belongs ("esto no es de España, es de
// Ciencia"). The fix applies to that story and to similar ones (the same news from another outlet
// or a later edition), and travels with the synced profile.

import { tokens } from './tokens.js';

const MAX_CORRECTIONS = 200;
const KEEP_DAYS = 30;
const MIN_SHARED = 3;
const MIN_OVERLAP = 0.5;

const top = (key) => key.split('/')[0];

// Remember the corrected sections of a story; `sections` equal to the original clears it.
export function setCorrection(profile, story, sections, now = Date.now()) {
  const orig = story.orig ?? story.sections ?? [];
  const same = sections.length === orig.length && sections.every((s) => orig.includes(s));
  profile.reclass[story.id] = same ? { t: now, x: 1 } : { t: now, s: sections, o: orig, k: [...new Set(tokens(story.title ?? ''))], ti: story.title };
}

export function clearCorrection(profile, id, now = Date.now()) {
  if (profile.reclass[id]) profile.reclass[id] = { t: now, x: 1 };
}

// The sections a story should have, given its original ones and a correction made on a story
// like it: drop what the person removed (a whole section when they removed all of it) and add
// what they added.
function applyDelta(base, c) {
  const removedKeys = c.o.filter((k) => !c.s.includes(k));
  const removedTops = new Set(removedKeys.map(top).filter((t) => !c.s.some((k) => top(k) === t)));
  const added = c.s.filter((k) => !c.o.includes(k));
  const out = base.filter((k) => !removedKeys.includes(k) && !removedTops.has(top(k)));
  for (const k of added) if (!out.includes(k)) out.push(k);
  return out;
}

// Most similar correction by shared title words: at least MIN_SHARED of them and half of the
// shorter title, so "Nobel de Medicina para X y Y" matches another outlet's headline of the same news.
function similar(story, live) {
  const words = new Set(tokens(story.title ?? ''));
  let best = null;
  let bestScore = 0;
  for (const c of live) {
    const shared = c.k.filter((w) => words.has(w)).length;
    const overlap = shared / Math.max(1, Math.min(words.size, c.k.length));
    if (shared >= MIN_SHARED && overlap >= MIN_OVERLAP && overlap > bestScore) {
      best = c;
      bestScore = overlap;
    }
  }
  return best;
}

// Rewrite story.sections in place (the classifier's choice is kept in story.orig so it can be undone).
export function applyCorrections(stories, profile) {
  const live = Object.values(profile.reclass ?? {}).filter((c) => !c.x);
  for (const story of stories) {
    story.orig ??= story.sections ?? [];
    const own = profile.reclass?.[story.id];
    if (own && !own.x) {
      story.sections = own.s;
      story.corrected = 'own';
      continue;
    }
    const c = live.length ? similar(story, live) : null;
    const next = c ? applyDelta(story.orig, c) : story.orig;
    const changed = next.length !== story.orig.length || next.some((k) => !story.orig.includes(k));
    story.sections = changed ? next : story.orig;
    if (changed) story.corrected = 'similar';
    else delete story.corrected;
  }
  return stories;
}

// Newest first, for Ajustes.
export const listCorrections = (profile) =>
  Object.entries(profile.reclass ?? {})
    .filter(([, c]) => !c.x)
    .sort((a, b) => b[1].t - a[1].t)
    .map(([id, c]) => ({ id, ...c }));

// Drop tombstones and corrections older than a month, and cap how many are kept.
export function pruneCorrections(profile, now = Date.now()) {
  const cutoff = now - KEEP_DAYS * 864e5;
  const map = profile.reclass ?? {};
  for (const [id, c] of Object.entries(map)) if (c.t < cutoff) delete map[id];
  for (const { id } of listCorrections(profile).slice(MAX_CORRECTIONS)) delete map[id];
  profile.reclass = map;
  return profile;
}
