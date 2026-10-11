import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initialState, move, transferHeat, availablePortals, bodies, isSolved, exteriorKeys } from '../src/engine';
import { actuateBoundary, moveBoundaryDemons } from '../src/boundary-pistons';
import { settleTurn } from '../src/pistons';
import { resetState } from '../src/session';
import { address, depth } from '../src/topology';
import { bodyLayerGeometry } from '../src/body-geometry';
import type { Level, Piston, Temperature } from '../src/types';

const block = (x: number, y: number, temperature: Temperature = 0, container?: number): Level['cells'][number] => ({ x, y, temperature, storesHeat: true, edges: 0x55, fixed: false, ...(container === undefined ? {} : { container }) });
const piston = (baseKey: number, expanded = false, order = 0): Piston => ({ baseKey, headKey: -10000 - baseKey, direction: 2, expanded, order, model: 'boundary', head: { fixed: false, storesHeat: true, temperature: 0, edges: 0xaa } });
const room = (cells: Level['cells'], pistons: Piston[], players: Level['players'] = [{ x: 1, y: 1 }]): Level => ({ id: 'piston', label: 'piston', category: 'lab', width: 9, height: 7, cells, pistons, players, goals: [], tail: [0] });
const housing = (x = 4, temperature: Temperature = 0, fixed = false) => ({ ...block(x, 3, temperature), edges: 0xaa, fixed });

test('an absent external load edge joins the back of a housing in either expansion state', () => {
  for (const expanded of [false, true]) {
    const l = room([housing(4, 2), { ...block(3, 3, 2), storesHeat: false, edges: 0x8a }], [piston(0, expanded)], [{ x: 3, y: 4 }]);
    const state = initialState(l);
    assert.equal(bodies(state.cells, state.pistons).length, 1);
    assert.deepEqual(moveBoundaryDemons(l, state, 3), { moved: true, pushed: true });
    assert.deepEqual(state.cells.map(c => [c.x, c.y]), [[4, 2], [3, 2]]);
    assert.deepEqual(state.players.map(p => [p.x, p.y]), [[3, 3]]);
    assert.equal(state.pistons![0].expanded, expanded);
  }
});

test('an absent solid side face carries its neighboring housing along the piston axis', () => {
  const l = room([housing(4, 2), { ...block(5, 3, 2), edges: 0x54 }],
    [{ ...piston(0, true), direction: 3 }], [{ x: 5, y: 4 }]), state = initialState(l);
  assert.equal(bodies(state.cells, state.pistons).length, 1);
  assert.deepEqual(moveBoundaryDemons(l, state, 3), { moved: true, pushed: true });
  assert.deepEqual(state.cells.map(c => [c.x, c.y]), [[4, 2], [5, 2]]);
  assert.equal(state.pistons![0].expanded, true);
});

test('supported housings absorb attached lateral loads before hot expansion displaces the demon', () => {
  for (const direction of [0, 1, 2, 3] as const) for (const glass of [false, true]) {
    const vectors = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }], d = vectors[direction];
    const sideways = ((direction + 1) % 4) as typeof direction, t = vectors[sideways];
    const load = { ...block(4 + d.x, 3 + d.y), storesHeat: !glass, edges: 0x55 & ~(3 << (((direction + 2) % 4) * 2)) };
    const l = room([housing(4, 1), load, { ...block(4 - d.x, 3 - d.y), fixed: true, edges: 0xaa },
      { ...block(4 + d.x + t.x, 3 + d.y + t.y), fixed: true, edges: 0xaa }],
      [{ ...piston(0, true), direction }], [{ x: 4 + d.x - t.x, y: 3 + d.y - t.y }]);
    const state = initialState(l);
    assert.deepEqual(moveBoundaryDemons(l, state, sideways), { moved: true, pushed: true });
    assert.deepEqual(state.cells.slice(0, 2).map(c => [c.x, c.y, c.container]), [[4, 3, undefined], [4, 3, 0]]);
    assert.deepEqual(state.players.map(p => [p.x, p.y]), [[4 + d.x, 3 + d.y]]);
    assert.equal(state.pistons![0].expanded, false);
    assert.equal(actuateBoundary(l, state, state.pistons![0]), true);
    assert.deepEqual(state.cells.slice(0, 2).map(c => [c.x, c.y, c.container]), [[4, 3, undefined], [4 + d.x, 3 + d.y, undefined]]);
    assert.deepEqual(state.players.map(p => [p.x, p.y]), [[4 + 2 * d.x, 3 + 2 * d.y]]);
    assert.equal(state.pistons![0].expanded, true);
  }
});

test('lateral absorption requires rear support and an attached opening face', () => {
  for (const supported of [false, true]) for (const attached of [false, true]) {
    if (supported && attached) continue;
    const cells = [housing(4, 1), { ...block(5, 3), edges: attached ? 0x54 : 0x55 }, { ...block(5, 4), fixed: true, edges: 0xaa }];
    if (supported) cells.push({ ...block(3, 3), fixed: true, edges: 0xaa });
    const l = room(cells, [piston(0, true)], [{ x: 5, y: 2 }]), state = initialState(l);
    assert.deepEqual(moveBoundaryDemons(l, state, 1), { moved: false, pushed: false });
    assert.deepEqual(state.cells.slice(0, 2).map(c => [c.x, c.y, c.container]), [[4, 3, undefined], [5, 3, undefined]]);
    assert.equal(state.pistons![0].expanded, true);
  }
});

