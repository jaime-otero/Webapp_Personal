import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ageMinutes } from '../scripts/ci/freshness.js';

const SCRIPT = new URL('../scripts/ci/freshness.js', import.meta.url).pathname;

test('ageMinutes', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  assert.equal(ageMinutes('2026-10-05T11:30:00Z', now), 30);
  assert.equal(ageMinutes('nope', now), null);
  assert.equal(ageMinutes(undefined, now), null);
});

test('freshness.js exit codes: 0 fresh, 1 old, 2 unreadable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fresh-'));
  const write = async (name, body) => (await writeFile(join(dir, name), body), join(dir, name));
  const run = (file, max) => spawnSync(process.execPath, [SCRIPT, file, String(max)], { encoding: 'utf8' }).status;
  const recent = await write('recent.json', JSON.stringify({ generatedAt: new Date(Date.now() - 5 * 60e3).toISOString() }));
  const old = await write('old.json', JSON.stringify({ generatedAt: new Date(Date.now() - 3 * 3600e3).toISOString() }));
  const broken = await write('broken.json', '{ not json');
  const undated = await write('undated.json', '{}');
  assert.equal(run(recent, 20), 0);
  assert.equal(run(old, 20), 1);
  assert.equal(run(broken, 20), 2);
  assert.equal(run(undated, 20), 2);
  assert.equal(run(join(dir, 'missing.json'), 20), 2);
});
