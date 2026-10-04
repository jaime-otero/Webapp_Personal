// User profile kept in localStorage (and optionally synced through the worker): explicit
// preferences, the learned model, and what the user did with each story.

import { emptyModel } from './rank.js';

const KEY = 'midiario.profile.v1';
const MAX_SNAPSHOTS = 300;

// Story maps (liked, saved) hold { t: timestamp, d: snapshot } or a tombstone { t, x: 1 } so that a
// removal on one device wins over an older "like" on another when syncing.
export function defaultProfile(now = Date.now()) {
  return {
    v: 2,
    onboarded: false,
    langs: ['es', 'en'],
    sections: {}, // "espana" | "eeuu/nba" → -2 (ocultar) … 3 (me encanta); missing = 1
    sources: {}, // sourceId → -1 (silenciado) | 0 | 1 (favorito)
    boostKeywords: [],
    muteKeywords: [],
    spoilers: { nba: true, extra: [] },
    model: emptyModel(now),
    liked: {},
    saved: {},
    disliked: {}, // storyId → timestamp
    hidden: {},
    read: {},
    seen: {}, // storyId → { n: sessions seen, s: last session, k: skip learned } (not synced)
    sync: { code: null, lastPull: 0, lastPush: 0 },
    prefsAt: now, // last change to explicit preferences
    updatedAt: now,
  };
}

// v1 had topic weights and learned term weights; map them onto sections and model features.
const V1_TOPICS = {
  espana: ['espana'], internacional: ['internacional'], politica: ['espana/politica', 'eeuu/politica'], economia: ['economia', 'espana/economia'],
  ciencia: ['ciencia'], fisica: ['ciencia/fisica'], espacio: ['ciencia/espacio'], tecnologia: ['tecnologia'], salud: ['ciencia/vida'],
  clima: ['ciencia/clima'], deportes: ['espana/deportes'], cultura: ['espana/cultura'],
};

export function migrate(p, now = Date.now()) {
  const base = defaultProfile(now);
  if (p.v === 2) {
    return { ...base, ...p, spoilers: { ...base.spoilers, ...p.spoilers }, sync: { ...base.sync, ...p.sync }, model: { ...base.model, ...p.model } };
  }
  const out = { ...base, onboarded: !!p.onboarded, langs: p.langs ?? base.langs, sources: p.sources ?? {}, boostKeywords: p.boostKeywords ?? [], muteKeywords: p.muteKeywords ?? [] };
  for (const [topic, w] of Object.entries(p.topics ?? {})) {
    if (w === 1) continue;
    for (const key of V1_TOPICS[topic] ?? []) out.sections[key] = Math.max(out.sections[key] ?? -2, w);
  }
  for (const [term, w] of Object.entries(p.learned?.terms ?? {})) out.model.w[`w:${term}`] = w * 0.3;
  for (const [id, story] of Object.entries(p.saved ?? {})) out.saved[id] = { t: now, d: snapshot(story) };
  out.read = p.read ?? {};
  out.hidden = p.hidden ?? {};
  return out;
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadProfile() {
  try {
    const raw = safeStorage()?.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : defaultProfile();
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile) {
  try {
    safeStorage()?.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* storage full or blocked: the session still works in memory */
  }
}

// Small copy of a story, enough to show it in Me gusta / Guardados after it leaves the feed.
export function snapshot(story) {
  const { id, title, summary, aiSummary, image, lang, sections, publishedAt } = story;
  return { id, title, summary, aiSummary, image, lang, sections: sections ?? [], publishedAt, sources: (story.sources ?? []).slice(0, 4) };
}

export const isOn = (map, id) => !!map[id] && !map[id].x;
export const listOf = (map) => Object.values(map).filter((e) => !e.x).sort((a, b) => b.t - a.t).map((e) => e.d);

export function setFlag(map, story, on, now = Date.now()) {
  map[story.id] = on ? { t: now, d: snapshot(story) } : { t: now, x: 1 };
}

// Drop old marks: read/hidden/seen after two weeks, tombstones after a month, and cap the
// snapshot maps so the synced profile stays small.
export function pruneProfile(profile, now = Date.now()) {
  const twoWeeks = now - 14 * 864e5;
  for (const k of ['read', 'hidden', 'disliked']) {
    for (const [id, ts] of Object.entries(profile[k])) if (ts < twoWeeks) delete profile[k][id];
  }
  for (const [id, e] of Object.entries(profile.seen)) if ((e.t ?? 0) < now - 3 * 864e5) delete profile.seen[id];
  for (const k of ['liked', 'saved']) {
    const entries = Object.entries(profile[k]);
    for (const [id, e] of entries) if (e.x && e.t < now - 30 * 864e5) delete profile[k][id];
    const live = entries.filter(([, e]) => !e.x).sort((a, b) => b[1].t - a[1].t);
    for (const [id] of live.slice(MAX_SNAPSHOTS)) delete profile[k][id];
  }
  return profile;
}

// ---------- sync ----------

// What travels to the server: everything except device-local state.
export function toRemote(profile) {
  const { seen, sync, ...rest } = profile;
  return rest;
}

function mergeFlags(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, e] of Object.entries(b)) if (!out[id] || e.t > out[id].t) out[id] = e;
  return out;
}

function mergeTimes(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, t] of Object.entries(b)) out[id] = Math.max(out[id] ?? 0, t);
  return out;
}

// Combine two copies of the profile. Story marks are unioned (newest wins per story), explicit
// preferences and the learned model come from whichever copy changed them last.
export function mergeProfiles(local, remote) {
  if (!remote) return local;
  remote = migrate(remote);
  const prefsFrom = (remote.prefsAt ?? 0) > (local.prefsAt ?? 0) ? remote : local;
  const out = {
    ...local,
    onboarded: local.onboarded || remote.onboarded,
    langs: prefsFrom.langs,
    sections: prefsFrom.sections,
    sources: prefsFrom.sources,
    boostKeywords: prefsFrom.boostKeywords,
    muteKeywords: prefsFrom.muteKeywords,
    spoilers: prefsFrom.spoilers,
    prefsAt: prefsFrom.prefsAt,
    liked: mergeFlags(local.liked, remote.liked),
    saved: mergeFlags(local.saved, remote.saved),
    disliked: mergeTimes(local.disliked, remote.disliked),
    hidden: mergeTimes(local.hidden, remote.hidden),
    read: mergeTimes(local.read, remote.read),
    model: mergeModels(local.model, remote.model),
    updatedAt: Math.max(local.updatedAt ?? 0, remote.updatedAt ?? 0),
  };
  return out;
}

// The copy that learned most recently wins: devices pull before using the app, so the newer
// model already contains the other device's history.
function mergeModels(a, b) {
  if (!b) return a;
  if (!a) return b;
  return (b.t ?? 0) > (a.t ?? 0) ? b : a;
}
