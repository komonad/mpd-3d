import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { levelLabels, portalLabel } from '../src/level-labels';
import type { Cell, Dataset } from '../src/types';

test('canonical entrances show the local name and shortcuts show the hierarchy', { skip: !fs.existsSync('public/levels.local.json') }, () => {
  const data = JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) as Dataset;
  const labels = levelLabels(data.levels), target = data.levels.find(l => l.label === '9-01-01')!;
  const cell: Cell = { x: 0, y: 0, key: 0, temperature: 0, fixed: false, storesHeat: true, edges: 0x55, portal: { target: target.id, shortcut: false, before: target.cells[0], after: target.cells[0] } };
  assert.equal(portalLabel(cell, labels), '1');
  cell.portal!.shortcut = true;
  assert.equal(portalLabel(cell, labels), '9-1:1');
  assert.equal(labels.get(data.levels.find(l => l.label === '3-01')!.id)!.full, '3-1');
  assert.equal(labels.get(data.world)!.full, 'w1');
});
