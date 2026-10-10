import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compareLevels, levelIdentifier, levelLabels, portalLabel, portalPresentation, portalUnlocked } from '../src/level-labels';
import type { Cell, Dataset } from '../src/types';

test('canonical entrances show the local number and shortcuts show the world number', { skip: !fs.existsSync('public/levels.local.json') }, () => {
  const data = JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) as Dataset;
  const labels = levelLabels(data.levels), target = data.levels.find(l => l.label === '9-01-01')!;
  const cell: Cell = { x: 0, y: 0, key: 0, temperature: 0, fixed: false, storesHeat: true, edges: 0x55, portal: { target: target.id, shortcut: false, before: target.cells[0], after: target.cells[0] } };
  assert.equal(portalLabel(cell, labels), '2');
  cell.portal!.shortcut = true;
  assert.equal(portalLabel(cell, labels), '9-2');
  assert.equal(levelIdentifier(target), '9-2');
  assert.equal(labels.get(data.levels.find(l => l.label === '3-01')!.id)!.full, '3-1');
  assert.equal(labels.get(data.world)!.full, 'w1');
});

test('world three lists and advances rooms in original consecutive number order', { skip: !fs.existsSync('public/levels.local.json') }, () => {
  const data = JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) as Dataset;
  const rooms = data.levels.filter(l => l.worldId === '214a0e55' && l.category === 'main').reverse().sort(compareLevels);
  assert.deepEqual(rooms.map(levelIdentifier), Array.from({ length: 20 }, (_, i) => `3-${i + 1}`));
});

test('shortcut labels follow discovery while canonical entrances remain accessible', () => {
  const labels = new Map([['room', { full: '3-12', local: '12' }]]);
  const cell: Cell = { key: 0, x: 0, y: 0, fixed: false, storesHeat: true, temperature: 0, edges: 0x55 };
  cell.portal = { target: 'room', shortcut: true, before: cell, after: cell };
  const visited = new Set<string>();
  assert.equal(portalUnlocked(cell, visited), false);
  assert.deepEqual(portalPresentation(cell, labels, visited), { text: '3-12', locked: true, ink: '#92979b', weight: 600 });
  visited.add('room');
  assert.deepEqual(portalPresentation(cell, labels, visited), { text: '3-12', locked: false, ink: '#000000', weight: 600 });
  visited.clear();
  assert.equal(portalPresentation(cell, labels, visited).locked, true);
  cell.portal.shortcut = false;
  assert.equal(portalUnlocked(cell, visited), true);
  assert.deepEqual(portalPresentation(cell, labels, visited), { text: '12', locked: false, ink: '#000000', weight: 700 });
});