test('an adhesive opening face cannot absorb its load through a perpendicular push', () => {
  for (const direction of [0, 1, 2, 3] as const) {
    const vectors = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }], d = vectors[direction];
    const sideways = ((direction + 1) % 4) as typeof direction, t = vectors[sideways];
    const load = { ...block(4 + d.x, 3 + d.y), edges: 0x55 | (3 << (((direction + 2) % 4) * 2)) };
    const l = room([housing(4, 1), load, { ...block(4 - d.x, 3 - d.y), fixed: true, edges: 0xaa },
      { ...block(4 + d.x + t.x, 3 + d.y + t.y), fixed: true, edges: 0xaa }],
      [{ ...piston(0, true), direction }], [{ x: 4 + d.x - t.x, y: 3 + d.y - t.y }]);
    const state = initialState(l), before = structuredClone(state);
    assert.deepEqual(moveBoundaryDemons(l, state, sideways), { moved: false, pushed: false });
    assert.deepEqual(state, before);
  }
});

test('an absent transparent face retains its connection to an insulating fixed wall', () => {
  for (const direction of [0, 1, 2, 3] as const) {
    const d = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }][direction];
    const glass = { ...block(4, 3), storesHeat: false, edges: 0xaa & ~(3 << (direction * 2)) };
    const l = room([glass, { ...block(4 + d.x, 3 + d.y), fixed: true, edges: 0xaa }], []);
    const state = initialState(l); state.cells[0].edges = glass.edges;
    assert.equal(bodies(state.cells).length, 1);
    const sideways = ((direction + 1) % 4) as typeof direction;
    const t = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }][sideways];
    state.players = [{ x: 4 - t.x, y: 3 - t.y, temperature: 0 }];
    assert.deepEqual(moveBoundaryDemons(l, state, sideways), { moved: false, pushed: false });
  }
});

test('glass attached to an insulating exterior face retains its finite thermal component', () => {
  for (const direction of [0, 1, 2, 3] as const) {
    const d = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }][direction];
    const [x, y] = [[0, 3], [4, 6], [8, 3], [4, 0]][direction];
    const load = { ...block(x - d.x, y - d.y, 2), storesHeat: false, edges: 0x55 & ~(3 << (direction * 2)) };
    const wall = { ...block(x, y), fixed: true, edges: 2 << (((direction + 2) % 4) * 2) };
    const t = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }][(direction + 1) % 4];
    const reservoir = block(load.x + t.x, load.y + t.y, 2);
    const l = room([load, wall, reservoir], []), state = initialState(l); state.cells[0].edges = load.edges;
    assert.ok(bodies(state.cells).some(g => g.some(c => c.key === 0) && g.some(c => c.key === 1)));
    assert.deepEqual([...exteriorKeys(l, state)], [1]);
    transferHeat(l, state);
    assert.equal(state.cells[0].temperature, 2); assert.equal(state.cells[1].temperature, 0); assert.equal(state.cells[2].temperature, 2);
  }
});

test('passive compression exchanges cold for neutral and every other temperature for hot', () => {
  for (const direction of [0, 1, 2, 3] as const) for (const temperature of [-1, 0, 1, 2] as const) for (const glass of [false, true]) {
    const d = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }][direction];
    const l = room([{ ...housing(4, temperature, true), storesHeat: !glass }], [{ ...piston(0, true), direction }], [{ x: 4 + d.x, y: 3 + d.y }]);
    const state = initialState(l);
    assert.equal(moveBoundaryDemons(l, state, ((direction + 2) % 4) as typeof direction).moved, true);
    assert.equal(state.pistons![0].expanded, false);
    assert.equal(state.players[0].container, 0);
    assert.equal(state.cells[0].temperature, temperature === -1 ? 0 : 1);
  }
});

test('passive extension exchanges hot for neutral and every other temperature for cold', () => {
  for (const direction of [0, 1, 2, 3] as const) for (const temperature of [-1, 0, 1, 2] as const) for (const glass of [false, true]) {
    const d = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }][direction], back = (direction + 2) % 4;
    const load = { ...block(4 + d.x, 3 + d.y), edges: 0x55 | (3 << (back * 2)) };
    const l = room([{ ...housing(4, temperature, true), storesHeat: !glass }, load], [{ ...piston(0), direction }], [{ x: 4, y: 3, container: 0 }]);
    const state = initialState(l);
    assert.equal(moveBoundaryDemons(l, state, direction).moved, true);
    assert.equal(state.pistons![0].expanded, true);
    assert.equal(state.players[0].container, undefined);
    assert.equal(state.cells[0].temperature, temperature === 1 ? 0 : -1);
  }
});

test('an absent external solid face carries its transparent neighbor after translation', () => {
  for (const direction of [0, 1, 2, 3] as const) {
    const d = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }][direction], transverse = ((direction + 1) % 4) as typeof direction;
    const opaque = { ...block(4, 3), edges: 0x55 & ~(3 << (direction * 2)) };
    const l = room([opaque, { ...block(4 + d.x, 3 + d.y), storesHeat: false }], []);
    const state = initialState(l); state.cells[0].edges = opaque.edges;
    assert.equal(bodies(state.cells, state.pistons).length, 1);
    const t = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }][transverse];
    state.players = [{ x: 4 - t.x, y: 3 - t.y, temperature: 0 }];
    assert.deepEqual(moveBoundaryDemons(l, state, transverse), { moved: true, pushed: true });
    assert.deepEqual(state.cells.map(c => [c.x, c.y]), [[4 + t.x, 3 + t.y], [4 + d.x + t.x, 3 + d.y + t.y]]);
    assert.equal(state.cells[0].edges, opaque.edges);
  }
});

