// Serves the static site (web/) and a tiny API to sync a profile between devices:
//   GET /api/profile/:code   → the stored profile (404 if none)
//   PUT /api/profile/:code   → store it (JSON, max 256 KB)
// The code is a random 128-bit id generated in the browser; whoever knows it can read and
// write that profile, nothing else. Profiles hold reading preferences, no personal data.

const CODE_RE = /^[a-f0-9]{32}$/;
const MAX_BYTES = 256 * 1024;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/api\/profile\/([^/]+)$/);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!m || !CODE_RE.test(m[1])) return json({ error: 'not found' }, 404);
    const key = `profile:${m[1]}`;

    if (request.method === 'GET') {
      const stored = await env.PROFILES.get(key);
      return stored ? new Response(stored, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }) : json({ error: 'not found' }, 404);
    }
    if (request.method === 'PUT') {
      const body = await request.text();
      if (body.length > MAX_BYTES) return json({ error: 'too large' }, 413);
      try {
        const parsed = JSON.parse(body);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
      } catch {
        return json({ error: 'invalid json' }, 400);
      }
      await env.PROFILES.put(key, body);
      return json({ ok: true });
    }
    return json({ error: 'method not allowed' }, 405);
  },
};
