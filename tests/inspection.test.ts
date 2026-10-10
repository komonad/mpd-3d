import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectCell } from '../src/inspection';
import type { Cell, Piston, State } from '../src/types';

const block = (key: number, container?: number): Cell => ({ key, x: 3, y: 3, fixed: false, storesHeat: true, temperature: 0, edges: 0x55, container });
const piston = (baseKey: number, order: number): Piston => ({ baseKey, headKey: -10000 - baseKey, order, model: 'boundary', expanded: false, direction: 2, head: block(-1) });
const state = (cells: Cell[], pistons: Piston[] = []): State => ({ levelId: 'inspection', cells, pistons, players: [], outside: 0, moves: 0, pushes: 0, solved: false, frozen: false });

test('inspection distinguishes compressed empty cavities from expanded pistons', () => {
  const s = state([block(0)], [piston(0, 4)]);
  assert.deepEqual(inspectCell(s, 0, new Map())?.piston, { state: '压缩', direction: '向右', expanded: false });
  assert.deepEqual(inspectCell(s, 0, new Map())?.contents, []);
  s.pistons![0].expanded = true;
  assert.equal(inspectCell(s, 0, new Map())?.piston?.state, '展开');
});

test('inspection lists nested pistons, transparent portals, and contained demons with their current temperature', () => {
  const glass = { ...block(2, 1), storesHeat: false, temperature: -1 as const, edges: 0x57,
    portal: { target: 'child', shortcut: false, before: block(2), after: block(2) } };
  const s = state([block(0), { ...block(1, 0), temperature: 2 }, glass], [piston(0, 5), piston(1, 2)]);
  s.players = [{ x: 3, y: 3, temperature: 1, container: 1 }];
  const outer = inspectCell(s, 0, new Map([['child', '9-01']]))!;
  assert.deepEqual(outer.contents.map(i => [i.title, i.kind, i.depth, i.temperature]), [['活塞 #2', 'piston', 0, 2], ['关卡 9-01', 'glass', 1, -1], ['麦妖', 'demon', 1, 1]]);
  assert.match(outer.contents[1].details, /透明 · 不储热.*粘边/); assert.match(outer.contents[2].details, /假死/);
  assert.equal(inspectCell(s, 2, new Map())?.title, '活塞 #2');
  s.cells = s.cells.filter(c => c.key !== 2); s.players = []; s.pistons![1].expanded = true;
  const inner = inspectCell(s, 1, new Map())!; assert.deepEqual(inner.contents, []); assert.equal(inner.piston?.state, '展开');
});

test('stale hover keys disappear when their objects are removed', () => {
  assert.equal(inspectCell(state([]), 3, new Map()), undefined);
});

test('shortcut hover status follows discovery and distinguishes canonical entrances', () => {
  const cell = block(0); cell.portal = { target: 'room', shortcut: true, before: block(0), after: block(0) };
  const s = state([cell]), labels = new Map([['room', '3-12']]);
  assert.match(inspectCell(s, 0, labels)?.details ?? '', /未解锁快捷入口/);
  assert.match(inspectCell(s, 0, labels, new Set(['room']))?.details ?? '', /已解锁快捷入口/);
  cell.portal.shortcut = false;
  assert.match(inspectCell(s, 0, labels)?.details ?? '', /普通入口/);
});