test('released inventories expose adhesive edges while preserving insulation', () => {
  const l = room([housing(4, 2, true), { ...block(4, 3, 0, 0), storesHeat: false, edges: 0xa8 }, { ...block(5, 2, 2), edges: 0xaa }], [piston(0)], [{ x: 6, y: 4 }]);
  const before = initialState(l), state = structuredClone(before);
  state.pistons![0].expanded = true;
  state.cells[1].x = 6; delete state.cells[1].container;
  settleTurn(l, state, before);
  assert.equal(state.cells[1].edges, 0xab);
  const contact = move(l, state, 3)!;
  assert.ok(bodies(contact.cells, contact.pistons).some(body => body.some(c => c.key === 1) && body.some(c => c.key === 2)));
  assert.deepEqual(contact.cells.slice(1).map(c => c.temperature), [0, 2]);
  const next = move(l, contact, 3)!;
  assert.deepEqual(next.cells.slice(1).map(c => [c.x, c.y]), [[6, 1], [5, 1]]);
  assert.deepEqual(next.cells.slice(1).map(c => c.temperature), [0, 2]);
});

test('nested hot pistons expand within one turn in either actuator order', () => {
  for (const innerFirst of [false, true]) {
    const l = room([housing(4, 1, true), { ...housing(4, 1), container: 0 }, block(4, 3, 0, 1)], [piston(0, false, innerFirst ? 2 : 0), piston(1, false, innerFirst ? 0 : 2)]), s = initialState(l);
    settleTurn(l, s);
    assert.deepEqual(s.pistons!.map(p => p.expanded), [true, true]); assert.equal(s.phase, 'ready');
    assert.deepEqual(s.cells.map(c => [c.x, c.container]), [[4, undefined], [5, undefined], [6, undefined]]);
    assert.ok(s.turnFrames!.some(f => f.pistons[0].expanded !== f.pistons[1].expanded));
    for (const frame of s.turnFrames!) for (const c of frame.cells) if (c.container !== undefined) {
      const parent = frame.cells.find(p => p.key === c.container)!;
      assert.deepEqual([c.x, c.y], [parent.x, parent.y]);
    }
  }
});

test('nested expansion cannot eject a load through a containing side wall', () => {
  const outer = { ...piston(0), direction: 3 as const }, inner = piston(1);
  const l = room([housing(), { ...housing(4, 1), container: 0 }, block(4, 3, 0, 1)], [outer, inner]), s = initialState(l), before = structuredClone(s);
  assert.equal(actuateBoundary(l, s, s.pistons![1]), false); assert.deepEqual(s, before);
});

test('hot compressed housings eject their inventory through the moving face', () => {
  const l = room([housing(4, 1, true), block(4, 3, 0, 0)], [piston(0)]), s = initialState(l);
  settleTurn(l, s);
  assert.equal(s.pistons![0].expanded, true);
  assert.equal(s.cells[0].temperature, 0); assert.equal(s.cells[1].x, 5); assert.equal(s.cells[1].container, undefined);
  assert.deepEqual(s.turnFrames!.map(f => f.phase), ['motion', 'heat', 'motion', 'heat']);
});

test('obstructed extension remains atomic and does not consume its heat', () => {
  const l = room([housing(4, 1, true), block(4, 3, 0, 0), { ...block(5, 3), fixed: true }], [piston(0)]), s = initialState(l), before = structuredClone(s);
  assert.equal(actuateBoundary(l, s, s.pistons![0]), false); assert.deepEqual(s, before);
});

test('a movable housing retreats when the inventory cannot move', () => {
  const l = room([housing(4, 1), block(4, 3, 0, 0), { ...block(5, 3), fixed: true }], [piston(0)]), s = initialState(l);
  assert.equal(actuateBoundary(l, s, s.pistons![0]), true);
  assert.equal(s.cells[0].x, 3); assert.equal(s.cells[1].x, 4); assert.equal(s.cells[1].container, undefined);
  assert.equal(s.pistons![0].expanded, true);
});

test('a compressed housing retreats from supported inventory before rejecting a push', () => {
  for (const direction of [0, 1, 2, 3] as const) {
    const d = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }][direction], reverse = ((direction + 2) % 4) as 0 | 1 | 2 | 3;
    const side = { x: d.y, y: -d.x }, sideDirection = (direction + 1) % 4, branchDirection = (direction + 3) % 4;
    const faces = (...open: number[]) => open.reduce((edges, face) => edges & ~(3 << (face * 2)), 0xaa);
    const l = room([
      { ...housing(), edges: faces(sideDirection) },
      { ...block(4, 3, 0, 0), storesHeat: false, edges: faces(direction) },
      { ...block(4 + d.x, 3 + d.y), storesHeat: false, edges: faces(reverse, branchDirection) },
      { ...block(4 + d.x - side.x, 3 + d.y - side.y), storesHeat: false, edges: faces(sideDirection) },
      { ...block(4 - side.x, 3 - side.y), fixed: true },
      { ...block(4 + side.x, 3 + side.y), edges: faces(branchDirection) },
    ], [{ ...piston(0), direction }], [{ x: 4 + side.x + d.x, y: 3 + side.y + d.y }]);
    const s = initialState(l);
    assert.deepEqual(moveBoundaryDemons(l, s, reverse), { moved: true, pushed: true });
    assert.deepEqual([s.cells[0].x, s.cells[0].y, s.cells[0].temperature], [4 - d.x, 3 - d.y, -1]);
    assert.equal(s.pistons![0].expanded, true);
    assert.deepEqual([s.cells[1].x, s.cells[1].y, s.cells[1].container], [4, 3, undefined]);
    assert.deepEqual([s.cells[3].x, s.cells[3].y], [4 + d.x - side.x, 3 + d.y - side.y]);
  }
});

