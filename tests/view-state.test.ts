import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, MeshBasicMaterial, OrthographicCamera, Raycaster, Vector3 } from 'three';
import { cameraHalfHeight, demonStatus, followFocus, motionSettled, orthographicDepth, spawnPoints } from '../src/view-state';
import { blockHeight, bodyGeometry, exteriorHalfExtent } from '../src/body-geometry';
import { initialState, move } from '../src/engine';
import { createSession, enterPortal, recordState, resetSession } from '../src/session';
import type { Dataset, Level } from '../src/types';

test('spawn clues keep all level entry coordinates after motion, self-entry and reset', () => {
  const properties = { fixed: false, storesHeat: true, temperature: 0 as const, edges: 0x55 };
  const level: Level = { id: 'room', label: '1-1', category: 'main', width: 8, height: 6, players: [{ x: 1, y: 2 }, { x: 5, y: 2 }], goals: [], tail: [],
    cells: [{ x: 2, y: 3, ...properties, portal: { target: 'room', shortcut: true, before: properties, after: properties } }] };
  const data: Dataset = { version: 2, world: level.id, levels: [level], hints: {} }, session = createSession(level);
  const points = spawnPoints(level), moved = move(level, initialState(level), 2)!;
  recordState(session, moved, level);
  assert.deepEqual(moved.players.map(p => [p.x, p.y]), [[2, 2], [6, 2]]);
  const entered = enterPortal(data, session)!;
  assert.equal(entered.current.levelId, level.id);
  assert.deepEqual(spawnPoints(level), [{ x: 1, y: 2 }, { x: 5, y: 2 }]);
  assert.deepEqual(spawnPoints(level), points);
  assert.ok(resetSession(entered).current.players.length > level.players.length);
  points[0].x = 7;
  assert.equal(level.players[0].x, 1);
});

test('floor spawn clues coalesce shared coordinates and stay inside the board', () => {
  assert.deepEqual(spawnPoints({ width: 8, height: 6, players: [{ x: 1, y: 2 }, { x: 1, y: 2, container: 4 }, { x: 5, y: 4 }, { x: -1, y: 2 }, { x: 8, y: 2 }] }), [{ x: 1, y: 2 }, { x: 5, y: 4 }]);
});

test('follow focus tracks all demons on the ground plane regardless of pose height', () => {
  const first = followFocus([new Vector3(-3, 0.05, 2), new Vector3(5, 0.3, -4)]);
  const second = followFocus([new Vector3(-3, 1.8, 2), new Vector3(5, -1, -4)]);
  assert.deepEqual(first.toArray(), [1, 0.615, -1]); assert.deepEqual(second, first);
  assert.equal(followFocus([]).y, first.y);
});
test('large world maps retain a bounded local view while small rooms fit normally', () => {
  const tilt = 32 * Math.PI / 180, yaw = -9 * Math.PI / 180;
  assert.equal(cameraHalfHeight(51, 20, 1.4, tilt, yaw), cameraHalfHeight(500, 300, 1.4, tilt, yaw));
  assert.ok(cameraHalfHeight(11, 9, 1.4, tilt, yaw) < cameraHalfHeight(51, 20, 1.4, tilt, yaw));
  assert.ok(cameraHalfHeight(11, 9, 0.6, tilt, yaw) > cameraHalfHeight(11, 9, 1.4, tilt, yaw));
});
test('orthographic depth contains the exterior at low angles without changing projected scale', () => {
  const clip = orthographicDepth(51, 35, exteriorHalfExtent), camera = new OrthographicCamera(-8, 8, 6, -6, clip.near, clip.far);
  for (const tilt of [0.02, Math.PI * 0.44]) for (const yaw of [0, Math.PI / 4, Math.PI]) {
    const target = new Vector3(25, 0.615, 17), direction = new Vector3(Math.sin(tilt) * Math.sin(yaw), Math.cos(tilt), Math.sin(tilt) * Math.cos(yaw));
    camera.position.copy(target).addScaledVector(direction, clip.distance); camera.lookAt(target); camera.updateMatrixWorld();
    for (const x of [-exteriorHalfExtent - 26, exteriorHalfExtent]) for (const z of [-exteriorHalfExtent - 18, exteriorHalfExtent]) {
      const projected = new Vector3(x, 1.015, z).project(camera); assert.ok(projected.z > -1 && projected.z < 1);
    }
    const point = new Vector3(1, 1, 1), projected = point.clone().project(camera);
    camera.position.copy(target).addScaledVector(direction, 25); camera.lookAt(target); camera.updateMatrixWorld();
    const close = point.project(camera); assert.ok(Math.abs(close.x - projected.x) < 1e-10 && Math.abs(close.y - projected.y) < 1e-10);
  }
});
test('completion waits for both motion time and every moving object to settle', () => {
  assert.equal(motionSettled(109, [0, 0]), false);
  assert.equal(motionSettled(110, [0, 0]), true);
  assert.equal(motionSettled(300, [0, 0.002]), false);
  assert.equal(motionSettled(300, [0.0005, 0.0007]), true);
});
test('thinking follows sleeping demons while inactivity and heat cycles keep distinct statuses', () => {
  assert.equal(demonStatus(1, 1, 'idle', false, false, false), '待机');
  assert.equal(demonStatus(1, 1, 'idle', false, true, false), '思考');
  assert.equal(demonStatus(1, 1, 'idle', false, false, true), '热量循环');
  assert.equal(demonStatus(0, 1, 'idle', false, true, false), '思考');
  assert.equal(demonStatus(1, 2, 'idle', false, true, false), '思考 · 1/2 可行动');
});
test('the exterior and boundary share one continuous top and rounded interior contour', () => {
  const walls = Array.from({ length: 11 * 9 }, (_, key) => ({ x: key % 11, y: Math.floor(key / 11), key, fixed: true, storesHeat: true, temperature: 0 as const, edges: 0 })).filter(c => c.x === 0 || c.y === 0 || c.x === 10 || c.y === 8);
  const geometry = bodyGeometry(walls, blockHeight, { width: 11, height: 9 }), material = new MeshBasicMaterial();
  geometry.translate(-5, 0, -4); geometry.computeBoundingBox();
  const mesh = new Mesh(geometry, material); mesh.updateMatrixWorld();
  const ray = new Raycaster(new Vector3(0, 10, 0), new Vector3(0, -1, 0));
  assert.equal(ray.intersectObject(mesh).length, 0);
  for (const [x, z] of [[4.7, 0], [5, 0], [5.05, 0], [5.45, 0], [5.5, 0], [6, 0], [1000, 0], [-1000, 1000], [0, -1000]]) {
    ray.set(new Vector3(x, 10, z), new Vector3(0, -1, 0));
    const hit = ray.intersectObject(mesh)[0]; assert.ok(hit); assert.ok(Math.abs(hit.point.y - geometry.boundingBox!.max.y) < 0.00001);
  }
  geometry.dispose(); material.dispose();
});
