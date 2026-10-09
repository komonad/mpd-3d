import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { cameraHalfHeight, demonStatus, followFocus, motionSettled } from '../src/view-state';
import { exteriorPlainGeometry } from '../src/terrain-geometry';

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
  assert.equal(motionSettled(179, [0, 0]), false);
  assert.equal(motionSettled(300, [0, 0.002]), false);
  assert.equal(motionSettled(300, [0.0005, 0.0007]), true);
});
test('thinking follows hint context while inactivity and heat cycles keep distinct statuses', () => {
  assert.equal(demonStatus(1, 1, 'idle', false, false, false), '待机');
  assert.equal(demonStatus(1, 1, 'idle', false, true, false), '思考');
  assert.equal(demonStatus(1, 1, 'idle', false, false, true), '热量循环');
  assert.equal(demonStatus(0, 1, 'idle', false, true, false), '假死');
  assert.equal(demonStatus(1, 2, 'idle', false, true, false), '思考 · 1/2 可行动');
});
test('exterior plain extends past the scene while leaving the playable interior open', () => {
  const geometry = exteriorPlainGeometry(11, 9), material = new MeshBasicMaterial();
  const mesh = new Mesh(geometry, material); mesh.updateMatrixWorld();
  const ray = new Raycaster(new Vector3(0, 10, 0), new Vector3(0, -1, 0));
  assert.equal(ray.intersectObject(mesh).length, 0);
  for (const [x, z] of [[5.45, 0], [1000, 0], [-1000, 1000], [0, -1000]]) {
    ray.set(new Vector3(x, 10, z), new Vector3(0, -1, 0));
    const hit = ray.intersectObject(mesh)[0]; assert.ok(hit); assert.ok(Math.abs(hit.point.y - 1.016) < 0.00001);
  }
  geometry.dispose(); material.dispose();
});
