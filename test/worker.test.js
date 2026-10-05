import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { planRun } from '../src/worker.js';

function env() {
  const store = new Map();
  return {
    store,
    PROFILES: { get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) },
    ASSETS: { fetch: async () => new Response('asset') },
  };
}
const CODE = 'a'.repeat(32);
const req = (path, init) => new Request(`https://mi-diario.test${path}`, init);

test('stores and returns a profile by code', async () => {
  const e = env();
  assert.equal((await worker.fetch(req(`/api/profile/${CODE}`), e)).status, 404);
  const put = await worker.fetch(req(`/api/profile/${CODE}`, { method: 'PUT', body: JSON.stringify({ v: 2, sections: { eeuu: 3 } }) }), e);
  assert.equal(put.status, 200);
  const got = await worker.fetch(req(`/api/profile/${CODE}`), e);
  assert.deepEqual(await got.json(), { v: 2, sections: { eeuu: 3 } });
});

test('rejects bad codes, invalid JSON and oversized bodies; other paths are assets', async () => {
  const e = env();
  assert.equal((await worker.fetch(req('/api/profile/short'), e)).status, 404);
  assert.equal((await worker.fetch(req(`/api/profile/${CODE}`, { method: 'PUT', body: 'nope' }), e)).status, 400);
  assert.equal((await worker.fetch(req(`/api/profile/${CODE}`, { method: 'PUT', body: '[1]' }), e)).status, 400);
  assert.equal((await worker.fetch(req(`/api/profile/${CODE}`, { method: 'PUT', body: JSON.stringify({ x: 'y'.repeat(300000) }) }), e)).status, 413);
  assert.equal((await worker.fetch(req(`/api/profile/${CODE}`, { method: 'DELETE' }), e)).status, 405);
  assert.equal(await (await worker.fetch(req('/index.html'), e)).text(), 'asset');
  assert.equal(e.store.size, 0);
});

test('parses invites from commas or lines', async () => {
  const { parseInvites } = await import('../src/worker.js');
  assert.deepEqual([...parseInvites(' ana: uno-dos ,\npepe:tres\nmal\n:x')], [['ana', 'uno-dos'], ['pepe', 'tres']]);
  assert.equal(parseInvites(undefined).size, 0);
});

test('without INVITES the site is open and /api/me says nobody', async () => {
  const e = env();
  assert.deepEqual(await (await worker.fetch(req('/api/me'), e)).json(), { name: null });
  assert.equal(await (await worker.fetch(req('/data/news.json'), e)).text(), 'asset');
});

test('with INVITES: login, cookie session, account sync code and revocation', async () => {
  const e = { ...env(), INVITES: 'ana:clave-ana, pepe:clave-pepe' };
  const html = { accept: 'text/html' };

  const page = await worker.fetch(req('/s/ciencia', { headers: html }), e);
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), '/login?next=%2Fs%2Fciencia');
  assert.equal((await worker.fetch(req('/data/news.json'), e)).status, 401);
  assert.equal((await worker.fetch(req(`/api/profile/${CODE}`), e)).status, 401);
  assert.equal(await (await worker.fetch(req('/manifest.webmanifest'), e)).text(), 'asset');
  assert.equal((await worker.fetch(req('/login'), e)).status, 200);

  const form = (code, next = '/s/ciencia') => ({ method: 'POST', body: new URLSearchParams({ code, next }) });
  assert.equal((await worker.fetch(req('/login', form('mala')), e)).status, 401);
  assert.equal((await worker.fetch(req('/login', form(' Clave-Ana ')), e)).status, 303);
  const ok = await worker.fetch(req('/login', form('clave-ana', '//evil.com')), e);
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get('location'), '/');
  const cookie = ok.headers.get('set-cookie').split(';')[0];

  const authed = { headers: { cookie } };
  assert.equal(await (await worker.fetch(req('/data/news.json', authed), e)).text(), 'asset');
  const me = await (await worker.fetch(req('/api/me', authed), e)).json();
  assert.equal(me.name, 'ana');
  assert.match(me.sync, /^[a-f0-9]{32}$/);
  assert.equal((await worker.fetch(req(`/api/profile/${me.sync}`, { method: 'PUT', body: '{"v":2}', ...authed }), e)).status, 200);

  const pepe = (await worker.fetch(req('/login', form('clave-pepe')), e)).headers.get('set-cookie').split(';')[0];
  assert.notEqual((await (await worker.fetch(req('/api/me', { headers: { cookie: pepe } }), e)).json()).sync, me.sync);

  const forged = cookie.replace(/\.[a-f0-9]+$/, `.${'0'.repeat(64)}`);
  assert.equal((await worker.fetch(req('/api/me', { headers: { cookie: forged } }), e)).status, 401);
  const changed = { ...e, INVITES: 'ana:otra-clave' };
  assert.equal((await worker.fetch(req('/api/me', authed), changed)).status, 401);

  const out = await worker.fetch(req('/logout', authed), e);
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
});

test('plans news updates every 30 min with AI on the even hours', () => {
  const at = (hm) => planRun(new Date(`2026-10-05T${hm}:00Z`));
  assert.deepEqual(at('05:17'), { ai: false });
  assert.deepEqual(at('06:17'), { ai: true });
  assert.deepEqual(at('06:47'), { ai: false });
  assert.deepEqual(at('22:17'), { ai: true });
  assert.deepEqual(at('22:47'), { ai: false });
  assert.deepEqual(at('03:17'), { ai: false });
  assert.equal(at('03:47'), null);
  assert.equal(at('23:17'), null);
  assert.equal(at('00:47'), null);
});

test('the cron dispatches the update workflow on GitHub', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => (calls.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization }), new Response(null, { status: 204 }));
  try {
    const run = async (iso, e) => {
      const pending = [];
      await worker.scheduled({ scheduledTime: Date.parse(iso) }, e, { waitUntil: (p) => pending.push(p) });
      await Promise.all(pending);
    };
    await run('2026-10-05T10:17:00Z', { GITHUB_DISPATCH_TOKEN: 't', GITHUB_REPO: 'me/repo' });
    await run('2026-10-05T10:47:00Z', { GITHUB_DISPATCH_TOKEN: 't', GITHUB_REPO: 'me/repo' });
    await run('2026-10-05T23:47:00Z', { GITHUB_DISPATCH_TOKEN: 't' }); // night: nothing
    await run('2026-10-05T10:17:00Z', {}); // no token: nothing
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://api.github.com/repos/me/repo/actions/workflows/update-news.yml/dispatches');
    assert.equal(calls[0].auth, 'Bearer t');
    assert.deepEqual(calls[0].body, { ref: 'main', inputs: { resumen_ia: 'si' } });
    assert.deepEqual(calls[1].body.inputs, { resumen_ia: 'no' });
  } finally {
    globalThis.fetch = realFetch;
  }
});
