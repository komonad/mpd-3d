import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { edge, initialState, move, transferHeat } from '../src/engine';
import { createSession, destroyCells, enterHint, enterPortal, exitLevel, portalCandidates, recordState, resetSession, unlockedWorlds } from '../src/session';
import { fixedAnchorPoints } from '../src/body-geometry';
import { laboratory } from '../src/laboratory';
import type { BlockProperties, Cell, Dataset, Level, Temperature } from '../src/types';

const properties = (temperature: Temperature = 0, edges = 0x55, storesHeat = true): BlockProperties => ({ temperature, edges, storesHeat, fixed: false });
const cell = (x: number, y: number, temperature: Temperature = 0, edges = 0x55): Cell => ({ ...properties(temperature, edges), key: y * 8 + x, x, y });
const level = (id: string, cells: Level['cells'] = [], players = [{ x: 1, y: 2 }], parentId?: string): Level => ({ id, label: id, category: 'main', width: 8, height: 6, cells, players, goals: [], tail: [0], parentId });
const portal = (x: number, y: number, target: string, shortcut = false, temperature: Temperature = 0): Cell => ({ ...cell(x, y, temperature), portal: { target, shortcut, before: properties(temperature), after: properties() } });
const catalogue = (...levels: Level[]): Dataset => ({ version: 2, world: levels[0].id, levels, hints: {} });

test('enter and exit preserve their side and do not trigger heat balance', () => {
  const parent = level('parent', [portal(2, 2, 'child', false, -1)]), child = level('child', [cell(2, 2, 1)], undefined, parent.id), data = catalogue(parent, child);
  const original = createSession(parent), entered = enterPortal(data, original)!;
  assert.equal(entered.current.outside, -1); assert.equal(entered.current.players[0].temperature, 0);
  assert.equal(entered.current.cells[0].temperature, 1); assert.equal(original.current.players.length, 1);
  const exited = exitLevel(data, entered)!;
  assert.equal(exited.current.levelId, parent.id); assert.deepEqual(exited.current.players.map(p => [p.x, p.y]), [[1, 2]]);
  assert.equal(exited.current.outside, 0); assert.equal(exited.current.players[0].temperature, 0);
});

test('cached rooms retain their layout until an exit resets every entered room', () => {
  const a = level('a', [portal(2, 2, 'b')]), b = level('b', [portal(2, 2, 'c'), cell(5, 3)], undefined, 'a');
  const c = level('c', [portal(2, 2, 'b', true)], undefined, 'b'), data = catalogue(a, b, c);
  let s = enterPortal(data, createSession(a))!;
  s.current.cells[1].x = 6; recordState(s, s.current, b);
  s = enterPortal(data, s)!; s = enterPortal(data, s)!;
  assert.equal(s.current.levelId, 'b'); assert.equal(s.current.cells[1].x, 6);
  const reset = resetSession(s); assert.equal(reset.current.cells[1].x, 6);
  s = exitLevel(data, s)!;
  assert.equal(s.current.levelId, 'a'); assert.equal(s.states.c.cells[0].x, 2);
});

test('returning from a hint restores its exact source state and nested exits remain inside the hint', () => {
  const a = level('a', [cell(4, 2)]), hint = { ...level('hint', [portal(2, 2, 'nested')]), category: 'hint' as const }, nested = level('nested', [], undefined, 'hint'), data = catalogue(a, hint, nested);
  const original = createSession(a); original.current.cells[0].x = 5;
  let s = enterHint(data, original, 'hint')!; s = enterPortal(data, s)!;
  s = exitLevel(data, s)!; assert.equal(s.current.levelId, 'hint');
  s = exitLevel(data, s)!; assert.deepEqual(s.current, original.current);
});

test('shortcuts require discovery and reconstruct intermediate exits', () => {
  const a = level('a', [portal(2, 2, 'c', true), portal(5, 2, 'b')]);
  const b = level('b', [portal(3, 2, 'c')], undefined, 'a'), c = level('c', [], undefined, 'b'), data = catalogue(a, b, c);
  const locked = createSession(a); assert.equal(portalCandidates(data, locked).length, 0); assert.equal(enterPortal(data, locked), null);
  locked.visited.push('c'); const entered = enterPortal(data, locked)!;
  assert.equal(entered.entries.c.parentId, 'b'); assert.equal(entered.entries.b.parentId, 'a');
  const exited = exitLevel(data, entered)!;
  assert.equal(exited.current.levelId, 'b'); assert.deepEqual(exited.current.players.map(p => [p.x, p.y]), [[2, 2]]);
});

