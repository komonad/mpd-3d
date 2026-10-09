import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeMxw } from '../scripts/mxw.mjs';

test('MXW compressed pistons preserve order, orientation and recursive inventories', () => {
  const bytes = Buffer.from([1, 1, 4, 0, 2, 2, 0x95, 7, 4, 4, 2, 2, 0x59, 2, 2, 0, 0x55, 0, 0]);
  const l = decodeMxw(bytes, 'nested');
  assert.deepEqual(l.pistons.map(p => [p.baseKey, p.direction, p.expanded, p.order]), [[0, 3, false, 7], [1, 1, false, 2]]);
  assert.deepEqual(l.cells.map(c => c.container), [undefined, 0, 1]);
  assert.equal(l.cells[2].storesHeat, false); assert.deepEqual(l.goals, []);
});

test('MXW expanded pistons do not consume the following grid object', () => {
  const l = decodeMxw(Buffer.from([2, 1, 4, 3, 2, 6, 0x65, 4, 1, 1, 0, 0, 0]), 'expanded');
  assert.equal(l.pistons[0].direction, 2); assert.equal(l.pistons[0].expanded, true);
  assert.deepEqual(l.players, [{ x: 1, y: 0 }]); assert.deepEqual(l.goals, [{ x: 0, y: 0 }]);
});

test('MXW rejects incomplete inventories and unknown nested object types', () => {
  assert.throws(() => decodeMxw(Buffer.from([1, 1, 4, 0, 2, 2, 0x95, 0]), 'incomplete'), /truncated/);
  assert.throws(() => decodeMxw(Buffer.from([1, 1, 4, 0, 2, 2, 0x95, 0, 8]), 'unknown'), /unsupported tile 8/);
});

test('MXW capacity blocks decode a little-endian heat capacity inside pistons', () => {
  const l = decodeMxw(Buffer.from([1, 1, 4, 0, 2, 2, 0x55, 1, 5, 6, 0x55, 0x08, 0x01, 0, 0]), 'capacity');
  assert.equal(l.cells[1].heatCapacity, 264);
  assert.equal(l.cells[1].temperature, 1); assert.equal(l.cells[1].container, 0);
});