test('blocks enter stationary compressed pistons while the demon stays outside', () => {
  const l = room([housing(4, 0, true), block(5, 3)], [piston(0)], [{ x: 6, y: 3 }]), s = move(l, initialState(l), 0)!;
  assert.equal(s.cells[0].x, 4); assert.equal(s.cells[1].x, 4); assert.equal(s.cells[1].container, 0);
  assert.equal(s.players[0].x, 5); assert.equal(s.players[0].container, undefined);
});

test('a stored opaque block fills a goal while an empty transparent housing does not', () => {
  const l = room([{ ...housing(), storesHeat: false }, block(4, 3, 0, 0)], [piston(0)]), s = initialState(l);
  l.goals = [{ x: 4, y: 3 }];
  assert.equal(isSolved(l, s), true); s.cells.pop(); assert.equal(isSolved(l, s), false);
});

test('demons enter and leave through the open moving face and cannot push from inside', () => {
  const l = room([housing(4, 0, true)], [piston(0)], [{ x: 5, y: 3 }]), s = move(l, initialState(l), 0)!;
  assert.equal(s.players[0].container, 0); assert.equal(s.players[0].x, 4);
  assert.equal(move(l, s, 0), null); assert.equal(move(l, s, 1), null); assert.equal(move(l, s, 3), null);
  const out = move(l, s, 2)!; assert.equal(out.players[0].x, 5); assert.equal(out.players[0].container, undefined);
});

test('opening-side movement pushes a free housing before entering or compression in every orientation', () => {
  for (const direction of [0, 1, 2, 3] as const) for (const glass of [false, true]) for (const expanded of [false, true]) {
    const d = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }][direction];
    const l = room([{ ...housing(), storesHeat: !glass }], [{ ...piston(0, expanded), direction }], [{ x: 4 + d.x, y: 3 + d.y }]);
    const before = initialState(l), s = move(l, before, ((direction + 2) % 4) as 0 | 1 | 2 | 3)!;
    assert.ok(s); assert.deepEqual([s.cells[0].x, s.cells[0].y], [4 - d.x, 3 - d.y]);
    assert.deepEqual([s.players[0].x, s.players[0].y, s.players[0].container], [4, 3, undefined]);
    assert.equal(s.pushes, 1); assert.equal(s.pistons![0].expanded, expanded); assert.equal(s.cells[0].temperature, 0);
    assert.deepEqual(before, initialState(l));
  }
});

test('an advancing expanded housing compresses its attached moving face around a supported load', () => {
  for (const direction of [0, 1, 2, 3] as const) for (const face of [0, 3]) {
    const d = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }][direction], reverse = (direction + 2) % 4;
    const load = { ...block(4 + d.x, 3 + d.y), edges: 0x55 & ~(3 << (reverse * 2)) | face << (reverse * 2) };
    const l = room([housing(), load, { ...block(4 + 2 * d.x, 3 + 2 * d.y), fixed: true }], [{ ...piston(0, true), direction }], [{ x: 4 - d.x, y: 3 - d.y }]);
    const s = initialState(l);
    assert.deepEqual(moveBoundaryDemons(l, s, direction), { moved: true, pushed: true });
    assert.deepEqual([s.cells[0].x, s.cells[0].y, s.cells[1].container], [load.x, load.y, 0]);
    assert.equal(s.pistons![0].expanded, false); assert.equal(s.cells[0].temperature, 1);
  }
});

test('a blocked housing admits the demon without translating the block behind it', () => {
  const l = room([housing(), block(3, 3), { ...block(2, 3), fixed: true }], [piston(0)], [{ x: 5, y: 3 }]), s = move(l, initialState(l), 0)!;
  assert.ok(s); assert.deepEqual(s.cells.map(c => c.x), [4, 3, 2]);
  assert.deepEqual([s.players[0].x, s.players[0].container], [4, 0]); assert.equal(s.pushes, 0);
});

test('opening-side pushes carry nested housings and their contained demon before entry', () => {
  const l = room([housing(), { ...housing(), container: 0 }], [piston(0), piston(1)], [{ x: 5, y: 3 }, { x: 4, y: 3, container: 1 }]), s = initialState(l);
  assert.deepEqual(moveBoundaryDemons(l, s, 0), { moved: true, pushed: true });
  assert.deepEqual(s.cells.map(c => [c.x, c.container]), [[3, undefined], [3, 0]]);
  assert.deepEqual(s.players.map(p => [p.x, p.container]), [[4, undefined], [3, 1]]);
});

test('an aligned nested empty cavity is accessible only after its containing housing is blocked', () => {
  for (const aligned of [false, true]) {
    const l = room([housing(4, 0, true), { ...housing(), container: 0 }], [piston(0), { ...piston(1), direction: aligned ? 2 : 3 }], [{ x: 5, y: 3 }]);
    const s = initialState(l), before = structuredClone(s), result = moveBoundaryDemons(l, s, 0);
    assert.equal(result.moved, aligned); assert.equal(result.pushed, false);
    if (aligned) { assert.deepEqual(s.cells, before.cells); assert.deepEqual([s.players[0].x, s.players[0].container], [4, 1]); }
    else assert.deepEqual(s, before);
  }
});