test('entry from multiple sides emits multiple demons while other demons remain in the parent', () => {
  const a = level('a', [portal(3, 2, 'b')], [{ x: 2, y: 2 }, { x: 3, y: 3 }, { x: 6, y: 4 }]), b = level('b', [], undefined, 'a'), data = catalogue(a, b);
  const entered = enterPortal(data, createSession(a))!;
  assert.equal(entered.states.a.players.length, 1); assert.deepEqual(entered.entries.b.directions.sort(), [2, 3]);
  const exited = exitLevel(data, entered)!;
  assert.deepEqual(exited.current.players.map(p => [p.x, p.y]).sort(), [[2, 2], [3, 3], [6, 4]]);
});

test('spawn collisions destroy blocks and expose adhesive broken welds', () => {
  const l = level('a', [cell(3, 2, 0, 0x45), cell(4, 2, 0, 0x54)]), s = initialState(l);
  destroyCells(s, new Set([1])); assert.equal(s.cells.length, 1); assert.equal(edge(s.cells[0], 2), 3);
  const parent = level('parent', [portal(2, 2, 'child')]), child = level('child', [cell(1, 2, 2)], undefined, 'parent');
  assert.equal(enterPortal(catalogue(parent, child), createSession(parent))!.current.cells.length, 0);
});

test('retentive objects keep their state across reset and temporarily suppress initial occupants', () => {
  const l = level('a', [cell(2, 2), cell(4, 2, 2)], [{ x: 1, y: 4 }]); let s = createSession(l);
  s.current.cells[1].x = 2;
  s = resetSession(s); assert.equal(s.current.cells.length, 1); assert.equal(s.current.cells[0].key, 1);
  s.current.cells[0].x = 5;
  s = resetSession(s); assert.deepEqual(s.current.cells.map(c => [c.key, c.x]), [[0, 2], [1, 5]]);
});

test('the fourth temperature only wins a neutral heat balance and transparent cells store none', () => {
  for (const [temperatures, expected] of [[[2, 0], 2], [[2, 1], 1], [[2, -1], -1], [[2, 1, -1], 2]] as [Temperature[], Temperature][]) {
    const l = level('a', temperatures.map((t, i) => cell(i + 2, 2, t)), [{ x: 1, y: 4 }]), s = initialState(l);
    transferHeat(l, s); assert.ok(s.cells.every(c => c.temperature === expected));
  }
  const l = level('a', [{ ...cell(2, 2, 2), storesHeat: false }, cell(3, 2)], [{ x: 1, y: 4 }]), s = initialState(l);
  transferHeat(l, s); assert.deepEqual(s.cells.map(c => c.temperature), [0, 0]);
});

test('a fourth-temperature outside reservoir does not override stored hot or cold heat', () => {
  for (const temperature of [0, 1, -1] as const) {
    const l = level('a', [cell(0, 2, temperature)]), s = initialState(l, new Set(), 2);
    transferHeat(l, s); assert.equal(s.cells[0].temperature, temperature === 0 ? 2 : temperature);
  }
});

test('multiple demons follow in one turn independently of array ordering', () => {
  for (const players of [[{ x: 2, y: 2 }, { x: 3, y: 2 }], [{ x: 3, y: 2 }, { x: 2, y: 2 }]]) {
    const l = level('a', [], players), s = move(l, initialState(l), 2)!;
    assert.deepEqual(s.players.map(p => p.x).sort(), [3, 4]); assert.equal(s.moves, 1);
  }
});

test('multiple demons push a shared welded body only once per turn', () => {
  const l = level('a', [cell(3, 2, 0, 0x51), cell(3, 3, 0, 0x15)], [{ x: 2, y: 2 }, { x: 2, y: 3 }]);
  const s = move(l, initialState(l), 2)!;
  assert.deepEqual(s.cells.map(c => c.x), [4, 4]); assert.deepEqual(s.players.map(p => p.x), [3, 3]); assert.equal(s.pushes, 1);
});

test('a frozen demon remains stationary while another demon can move and cool it', () => {
  const l = level('a', [cell(2, 3, -1)], [{ x: 2, y: 2 }, { x: 5, y: 2 }]), original = initialState(l);
  original.players[0].temperature = 1; const s = move(l, original, 1)!;
  assert.deepEqual(s.players.map(p => [p.x, p.y, p.temperature]), [[2, 2, -1], [5, 3, 0]]); assert.equal(s.frozen, false);
});

