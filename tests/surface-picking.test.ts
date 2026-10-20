import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { bodyGeometry } from '../src/body-geometry';
import { batchSurfaceGroups } from '../src/surface-batching';
import { prepareSurfacePicking, surfaceRaycast } from '../src/surface-picking';
import type { Cell } from '../src/types';

test('spatial picking matches triangle picking after material regrouping and respects draw ranges', () => {
  const cells: Cell[] = Array.from({ length: 64 }, (_, key) => ({ key, x: key % 8, y: Math.floor(key / 8), edges: 0, fixed: false, temperature: key % 2 ? 1 : 0, storesHeat: true }));
  const geometry = bodyGeometry(cells, 0.96), material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(geometry, cells.map(() => material)); mesh.position.set(3, 0, -2); mesh.scale.setScalar(0.72); mesh.updateMatrixWorld();
  const ray = new Raycaster();
  for (const remap of [cells.map(cell => cell.key), cells.map(cell => cell.key % 2)]) {
    batchSurfaceGroups(geometry, remap); prepareSurfacePicking(geometry);
    for (const range of [[0, Infinity], [3, 300]]) {
      geometry.setDrawRange(range[0], range[1]);
      for (let x = 2; x < 9; x += 0.3) {
        ray.set(new Vector3(x, 3, 0), new Vector3(0, -1, 0));
        mesh.raycast = Mesh.prototype.raycast; const expected = ray.intersectObject(mesh);
        mesh.raycast = surfaceRaycast; const actual = ray.intersectObject(mesh);
        assert.equal(actual.length, expected.length);
        actual.forEach((hit, i) => { assert.equal(hit.faceIndex, expected[i].faceIndex); assert.ok(hit.point.distanceTo(expected[i].point) < 1e-8); });
        assert.deepEqual(geometry.drawRange, { start: range[0], count: range[1] });
      }
    }
  }
  geometry.dispose(); material.dispose();
});