test('pushing a housing into another stationary cavity takes priority over demon entry', () => {
  const l = room([housing(5), housing(), { ...block(3, 3), fixed: true }], [piston(0), piston(1)], [{ x: 6, y: 3 }]), s = initialState(l);
  assert.deepEqual(moveBoundaryDemons(l, s, 0), { moved: true, pushed: true });
  assert.deepEqual(s.cells.map(c => [c.x, c.container]), [[4, 1], [4, undefined], [3, undefined]]);
  assert.deepEqual([s.players[0].x, s.players[0].container], [5, undefined]);
});

test('an occupied housing can advance through passive compression when cavity entry is blocked', () => {
  const l = room([housing(), block(4, 3, 0, 0), housing(3), { ...block(2, 3), fixed: true }], [piston(0), piston(2, true)], [{ x: 5, y: 3 }]);
  const s = initialState(l);
  assert.deepEqual(moveBoundaryDemons(l, s, 0), { moved: true, pushed: true });
  assert.deepEqual(s.cells.map(c => [c.x, c.container]), [[3, 2], [3, 0], [3, undefined], [2, undefined]]);
  assert.equal(s.pistons![1].expanded, false); assert.equal(s.cells[2].temperature, 1);
  assert.deepEqual([s.players[0].x, s.players[0].container], [4, undefined]);
});

test('failed welded-body pushes discard partial destinations before cavity entry', () => {
  const l = room([{ ...housing(), edges: 0x2a }, { ...block(4, 2), edges: 0x51 }, { ...block(3, 2), fixed: true }], [piston(0)], [{ x: 5, y: 3 }]);
  const s = initialState(l), cells = structuredClone(s.cells);
  assert.deepEqual(moveBoundaryDemons(l, s, 0), { moved: true, pushed: false });
  assert.deepEqual(s.cells, cells); assert.deepEqual([s.players[0].x, s.players[0].container], [4, 0]);
});

test('an obstructed occupied cavity rejects entry without changing either inventory or housing', () => {
  const l = room([housing(), block(4, 3, 0, 0), { ...block(3, 3), fixed: true }], [piston(0)], [{ x: 5, y: 3 }]);
  const s = initialState(l), before = structuredClone(s);
  assert.deepEqual(moveBoundaryDemons(l, s, 0), { moved: false, pushed: false }); assert.deepEqual(s, before);
});

test('supported expanded housings compress passively and gain heat', () => {
  const l = room([housing(), { ...block(3, 3), fixed: true }], [piston(0, true)], [{ x: 5, y: 3 }]), s = initialState(l);
  assert.deepEqual(moveBoundaryDemons(l, s, 0), { moved: true, pushed: true });
  assert.equal(s.cells[0].x, 4); assert.equal(s.pistons![0].expanded, false);
  assert.equal(s.cells[0].temperature, 1); assert.equal(s.players[0].container, 0);
});

test('transparent passive compression does not create stored heat', () => {
  const l = room([{ ...housing(), storesHeat: false }, { ...block(3, 3), fixed: true }], [piston(0, true)], [{ x: 5, y: 3 }]), s = move(l, initialState(l), 0)!;
  assert.equal(s.pistons![0].expanded, false); assert.equal(s.cells[0].temperature, 0); assert.equal(s.players[0].container, 0);
});

test('passive compression selects the piston closest to support independently of actuator number', () => {
  for (const orders of [[8, 1], [1, 8]]) {
    const l = room([{ ...housing(3), edges: 0x55 }, { ...housing(4), edges: 0x54 }, { ...block(5, 3), edges: 0x54 }, { ...block(2, 3), fixed: true }], [piston(0, true, orders[0]), piston(1, true, orders[1])], [{ x: 6, y: 3 }]);
    const state = initialState(l);
    assert.equal(moveBoundaryDemons(l, state, 0).moved, true);
    assert.equal(state.pistons![0].expanded, false);
    assert.equal(state.cells[0].x, 3);
  }
});

test('passive compression can rebound in the same turn before completion is checked', () => {
  const l = room([housing(), { ...block(3, 3), fixed: true }], [piston(0, true)], [{ x: 5, y: 3 }]), s = move(l, initialState(l), 0)!;
  assert.equal(s.pistons![0].expanded, true); assert.equal(s.players[0].x, 5); assert.equal(s.players[0].container, undefined);
  assert.equal(s.moves, 1); assert.equal(s.pushes, 1); assert.equal(s.turnFrames!.length, 4);
});

test('cold compression pulls a sticky load into the stationary housing', () => {
  const l = room([housing(4, -1, true), { ...block(5, 3), edges: 0x57 }], [piston(0, true)]), s = initialState(l);
  assert.equal(actuateBoundary(l, s, s.pistons![0]), true);
  assert.equal(s.cells[1].x, 4); assert.equal(s.cells[1].container, 0); assert.equal(s.cells[0].temperature, 0);
});