test('fixed walls mark every contour turn including all inner corners', () => {
  const walls = initialState(laboratory[0]).cells.filter(c => c.fixed), points = fixedAnchorPoints(walls);
  assert.equal(points.length, 8);
  assert.ok(points.some(p => Math.abs(p.x - 0.26) < 1e-6 && Math.abs(p.y - 0.26) < 1e-6));
  assert.ok(points.every(p => walls.some(c => Math.abs(p.x - c.x) < 0.5 && Math.abs(p.y - c.y) < 0.5)));
  assert.equal(fixedAnchorPoints([cell(1, 1)]).length, 0);
});

test('boundary terrain only marks interior turns across concave and multiple inner contours', () => {
  const room = laboratory[0], walls = initialState(room).cells.filter(c => c.fixed);
  const points = fixedAnchorPoints(walls, room);
  assert.equal(points.length, 4);
  assert.ok(points.every(p => p.x > 0 && p.y > 0 && p.x < room.width - 1 && p.y < room.height - 1));
  const concave = [...walls, { ...cell(1, 1), fixed: true }];
  assert.equal(fixedAnchorPoints(concave, room).length, 6);
  const split = [...walls, ...Array.from({ length: room.height - 2 }, (_, i) => ({ ...cell(5, i + 1), fixed: true }))];
  assert.equal(fixedAnchorPoints(split, room).length, 8);
  const open = [...Array.from({ length: room.width }, (_, x) => ({ ...cell(x, 0), fixed: true })), { ...cell(4, 1), fixed: true }];
  assert.equal(fixedAnchorPoints(open, room).length, 4);
  assert.equal(fixedAnchorPoints([{ ...cell(3, 3), fixed: true }]).length, 4);
});

test('world progression requires completion and never opens unsupported mechanics', () => {
  const data = catalogue(level('a', [], undefined), level('b'));
  data.worlds = [1, 2, 3].map(index => ({ id: String(index), index, title: String(index), description: '', supported: index < 3 }));
  data.levels[0].worldId = '1';
  assert.deepEqual(unlockedWorlds(data, []).map(w => w.index), [1]);
  assert.deepEqual(unlockedWorlds(data, ['a']).map(w => w.index), [1, 2]);
  assert.deepEqual(unlockedWorlds(data, ['1', '2']).map(w => w.index), [1, 2]);
});

test('the local catalogue resolves every canonical parent within supported worlds', { skip: !fs.existsSync('public/levels.local.json') }, () => {
  const data = JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) as Dataset, ids = new Set(data.levels.map(l => l.id));
  assert.equal(data.worlds!.filter(w => w.supported).length, 3);
  assert.equal(data.levels.length, 227);
  assert.ok(data.levels.every(l => !l.parentId || ids.has(l.parentId)));
});

test('original 2-01 reaches its goal after balancing the rigid pair with the hot cells', { skip: !fs.existsSync('public/levels.local.json') }, () => {
  const data = JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) as Dataset, l = data.levels.find(l => l.label === '2-01')!;
  let state = initialState(l);
  for (let i = 0; i < 5; i++) state = move(l, state, 2)!;
  assert.equal(state.solved, true); assert.equal(state.moves, 5); assert.equal(state.pushes, 4); assert.equal(state.players[0].temperature, 0);
});

test('original 3-01 uses re-entry to reposition the demon while preserving the puzzle layout', { skip: !fs.existsSync('public/levels.local.json') }, () => {
  const data = JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) as Dataset, l = data.levels.find(l => l.label === '3-01')!;
  let session = createSession(l, ['9a498c50', '6c1848b0']);
  const path = [2, 3, 2, 2, 3, 2, 1, 3, 2, 2, 1, 1, 1, 0, 3, 2, 3, 0, 0, 0, 0, 2, 2, 1, 1, 4, 0, 3, 3, 2, 1, 1];
  for (const direction of path) {
    if (direction === 4) {
      const cells = structuredClone(session.current.cells);
      assert.deepEqual(session.current.players.map(p => [p.x, p.y]), [[6, 4]]);
      session = enterPortal(data, session, l.id)!;
      assert.deepEqual(session.current.cells, cells); assert.deepEqual(session.current.players.map(p => [p.x, p.y]), [[2, 3]]);
    }
    else recordState(session, move(l, session.current, direction as 0 | 1 | 2 | 3)!, l);
  }
  assert.equal(session.current.solved, true);
  assert.equal(session.current.moves, 31); assert.equal(session.current.pushes, 10);
  assert.equal(session.current.players[0].temperature, -1);
});
