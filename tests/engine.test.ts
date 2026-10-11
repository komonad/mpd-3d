import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bodies, cloneState, initialState, isSolved, move, transferHeat } from '../src/engine.ts';
import type { Cell, Dataset, Level } from '../src/types.ts';

const block = (x: number, y: number, temperature: -1 | 0 | 1 = 0, edges = 0x55, fixed = false, storesHeat = true): Cell => ({ key: y * 10 + x, x, y, temperature, edges, fixed, storesHeat });
const fixture = (cells: Cell[], players = [{ x: 1, y: 2 }], goals = [{ x: 4, y: 2 }]): Level => ({ id: 'test', width: 7, height: 6, label: 'test', category: 'main', cells, players, goals, tail: [0] });

test('a hot and cold connected pair becomes neutral simultaneously', () => {
  const l = fixture([block(3, 2, 1), block(4, 2, -1)]), s = initialState(l);
  transferHeat(l, s); assert.deepEqual(s.cells.map(c => c.temperature), [0, 0]);
});
test('finite heat balance uses each block capacity', () => {
  const l = fixture([{ ...block(3, 2, 1), heatCapacity: 8 }, { ...block(4, 2, -1), heatCapacity: 7 }]), s = initialState(l);
  transferHeat(l, s); assert.deepEqual(s.cells.map(c => c.temperature), [1, 1]);
  s.cells[0].temperature = 1; s.cells[1].temperature = -1; s.cells[1].heatCapacity = 8;
  transferHeat(l, s); assert.deepEqual(s.cells.map(c => c.temperature), [0, 0]);
});
test('the demon conducts without storing heat', () => {
  const l = fixture([block(2, 2, 1), block(4, 2, -1)], [{ x: 3, y: 2 }]), s = initialState(l);
  s.players[0].temperature = 1; transferHeat(l, s);
  assert.deepEqual(s.cells.map(c => c.temperature), [0, 0]); assert.equal(s.players[0].temperature, 0);
});

test('isolated demons settle to neutral when their component has no stored heat', () => {
  const l = fixture([], [{ x: 2, y: 2 }, { x: 3, y: 2 }]);
  for (const temperature of [-1, 0, 1, 2] as const) {
    const state = initialState(l); state.players[0].temperature = temperature;
    transferHeat(l, state);
    assert.deepEqual(state.players.map(p => p.temperature), [0, 0]);
  }
});

test('a retentive demon loses retention when its component contacts neutral material', () => {
  const l = fixture([block(4, 2)], [{ x: 2, y: 2 }, { x: 3, y: 2 }]), state = initialState(l);
  state.players[0].temperature = 2;
  transferHeat(l, state);
  assert.deepEqual(state.players.map(p => p.temperature), [0, 0]);
  assert.equal(state.cells[0].temperature, 0);
});

const enclosedDemons = (boundary: boolean): Level => {
  const shape = [[2, 2], [3, 2], [4, 2], [2, 3], [4, 3], [2, 4], [4, 4]];
  const directions = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  const cells = shape.map(([x, y]) => {
    let edges = 0xaa;
    directions.forEach(([dx, dy], dir) => {
      if (shape.some(([nx, ny]) => nx === x + dx && ny === y + dy)) edges &= ~(3 << (dir * 2));
    });
    return block(x, y, 0, edges);
  });
  const level: Level = { ...fixture(cells, [{ x: 3, y: 3 }, { x: 3, y: 4 }], []), width: 9 };
  if (boundary) {
    cells.push(block(7, 1, 0, 0xaa));
    level.pistons = [{ baseKey: 7, headKey: -10007, direction: 2, expanded: false, order: 0, model: 'boundary', head: block(7, 1, 0, 0xaa) }];
  }
  return level;
};

