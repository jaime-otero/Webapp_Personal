// App shell: stale-while-revalidate (instant load, updates picked up on the next visit). News data: network-first with the cached copy as offline fallback.
const VERSION = 'v5';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'lib/profile.js', 'lib/rank.js', 'lib/tokens.js', 'lib/taxonomy.js', 'lib/spoilers.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(`shell-${VERSION}`).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== `shell-${VERSION}`).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  if (url.pathname.endsWith('/data/meta.json')) return; // always from the network
  if (url.pathname.endsWith('/data/news.json')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open('data').then((c) => c.put('data/news.json', copy));
          }
          return res;
        })
        .catch(() => caches.match('data/news.json')),
    );
    return;
  }
  e.respondWith(
    caches.open(`shell-${VERSION}`).then(async (cache) => {
      const hit = await cache.match(e.request, { ignoreSearch: true });
      const update = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => hit);
      if (hit) e.waitUntil(update);
      return hit ?? update;
    }),
  );
});
