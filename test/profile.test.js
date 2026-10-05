import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProfile, migrate, mergeProfiles, setFlag, isOn, listOf, toRemote, pruneProfile, orderedSections, moveSection } from '../web/lib/profile.js';
import { train } from '../web/lib/rank.js';

const story = (id, title = 'Algo') => ({ id, title, sections: ['ciencia'], lang: 'es', sources: [{ sourceId: 'x', source: 'X', url: 'https://x', title }] });

test('migrates a v1 profile (topics, learned terms, saved stories)', () => {
  const v1 = { onboarded: true, langs: ['es'], topics: { fisica: 3, deportes: -2, ciencia: 1 }, learned: { terms: { nba: 2 } }, saved: { a: story('a') }, read: { b: 1 }, hidden: {} };
  const p = migrate(v1);
  assert.equal(p.v, 2);
  assert.equal(p.sections['ciencia/fisica'], 3);
  assert.equal(p.sections['espana/deportes'], -2);
  assert.ok(!('ciencia' in p.sections));
  assert.ok(p.model.w['w:nba'] > 0);
  assert.ok(isOn(p.saved, 'a'));
  assert.deepEqual(p.langs, ['es']);
});

test('likes from both devices are kept; a later unlike wins over an older like', () => {
  const a = defaultProfile(1000);
  const b = defaultProfile(1000);
  setFlag(a.liked, story('1'), true, 2000);
  setFlag(b.liked, story('2'), true, 2100);
  setFlag(b.liked, story('1'), true, 1500);
  let m = mergeProfiles(a, b);
  assert.deepEqual(listOf(m.liked).map((s) => s.id).sort(), ['1', '2']);
  setFlag(b.liked, story('1'), false, 3000);
  m = mergeProfiles(m, b);
  assert.equal(isOn(m.liked, '1'), false);
});

test('preferences and model come from whichever copy changed them last', () => {
  const a = defaultProfile(1000);
  const b = defaultProfile(1000);
  a.sections.eeuu = 3;
  a.prefsAt = 2000;
  b.sections.eeuu = 0;
  b.prefsAt = 3000;
  train(a.model, story('1', 'Física cuántica'), 'like', 5000);
  const m = mergeProfiles(a, b);
  assert.equal(m.sections.eeuu, 0);
  assert.equal(m.model, a.model);
});

test('device-local state is not uploaded; prune caps old marks', () => {
  const p = defaultProfile(0);
  p.seen.x = { n: 1, t: 0 };
  p.sync.code = 'abc';
  const r = toRemote(p);
  assert.ok(!('seen' in r) && !('sync' in r));
  p.read.old = 0;
  p.read.new = 30 * 864e5;
  pruneProfile(p, 30 * 864e5);
  assert.deepEqual(Object.keys(p.read), ['new']);
});

test('sections and subsections can be reordered; unplaced ones keep their default spot', () => {
  const p = defaultProfile(1);
  const ids = (list) => list.map((s) => s.id);
  const def = ids(orderedSections(p));
  assert.equal(def[0], 'espana');

  assert.ok(moveSection(p, 'eeuu', -1));
  assert.deepEqual(ids(orderedSections(p)).slice(0, 2), ['eeuu', 'espana']);
  assert.equal(moveSection(p, 'eeuu', -1), false); // already first

  assert.ok(moveSection(p, 'eeuu/nba', -1));
  const eeuu = orderedSections(p).find((s) => s.id === 'eeuu');
  assert.deepEqual(ids(eeuu.subs).slice(2, 4), ['nba', 'sociedad']);
  assert.equal(eeuu.subs.find((s) => s.id === 'nba').key, 'eeuu/nba');

  // A section added later (not in the saved order) goes after the ones the person placed.
  p.order[''] = ['ciencia', 'espana'];
  assert.deepEqual(ids(orderedSections(p)).slice(0, 3), ['ciencia', 'espana', 'eeuu']);
  assert.equal(orderedSections(p).length, def.length);
});

test('the section order syncs with the other explicit preferences', () => {
  const local = { ...defaultProfile(1), prefsAt: 10 };
  const remote = { ...defaultProfile(1), prefsAt: 20, order: { '': ['ciencia'] } };
  assert.deepEqual(mergeProfiles(local, remote).order, { '': ['ciencia'] });
  assert.deepEqual(mergeProfiles({ ...local, prefsAt: 30 }, remote).order, {});
  const { order, ...old } = defaultProfile(1);
  assert.deepEqual(migrate(old).order, {});
});
