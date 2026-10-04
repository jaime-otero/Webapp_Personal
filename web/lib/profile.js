// User profile kept in localStorage: explicit preferences + what the app learns from reading.

export const TOPICS = {
  espana: 'España',
  internacional: 'Internacional',
  politica: 'Política',
  economia: 'Economía',
  ciencia: 'Ciencia',
  fisica: 'Física',
  espacio: 'Espacio',
  tecnologia: 'Tecnología e innovación',
  salud: 'Salud',
  clima: 'Clima y medio ambiente',
  deportes: 'Deportes',
  cultura: 'Cultura',
};

const KEY = 'midiario.profile.v1';

export function defaultProfile() {
  return {
    onboarded: false,
    langs: ['es', 'en'],
    topics: Object.fromEntries(Object.keys(TOPICS).map((t) => [t, 1])), // -2 (ocultar) … 3 (me encanta)
    sources: {}, // sourceId → -1 (silenciado) | 0 | 1 (favorito)
    boostKeywords: [],
    muteKeywords: [],
    learned: { terms: {}, topics: {}, updatedAt: Date.now() },
    read: {}, // storyId → timestamp
    saved: {}, // storyId → story snapshot
    hidden: {}, // storyId → timestamp
  };
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
    if (!raw) return defaultProfile();
    const base = defaultProfile();
    const p = JSON.parse(raw);
    return { ...base, ...p, topics: { ...base.topics, ...p.topics }, learned: { ...base.learned, ...p.learned } };
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

// Forget read/hidden marks older than two weeks (stories are gone from the feed by then).
export function pruneProfile(profile, now = Date.now()) {
  const limit = now - 14 * 864e5;
  for (const k of ['read', 'hidden']) {
    for (const [id, ts] of Object.entries(profile[k])) if (ts < limit) delete profile[k][id];
  }
  return profile;
}
