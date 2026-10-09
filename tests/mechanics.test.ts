import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodies, cloneState, initialState, move, transferHeat } from '../src/engine';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { bodyContours, bodyLayerGeometry, bodyGeometry } from '../src/body-geometry';
import { laboratory } from '../src/laboratory';
import { settleTurn } from '../src/pistons';
import type { Cell, Level, Temperature } from '../src/types';

const cell = (key: number, x: number, y: number, temperature: Temperature = 0, edges = 0x55, storesHeat = true, fixed = false): Cell => ({ key, x, y, temperature, edges, storesHeat, fixed });
const level = (cells: Cell[]): Level => ({ id: 'mechanics', label: 'test', width: 9, height: 7, category: 'lab', cells, players: [{ x: 1, y: 4 }], goals: [], tail: [0] });

test('a transparent bridge conducts but contributes no heat', () => {
  const l = level([cell(0, 3, 2, 1), cell(1, 4, 2, 1, 0x55, false), cell(2, 5, 2, -1)]), s = initialState(l);
  transferHeat(l, s); assert.deepEqual(s.cells.map(c => c.temperature), [0, 0, 0]);
});
test('sticky faces join solid and transparent cells into a rigid body', () => {
  const l = laboratory[2]; let s = initialState(l);
  s = move(l, s, 2)!;
  const connected = bodies(s.cells).find(b => b.some(c => c.key === 0))!;
  assert.equal(connected.length, 2); assert.deepEqual(connected.map(c => [c.x, c.y]), [[4, 4], [5, 4]]);
  for (const d of [1, 2, 3] as const) s = move(l, s, d)!;
  assert.deepEqual(s.cells.slice(0, 2).map(c => [c.x, c.y]), [[4, 3], [5, 3]]);
  assert.deepEqual(s.players[0], { x: 4, y: 4, temperature: 0 });
});
test('a straight welded body has a single rectangular contour', () => {
  const contours = bodyContours([cell(0, 1, 1), cell(1, 1, 2), cell(2, 1, 3)]);
  assert.equal(contours.length, 1); assert.equal(contours[0].length, 4);
});
test('the laboratory perimeter is a single rigid wall with one inner contour', () => {
  const s = initialState(laboratory[0]), walls = s.cells.filter(c => c.fixed), groups = bodies(walls);
  assert.equal(groups.length, 1); assert.equal(bodyContours(groups[0]).length, 2);
});
test('rounded adhesive layers join without overlapping top strips and cover the full side', () => {
  const layer = bodyLayerGeometry([cell(0, 0, 0, 0, 0xff)], 0.96); layer.computeBoundingBox();
  assert.ok(Math.abs(layer.boundingBox!.max.y - layer.boundingBox!.min.y - 0.98) < 0.001);
  const positions = layer.getAttribute('position'), normals = layer.getAttribute('normal'); let area = 0;
  for (let i = 0; i < positions.count; i += 3) {
    assert.ok(Number.isFinite(normals.getX(i)) && Number.isFinite(normals.getY(i)));
    if (normals.getY(i) < 0.9) continue;
    const a = [positions.getX(i), positions.getZ(i)], b = [positions.getX(i + 1), positions.getZ(i + 1)], c = [positions.getX(i + 2), positions.getZ(i + 2)];
    area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  }
  assert.ok(area > 0.334 && area < 0.34, `Unexpected layer area ${area}`); layer.dispose();
});
test('body contours preserve concave corners and enclosed holes', () => {
  assert.equal(bodyContours([cell(0, 0, 0), cell(1, 1, 0), cell(2, 0, 1)])[0].length, 6);
  const ring = Array.from({ length: 9 }, (_, i) => cell(i, i % 3, Math.floor(i / 3))).filter(c => c.key !== 4);
  assert.equal(bodyContours(ring).length, 2);
  const geometry = bodyGeometry(ring, 0.96); geometry.computeBoundingBox();
  assert.ok(geometry.getAttribute('position').count > 0); assert.ok(Number.isFinite(geometry.boundingBox!.max.x));
  const material = new MeshBasicMaterial(), mesh = new Mesh(geometry, material); mesh.updateMatrixWorld();
  const ray = new Raycaster(new Vector3(1, 3, 1), new Vector3(0, -1, 0)); assert.equal(ray.intersectObject(mesh).length, 0);
  ray.set(new Vector3(0, 3, 0), new Vector3(0, -1, 0)); assert.ok(ray.intersectObject(mesh).length > 0);
  geometry.dispose(); material.dispose();
});
test('cube surfaces preserve height and mixed bodies omit shared walls', () => {
  const g = bodyGeometry([cell(0, 0, 0)], 0.96); g.computeBoundingBox();
  const bounds = g.boundingBox!; assert.ok(Math.abs(bounds.max.y - bounds.min.y - 0.96) < 0.001);
  assert.ok(Math.abs(bounds.max.x - bounds.min.x - 0.96) < 0.001); g.dispose();
  const mixed = bodyGeometry([cell(0, 0, 0), cell(1, 1, 0, 0, 0x55, false)], 0.96);
  assert.equal(mixed.getAttribute('position').count, 60); assert.equal(mixed.groups.length, 10); mixed.dispose();
});
test('hot anchored pistons expand and can push a rigid body', () => {
  const l = level([cell(0, 3, 3, 1, 0xaa, true, true), cell(1, 4, 3), cell(2, 5, 3)]);
  l.pistons = [{ baseKey: 0, headKey: 1000, direction: 2, expanded: false, order: 0, head: { fixed: false, temperature: 0, edges: 0x55, storesHeat: false } }];
  const s = initialState(l); settleTurn(l, s);
  assert.equal(s.pistons![0].expanded, true); assert.equal(s.cells[0].temperature, 0);
  assert.deepEqual(s.cells.slice(1, 3).map(c => c.x), [5, 6]); assert.equal(s.cells.find(c => c.key === 1000)!.x, 4);
});
test('an obstructed piston keeps its heat and does not partially push', () => {
  const l = level([cell(0, 3, 3, 1, 0xaa, true, true), cell(1, 4, 3, 0, 0xaa, true, true)]);
  l.pistons = [{ baseKey: 0, headKey: 1000, direction: 2, expanded: false, order: 0, head: { fixed: false, temperature: 0, edges: 0x55, storesHeat: false } }];
  const s = initialState(l); settleTurn(l, s);
  assert.equal(s.pistons![0].expanded, false); assert.equal(s.cells[0].temperature, 1); assert.equal(s.cells.length, 2);
});
test('compression can cause transient fake death and recover in the same turn', () => {
  const l = laboratory[4], original = initialState(l), next = move(l, original, 0)!;
  assert.ok(next.turnFrames!.some(f => f.players[0].temperature === 1));
  assert.equal(next.players[0].temperature, 0); assert.equal(next.frozen, false); assert.equal(next.phase, 'ready');
  assert.equal(next.pistons![0].expanded, true); assert.equal(next.players[0].x, 6); assert.equal(next.moves, 1);
  assert.equal(original.moves, 0); assert.equal(cloneState(next).turnFrames, undefined);
});
test('cold anchored pistons retract and preserve head properties', () => {
  const l = structuredClone(laboratory[4]); l.cells[0].temperature = -1; l.cells[0].edges = 0xaa;
  const s = initialState(l); settleTurn(l, s);
  assert.equal(s.pistons![0].expanded, false); assert.equal(s.cells.some(c => c.key === 1), false);
  assert.equal(s.cells[0].temperature, 0); assert.equal(s.pistons![0].head.storesHeat, false);
});
test('an expanded piston head cannot detach sideways or compress a fixed attachment', () => {
  const l = structuredClone(laboratory[4]); l.players = [{ x: 5, y: 3 }];
  assert.equal(move(l, initialState(l), 1), null);
  l.players = [{ x: 6, y: 4 }]; l.cells[1].edges = 0xd5;
  l.cells.push(cell(100, 5, 3, 0, 0x55, true, true));
  const original = initialState(l), before = cloneState(original);
  assert.equal(move(l, original, 0), null); assert.deepEqual(original, before);
});