test('active cold compression stores its load before translating a free housing', () => {
  for (const direction of [0, 1, 2, 3] as const) {
    const d = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }][direction], reverse = (direction + 2) % 4;
    const l = room([housing(4, -1), { ...block(4 + d.x, 3 + d.y), storesHeat: false, edges: 0xaa & ~(3 << (reverse * 2)) }], [{ ...piston(0, true), direction }]);
    const s = initialState(l);
    assert.equal(actuateBoundary(l, s, s.pistons![0]), true);
    assert.deepEqual([s.cells[0].x, s.cells[0].y, s.cells[0].temperature], [4, 3, 0]);
    assert.deepEqual([s.cells[1].x, s.cells[1].y, s.cells[1].container], [4, 3, 0]);
    assert.equal(s.pistons![0].expanded, false);
  }
});

test('adhesion to the moving face permits extension while adhesion to side walls locks it', () => {
  const l = room([housing(4, 1, true), { ...block(4, 3, 0, 0), edges: 0x57 }], [piston(0)]), s = initialState(l);
  assert.equal(actuateBoundary(l, s, s.pistons![0]), true); assert.equal(s.cells[1].container, undefined);
  const side = initialState(l); side.cells[1].edges = 0x5d;
  assert.equal(actuateBoundary(l, side, side.pistons![0]), false); assert.equal(side.cells[1].container, 0);
});

test('pulling an adhesive moving face extends it and cools the housing', () => {
  const l = room([housing(4, 0, true), { ...block(5, 3), edges: 0x57 }], [piston(0)], [{ x: 5, y: 4 }]), s = initialState(l);
  const up = move(l, s, 3)!;
  assert.equal(up.players[0].y, 3); assert.equal(up.cells[1].y, 2);
  const direct = initialState(room([housing(4, 0, true), { ...block(5, 3), edges: 0x57 }], [piston(0)], [{ x: 4, y: 3, container: 0 }]));
  assert.equal(moveBoundaryDemons(l, direct, 2).moved, true); assert.equal(direct.pistons![0].expanded, true); assert.equal(direct.cells[0].temperature, -1);
});

test('inventory is insulated from side walls but can conduct through the moving boundary', () => {
  const l = room([housing(4, 1), block(4, 3, -1, 0)], [piston(0)]), s = initialState(l);
  transferHeat(l, s); assert.deepEqual(s.cells.map(c => c.temperature), [1, -1]);
  s.cells[0].edges = 0x95; s.pistons![0].direction = 3; s.cells[1].edges = 0x15;
  transferHeat(l, s); assert.deepEqual(s.cells.map(c => c.temperature), [1, -1]);
  s.cells[0].edges = 0x55; transferHeat(l, s); assert.deepEqual(s.cells.map(c => c.temperature), [0, 0]);
});

test('inventories facing each other conduct through both open cavities', () => {
  const l = room([housing(4), block(4, 3, 1, 0), housing(5), block(5, 3, -1, 2)], [piston(0), { ...piston(2), direction: 0 }]), s = initialState(l);
  transferHeat(l, s); assert.deepEqual(s.cells.map(c => c.temperature), [0, 0, 0, 0]);
});

test('a portal in a compressed housing is accessible only through its opening', () => {
  const target = { ...block(4, 3, 0, 0), portal: { target: 'next', shortcut: false, before: housing(), after: housing() } };
  const l = room([housing(), target], [piston(0)], [{ x: 5, y: 3 }, { x: 4, y: 2 }]), s = initialState(l);
  assert.equal(availablePortals(s).length, 1);
  s.players = [s.players[1]]; assert.equal(availablePortals(s).length, 0);
});

test('moving housings carry every nested inventory and demon exactly once', () => {
  const l = room([housing(), { ...housing(4), container: 0 }, block(4, 3, 0, 1)], [piston(0), piston(1)], [{ x: 4, y: 4 }, { x: 4, y: 3, container: 1 }]), s = initialState(l);
  assert.equal(moveBoundaryDemons(l, s, 3).moved, true);
  assert.ok(s.cells.every(c => c.y === 2)); assert.equal(s.players[1].y, 2);
  assert.equal(depth(s.cells[2], s.cells), 2); assert.equal(new Set(s.cells.map(address)).size, 3);
});

test('a moving compressed housing stores a supported stationary block through its opening', () => {
  const l = room([housing(), block(5, 3), { ...block(6, 3), fixed: true }], [piston(0)], [{ x: 3, y: 3 }]), s = initialState(l);
  assert.equal(moveBoundaryDemons(l, s, 2).moved, true);
  assert.equal(s.cells[0].x, 5); assert.equal(s.cells[1].x, 5); assert.equal(s.cells[1].container, 0);
});

test('advancing housings store supported loads and compress in every opening direction', () => {
  for (const direction of [0, 1, 2, 3] as const) for (const expanded of [false, true]) for (const glass of [false, true]) {
    const d = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }][direction];
    const l = room([{ ...housing(), storesHeat: !glass }, block(4 + d.x, 3 + d.y), { ...block(4 + 2 * d.x, 3 + 2 * d.y), fixed: true }], [{ ...piston(0, expanded), direction }], [{ x: 4 - d.x, y: 3 - d.y }]);
    const s = initialState(l);
    assert.deepEqual(moveBoundaryDemons(l, s, direction), { moved: true, pushed: true });
    assert.deepEqual(s.cells.map(c => [c.x, c.y, c.container]), [[4 + d.x, 3 + d.y, undefined], [4 + d.x, 3 + d.y, 0], [4 + 2 * d.x, 3 + 2 * d.y, undefined]]);
    assert.equal(s.pistons![0].expanded, false); assert.equal(s.cells[0].temperature, expanded ? 1 : 0);
    assert.deepEqual([s.players[0].x, s.players[0].y, s.players[0].container], [4, 3, undefined]);
  }
});

