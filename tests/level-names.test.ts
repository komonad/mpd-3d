import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nativeLevelNames } from '../scripts/level-names.mjs';
import type { Dataset } from '../src/types';

test('main and extra numbering continues through nested rooms within each world', () => {
  const names = nativeLevelNames({ id: 'root', normalSublevels: [{ id: 'hub', world: true, normalSublevels: [
    { id: 'w1', world: true, normalSublevels: [{ id: 'one', normalSublevels: [{ id: 'two' }], hintSublevels: [{ id: 'hint', hintSublevels: [{ id: 'hint2' }] }, { id: 'hint3' }] }, { id: 'three' }], extraSublevels: [{ id: 'a', extraSublevels: [{ id: 'b' }] }, { id: 'c' }] },
    { id: 'w2', world: true, normalSublevels: [{ id: 'next' }] },
  ] }] });
  for (const [id, full] of [['one', '1-1'], ['two', '1-2'], ['three', '1-3'], ['a', '1-A'], ['b', '1-B'], ['c', '1-C'], ['next', '2-1'], ['hint', '1-1:?'], ['hint2', '1-1:?₁'], ['hint3', '1-1:?₂']]) {
    assert.equal(names.get(id)!.displayName, full);
  }
});
test('meta families use a global Greek letter and numbered variants', () => {
  const names = nativeLevelNames({ id: 'root', metaSublevels: [{ id: 'alpha', metaSublevels: [{ id: 'alpha2' }, { id: 'alpha3' }] }, { id: 'beta' }] });
  assert.equal(names.get('alpha')!.displayName, '0-α'); assert.equal(names.get('alpha2')!.displayName, '0-α₂');
  assert.equal(names.get('alpha3')!.localName, 'α₃'); assert.equal(names.get('beta')!.displayName, '0-β');
});
test('world three numbers nested entrances consecutively from 11 through 20', { skip: !fs.existsSync('public/levels.local.json') }, () => {
  const data = JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) as Dataset;
  for (const [id, full] of [['f279621b', '3-11'], ['b32c8c9c', '3-12'], ['9334fa16', '3-13'], ['83e5acbe', '3-14'], ['d6f916c3', '3-15'], ['18e88a0f', '3-16'], ['6290240c', '3-20']]) {
    assert.equal(data.levels.find(l => l.id === id)!.displayName, full);
  }
});
