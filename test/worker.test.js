import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

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