test('upward passive storage retains its load when the following heat balance cools the housing', () => {
  const l = room([{ ...housing(), edges: 0x55 }, block(4, 2, -1), { ...block(4, 1), fixed: true }], [{ ...piston(0, true), direction: 3, head: { ...block(0, 0) } }], [{ x: 4, y: 4 }]);
  const s = move(l, initialState(l), 3)!; assert.ok(s);
  assert.deepEqual([s.cells[0].y, s.cells[1].y, s.cells[1].container], [2, 2, 0]);
  assert.equal(s.pistons![0].expanded, false); assert.equal(s.cells[0].temperature, 0); assert.equal(s.cells[1].temperature, 0);
  assert.deepEqual(s.turnFrames!.map(f => f.phase), ['motion', 'heat']);
  assert.deepEqual([s.turnFrames![0].cells[0].temperature, s.turnFrames![0].pistons[0].expanded], [1, false]);
});

test('empty housings cannot contain fixed walls or blocks welded to fixed support', () => {
  for (const direction of [0, 1, 2, 3] as const) for (const welded of [false, true]) for (const expanded of [false, true]) {
    const d = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }][direction];
    const wall = { ...block(4 + d.x, 3 + d.y), fixed: !welded, edges: 0x55 & ~(3 << (direction * 2)) };
    const anchor = { ...block(4 + 2 * d.x, 3 + 2 * d.y), fixed: true, edges: 0x55 & ~(3 << (((direction + 2) % 4) * 2)) };
    const l = room([housing(), wall, anchor], [{ ...piston(0, expanded), direction }], [{ x: 4 - d.x, y: 3 - d.y }]);
    const state = initialState(l), before = structuredClone(state);
    assert.deepEqual(moveBoundaryDemons(l, state, direction), { moved: false, pushed: false });
    assert.deepEqual(state, before);
    assert.equal(move(l, before, direction), null);
  }
});

test('unsupported housings and loads translate together without changing nesting depth', () => {
  for (const direction of [0, 2] as const) {
    const l = room([housing(), block(5, 3)], [piston(0)], [{ x: direction === 2 ? 3 : 6, y: 3 }]), s = initialState(l);
    assert.equal(moveBoundaryDemons(l, s, direction).moved, true);
    const delta = direction === 2 ? 1 : -1;
    assert.deepEqual(s.cells.map(c => [c.x, c.container]), [[4 + delta, undefined], [5 + delta, undefined]]);
    assert.equal(s.pistons![0].expanded, false);
  }
});

test('an outside welded load moves the housing when it presses against an inner side wall', () => {
  const l = room([housing(), { ...block(4, 3, 0, 0), edges: 0x05 }, { ...block(5, 3), edges: 0x54 }], [piston(0)], [{ x: 5, y: 4 }]);
  l.pistons![0].direction = 2;
  const s = initialState(l);
  assert.equal(moveBoundaryDemons(l, s, 3).moved, true);
  assert.ok(s.cells.every(c => c.y === 2)); assert.equal(s.cells[1].container, 0);
});

test('thermal actions use increasing piston numbers and include every intermediate frame', () => {
  const l = room([housing(3, 1, true), housing(6, 1, true)], [piston(0, false, 5), piston(1, false, 2)]), s = initialState(l);
  settleTurn(l, s);
  assert.deepEqual(s.turnFrames![2].pistons.map(p => p.expanded), [false, true]);
  assert.ok(s.pistons!.every(p => p.expanded)); assert.equal(s.turnFrames!.length, 6);
});

test('retained inner objects restore inside an initial compressed housing at their original depth', () => {
  const l = room([housing(3), block(3, 3, 0, 0), housing(6), block(6, 3, 2, 2)], [piston(0), piston(2)]), baseline = initialState(l), current = structuredClone(baseline);
  current.cells[2].x = 3; current.cells[3].x = 3;
  const s = resetState(current, baseline, []);
  assert.equal(s.cells.some(c => c.key === 1), false); assert.equal(s.cells.find(c => c.key === 3)!.container, 0);
  assert.equal(depth(s.cells.find(c => c.key === 3)!, s.cells), 1);
});

test('a retained compressed housing contains restored deeper objects while suppressing equal-depth objects', () => {
  const l = room([housing(3), block(3, 3, 0, 0), housing(6, 2)], [piston(0), piston(2)]), baseline = initialState(l), current = structuredClone(baseline);
  current.cells[2].x = 3;
  const s = resetState(current, baseline, []);
  assert.equal(s.cells.some(c => c.key === 0), false); assert.equal(s.cells.find(c => c.key === 1)!.container, 2);
  assert.equal(s.pistons!.some(p => p.baseKey === 0), false);
});

test('reset can reconstruct multiple nested depths without dangling containers', () => {
  const l = room([housing(3), { ...housing(3), container: 0 }, block(3, 3, 0, 1), housing(6, 2)], [piston(0), piston(1), piston(3)]), baseline = initialState(l), current = structuredClone(baseline);
  current.cells[3].x = 3;
  const s = resetState(current, baseline, []);
  assert.equal(s.cells.find(c => c.key === 1)!.container, 3); assert.equal(s.cells.find(c => c.key === 2)!.container, 1);
  assert.equal(depth(s.cells.find(c => c.key === 2)!, s.cells), 2);
});

