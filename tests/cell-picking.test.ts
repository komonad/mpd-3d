import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickBodyCell } from '../src/cell-picking';
import type { Cell } from '../src/types';

const cells: Cell[] = [10, 11, 12].map((key, i) => ({ key, x: 2, y: i + 3, fixed: false, storesHeat: false, temperature: 0, edges: 0x55 }));

test('labels select their own entrance within a connected multi-cell body', () => {
  assert.equal(pickBodyCell(cells, { x: 2, y: 3.6 }, 10)?.key, 10);
  assert.equal(pickBodyCell(cells, { x: 2, y: 3.1 }, 12)?.key, 12);
});
test('surface edges select the neighboring cell without falling back to the body root', () => {
  assert.equal(pickBodyCell(cells, { x: 2.500001, y: 5.500001 })?.key, 12);
  assert.equal(pickBodyCell(cells, { x: 2, y: 4 })?.key, 11);
  assert.equal(pickBodyCell(cells, { x: 100, y: 100 }), undefined);
});