test('demons enclosed by one body vacate its destinations simultaneously', () => {
  for (const boundary of [false, true]) for (const reverse of [false, true]) {
    const level = enclosedDemons(boundary), state = initialState(level);
    if (reverse) state.players.reverse();
    const next = move(level, state, 2)!;
    assert.ok(next);
    assert.deepEqual(next.players.map(p => [p.x, p.y]).sort(), [[4, 3], [4, 4]]);
    assert.deepEqual(next.cells.slice(0, 7).map(c => [c.x, c.y]), state.cells.slice(0, 7).map(c => [c.x + 1, c.y]));
    assert.equal(next.moves, 1); assert.equal(next.pushes, 1);
  }
});

test('a translating body mechanically displaces an enclosed inactive demon', () => {
  for (const boundary of [false, true]) for (const asleep of [false, true]) {
    const level = enclosedDemons(boundary), state = initialState(level);
    if (asleep) state.players[1].awake = false;
    else state.players[1].temperature = 1;
    const next = move(level, state, 2)!;
    assert.ok(next);
    assert.deepEqual(next.players.map(p => [p.x, p.y]), [[4, 3], [4, 4]]);
    assert.deepEqual(state.players.map(p => [p.x, p.y]), [[3, 3], [3, 4]]);
  }
});

test('an active demon cannot walk directly into an inactive demon', () => {
  for (const boundary of [false, true]) for (const asleep of [false, true]) {
    const level = enclosedDemons(boundary);
    level.cells = boundary ? [block(7, 1, 0, 0xaa)] : [];
    if (boundary) level.pistons![0].baseKey = 0;
    level.players = [{ x: 3, y: 3 }, { x: 4, y: 3 }];
    const state = initialState(level);
    if (asleep) state.players[1].awake = false;
    else state.players[1].temperature = 1;
    const before = cloneState(state);
    assert.equal(move(level, state, 2), null);
    assert.deepEqual(state, before);
  }
});
test('either insulated face prevents heat conduction', () => {
  const l = fixture([block(2, 2, 1, 0x65), block(3, 2, -1)]), s = initialState(l);
  transferHeat(l, s); assert.deepEqual(s.cells.map(c => c.temperature), [1, -1]);
});
test('an excess of hot cells freezes the demon at the end of the turn', () => {
  const l = fixture([block(2, 2, 1), block(3, 2, 1), block(4, 2, -1)], [{ x: 1, y: 2 }]), s = initialState(l);
  transferHeat(l, s); assert.ok(s.cells.every(c => c.temperature === 1)); assert.equal(s.frozen, true);
  assert.equal(move(l, s, 1), null);
});
test('connected cells with absent internal edges move as one rigid body', () => {
  const l = fixture([block(2, 2, 0, 0x45), block(3, 2, 0, 0x54)]), s = initialState(l);
  assert.equal(bodies(s.cells).length, 1);
  const next = move(l, s, 2)!;
  assert.deepEqual(next.cells.map(c => c.x), [3, 4]); assert.equal(next.players[0].x, 2);
  assert.deepEqual(s.cells.map(c => c.x), [2, 3]);
});