test('retained piston inventory stays at its current coordinate when its housing resets elsewhere', () => {
  const l = room([housing(3), block(3, 3, 2, 0)], [piston(0)]), baseline = initialState(l), current = structuredClone(baseline);
  current.cells.forEach(c => { c.x = 4; });
  const s = resetState(current, baseline, []);
  assert.deepEqual(s.cells.map(c => [c.key, c.x, c.container]), [[0, 3, undefined], [1, 4, undefined]]);
  assert.equal(s.cells[1].temperature, 2);
});

test('retained deeper inventory suppresses an initial solid block at its coordinate', () => {
  const l = room([housing(3), block(3, 3, 2, 0), block(4, 3)], [piston(0)]), baseline = initialState(l), current = structuredClone(baseline);
  current.cells[0].x = current.cells[1].x = 4; current.cells[2].x = 6;
  const s = resetState(current, baseline, []);
  assert.equal(s.cells.some(c => c.key === 2), false);
  assert.deepEqual([s.cells[1].x, s.cells[1].container], [4, undefined]);
});

test('reset collapses absent container depths beneath a restored compressed housing', () => {
  const l = room([housing(3), block(3, 3, 0, 0), housing(6), { ...housing(6), container: 2 }, block(6, 3, 2, 3)], [piston(0), piston(2), piston(3)]), baseline = initialState(l), current = structuredClone(baseline);
  current.cells.filter(c => c.key >= 2).forEach(c => { c.x = 3; });
  const s = resetState(current, baseline, []), retained = s.cells.find(c => c.key === 4)!;
  assert.equal(s.cells.some(c => c.key === 1), false);
  assert.equal(retained.container, 0); assert.equal(depth(retained, s.cells), 1);
  assert.equal(s.pistons!.find(p => p.baseKey === 0)!.expanded, false);
});

test('retained pistons preserve their current expansion state through reset', () => {
  const l = room([housing(3, 2)], [piston(0)]), baseline = initialState(l), current = structuredClone(baseline);
  current.cells[0].x = 5; current.pistons![0].expanded = true;
  const s = resetState(current, baseline, []);
  assert.equal(s.cells[0].x, 5); assert.equal(s.pistons![0].expanded, true);
});

test('the imported catalogue preserves piston inventories and order', { skip: !fs.existsSync('public/levels.local.json') }, () => {
  const data = JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) as { levels: Level[]; worlds: { id: string; index: number | string }[] };
  const worlds = new Set(data.worlds.filter(w => typeof w.index === 'number' && w.index >= 1 && w.index <= 9).map(w => w.id));
  assert.equal(data.levels.filter(l => l.category === 'main' && worlds.has(l.worldId!)).length, 190);
  for (const l of data.levels) {
    const s = initialState(l), keys = new Set(s.cells.map(c => c.key));
    assert.equal(new Set(s.cells.map(address)).size, s.cells.length, l.label);
    assert.ok(s.cells.every(c => c.container === undefined || keys.has(c.container)), l.label);
    assert.ok((s.pistons ?? []).every(p => p.model === 'boundary' && keys.has(p.baseKey)), l.label);
  }
});

test('original piston rooms preserve occupancy and container positions after their opening moves', { skip: !fs.existsSync('public/levels.local.json') }, () => {
  const data = JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) as { levels: Level[] };
  for (const l of data.levels.filter(l => l.category === 'main' && l.pistons?.length)) for (const direction of [0, 1, 2, 3] as const) {
    const state = move(l, initialState(l), direction); if (!state) continue;
    assert.equal(new Set(state.cells.map(address)).size, state.cells.length, `${l.label}:${direction}`);
    for (const object of [...state.cells, ...state.players]) if (object.container !== undefined) {
      const parent = state.cells.find(c => c.key === object.container);
      assert.ok(parent, `${l.label}:${direction}`);
      assert.deepEqual([object.x, object.y], [parent.x, parent.y], `${l.label}:${direction}`);
      assert.equal(state.pistons!.find(p => p.baseKey === parent.key)!.expanded, false, `${l.label}:${direction}`);
    }
  }
});

test('original piston puzzles settle and reach their goals through movement and thermal actions', { skip: !fs.existsSync('public/levels.local.json') }, () => {
  const data = JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) as { levels: Level[] };
  for (const [label, route] of [['4-01', '12220000122223233'], ['4-02', '232210030101222222321012'], ['8-01', '012222332101222033210122']]) {
    const l = data.levels.find(l => l.label === label)!; let s = initialState(l);
    for (const step of route) { const next = move(l, s, Number(step) as 0 | 1 | 2 | 3); assert.ok(next, `${label}:${step}`); s = next; }
    assert.equal(s.solved, true, label); assert.equal(s.phase, 'ready'); assert.ok(s.players.some(p => p.temperature !== 1));
    assert.equal(new Set(s.cells.map(address)).size, s.cells.length);
  }
});

test('large original world contours generate their side layers without an argument limit', { skip: !fs.existsSync('public/levels.local.json') }, () => {
  const data = JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) as { levels: Level[] };
  let largest = 0;
  for (const l of data.levels.filter(l => l.category === 'world' && ['w8', 'w9'].includes(l.label))) {
    const s = initialState(l);
    for (const group of bodies(s.cells)) {
      const geometry = bodyLayerGeometry(group, 0.96, group.some(c => c.fixed) ? l : undefined);
      const positions = geometry.getAttribute('position'); largest = Math.max(largest, positions.count);
      assert.ok(Array.from(positions.array).every(Number.isFinite)); geometry.dispose();
    }
  }
  assert.ok(largest * 3 > 100000);
});
