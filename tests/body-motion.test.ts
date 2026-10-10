import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, move } from '../src/engine';
import { motionBodies } from '../src/body-motion';
import type { Cell, Level } from '../src/types';

const cell = (key: number, x: number, y: number, edges = 0x55): Cell => ({ key, x, y, edges, temperature: 0, fixed: false, storesHeat: true });

test('a pushed adhesive block settles independently of its stationary attachment for either root key', () => {
  for (const reversed of [false, true]) {
    const cells = [cell(0, 3, 2, 0x75), cell(1, 5, 2)];
    const level: Level = { id: 'adhesion-motion', label: 'test', width: 9, height: 5, category: 'lab', cells: reversed ? cells.reverse() : cells,
      players: [{ x: 2, y: 2 }], goals: [], tail: [0] };
    const before = initialState(level), after = move(level, before, 2)!;
    const stationary = before.cells.find(c => c.x === 5)!, pushed = before.cells.find(c => c.x === 3)!;
    assert.equal(after.cells.find(c => c.key === stationary.key)!.x, 5);
    const rendered = new Map(before.cells.map(c => [c.key, { x: c.x, y: c.y }]));
    const start = motionBodies(after.cells, rendered);
    assert.equal(start.merging, true);
    assert.deepEqual(start.groups.map(group => group.map(c => c.key)).sort(), [[stationary.key], [pushed.key]].sort());
    rendered.set(pushed.key, { x: 3.6, y: 2 });
    assert.equal(motionBodies(after.cells, rendered).merging, true);
    rendered.set(pushed.key, { x: 4, y: 2 });
    const settled = motionBodies(after.cells, rendered);
    assert.equal(settled.merging, false); assert.equal(settled.groups.length, 1);
  }
});

test('a moving welded body keeps its contour while a new stationary body awaits adhesion', () => {
  const cells = [cell(1, 4, 2, 0x74), cell(2, 3, 2, 0x45), cell(3, 5, 2)];
  const rendered = new Map([[1, { x: 3.25, y: 2 }], [2, { x: 2.25, y: 2 }], [3, { x: 5, y: 2 }]]);
  const plan = motionBodies(cells, rendered);
  assert.equal(plan.merging, true);
  assert.deepEqual(plan.groups.map(group => group.map(c => c.key)), [[1, 2], [3]]);
});
