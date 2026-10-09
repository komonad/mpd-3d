import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { cameraHalfHeight, demonStatus, followFocus, motionSettled } from '../src/view-state';
import { blockHeight, bodyGeometry } from '../src/body-geometry';

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
