import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCorrections, setCorrection, clearCorrection, listCorrections, pruneCorrections } from '../web/lib/corrections.js';
import { defaultProfile, mergeProfiles } from '../web/lib/profile.js';

const story = (id, title, sections) => ({ id, title, sections, sources: [] });

test('a correction moves the story and similar ones, not unrelated ones', () => {
  const p = defaultProfile();
  const a = story('a', 'Deisseroth, Hegemann y Nagel ganan el Nobel de Medicina por la optogenética', ['ciencia/vida', 'espana']);
  const b = story('b', 'Premio Nobel de Medicina para Deisseroth, Hegemann y Nagel', ['espana/sociedad']);
  const c = story('c', 'El Gobierno aprueba los presupuestos', ['espana/politica']);
  setCorrection(p, a, ['ciencia/vida']);
  applyCorrections([a, b, c], p);
  assert.deepEqual(a.sections, ['ciencia/vida']);
  assert.equal(a.corrected, 'own');
  // España (all of it) was removed on a similar headline: also gone here.
  assert.deepEqual(b.sections, []);
  assert.equal(b.corrected, 'similar');
  assert.deepEqual(c.sections, ['espana/politica']);
  assert.equal(c.corrected, undefined);
});

test('additions carry over and undo restores the classifier', () => {
  const p = defaultProfile();
  const a = story('a', 'Nobel de Física para tres pioneros de la computación cuántica', ['espana']);
  const b = story('b', 'Tres pioneros de la computación cuántica ganan el Nobel de Física', ['espana/sociedad']);
  setCorrection(p, a, ['ciencia/fisica']);
  applyCorrections([a, b], p);
  assert.deepEqual(b.sections, ['ciencia/fisica']);
  clearCorrection(p, 'a');
  applyCorrections([a, b], p);
  assert.deepEqual(a.sections, ['espana']);
  assert.deepEqual(b.sections, ['espana/sociedad']);
  assert.equal(listCorrections(p).length, 0);
});

test('choosing the original sections stores no correction', () => {
  const p = defaultProfile();
  const a = story('a', 'Algo', ['espana', 'ciencia']);
  setCorrection(p, a, ['ciencia', 'espana']);
  assert.equal(listCorrections(p).length, 0);
});

test('corrections sync (newest wins) and old ones are pruned', () => {
  const now = Date.now();
  const local = defaultProfile(now);
  const remote = defaultProfile(now);
  const a = story('a', 'Nobel de Medicina para la optogenética', ['espana']);
  setCorrection(remote, a, ['ciencia/vida'], now - 1000);
  setCorrection(local, a, ['ciencia'], now);
  assert.deepEqual(mergeProfiles(local, remote).reclass.a.s, ['ciencia']);
  assert.deepEqual(mergeProfiles(defaultProfile(now), remote).reclass.a.s, ['ciencia/vida']);
  setCorrection(local, story('old', 'Vieja noticia de ciencia', ['espana']), [], now - 40 * 864e5);
  pruneCorrections(local, now);
  assert.equal(local.reclass.old, undefined);
  assert.ok(local.reclass.a);
});