test('unpaired absent edges facing the board become adhesive while internal welds remain connected', () => {
  const l = fixture([block(2, 2, 0, 0x41), block(3, 2, 0, 0x50), block(4, 3)], [{ x: 1, y: 2 }], []), state = initialState(l);
  assert.equal(state.cells[0].edges >> 2 & 3, 3); assert.equal(state.cells[1].edges >> 2 & 3, 3);
  assert.equal(state.cells[0].edges >> 4 & 3, 0); assert.equal(state.cells[1].edges & 3, 0);
  const pushed = move(l, state, 2)!; assert.ok(bodies(pushed.cells).some(group => group.length === 3));
  assert.equal(move(l, pushed, 2)!.cells[2].x, 5);
  assert.equal(l.cells[0].edges, 0x41);
});
test('one fixed cell anchors the entire connected body', () => {
  const l = fixture([block(2, 2, 0, 0x45), block(3, 2, 0, 0x54, true)]), s = initialState(l);
  assert.equal(move(l, s, 2), null);
});
test('blocked pushes cannot partially mutate any body', () => {
  const l = fixture([block(2, 2), block(3, 2), block(4, 2, 0, 0x55, true)]), s = initialState(l), before = cloneState(s);
  assert.equal(move(l, s, 2), null); assert.deepEqual(s, before);
});
test('a demon on a goal does not solve it; a transparent block cannot solve it', () => {
  const l = fixture([block(4, 2, 0, 0x55, false, false)], [{ x: 1, y: 2 }]), s = initialState(l);
  assert.equal(isSolved(l, s), false);
  s.cells[0].storesHeat = true; assert.equal(isSolved(l, s), true);
  s.players[0].temperature = 1; assert.equal(isSolved(l, s), false);
});
test('uninsulated boundary couples to the outside reservoir', () => {
  const l = fixture([block(0, 2, 1)]), s = initialState(l, new Set(), -1);
  transferHeat(l, s); assert.equal(s.cells[0].temperature, -1);
});
test('fixed exterior walls keep the outside temperature regardless of finite heat capacity', () => {
  for (const outside of [-1, 0, 1] as const) {
    const l = fixture([block(0, 2, 1, 0x56, true), ...[1, 2, 3, 4, 5].map(x => block(x, 2, outside === 1 ? -1 : 1))], [{ x: 1, y: 3 }]);
    const s = initialState(l, new Set(), outside);
    assert.equal(s.cells[0].temperature, outside); transferHeat(l, s);
    assert.ok(s.cells.every(c => c.temperature === outside)); assert.equal(s.players[0].temperature, outside);
  }
});
test('insulation isolates finite adhesive loads from the exterior reservoir', () => {
  const l = fixture([block(0, 2, 1, 0x26, true), block(1, 2, 1, 0x57)], [{ x: 1, y: 4 }]), s = initialState(l);
  transferHeat(l, s); assert.deepEqual(s.cells.map(c => c.temperature), [0, 1]);
});
test('fixed interior bodies have finite heat capacity', () => {
  const l = fixture([block(3, 2, 0, 0x55, true), block(4, 2, 1)], [{ x: 1, y: 4 }]), s = initialState(l);
  transferHeat(l, s); assert.deepEqual(s.cells.map(c => c.temperature), [1, 1]);
});
test('solved portals load their transformed properties', () => {
  const c = { ...block(3, 2, 1, 0xaa, true), portal: { target: 'child', shortcut: false, before: block(3, 2, 1, 0xaa, true), after: block(3, 2, -1) } };
  const s = initialState(fixture([c]), new Set(['child'])); assert.equal(s.cells[0].temperature, -1); assert.equal(s.cells[0].fixed, false);
});

const dataset = fs.existsSync('public/levels.local.json') ? JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) as Dataset : null;
test('local import contains the complete first-world catalogue', { skip: !dataset }, () => {
  const first = dataset!.levels.filter(l => !l.worldId || l.worldId === dataset!.world);
  assert.equal(first.filter(l => l.category === 'main').length, 20);
  assert.equal(first.filter(l => l.category === 'extra').length, 7);
  assert.ok(first.every(l => l.players.length === 1));
  assert.equal(dataset!.levels.find(l => l.label === 'w1?')!.notes!.length, 15);
  assert.ok(dataset!.levels.find(l => l.label === 'w1?')!.notes!.every(n => !n.text.startsWith('w1/')));
});
test('original 1-01 solves with movement, reports pushes, and remains immutable', { skip: !dataset }, () => {
  const l = dataset!.levels.find(l => l.label === '1-01')!, original = initialState(l);
  let s = cloneState(original);
  // The route pushes the cube west before approaching the vertical corridor from below.
  const path: (0 | 1 | 2 | 3)[] = [1, 2, 2, 2, 2, 2, 3, 0, 0, 1, 0, 3, 3, 3];
  for (const dir of path) { const n = move(l, s, dir); if (n) s = n; }
  assert.equal(s.solved, true); assert.ok(s.pushes > 0); assert.equal(original.moves, 0);
});
