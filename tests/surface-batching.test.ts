import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { batchSurfaceGroups } from '../src/surface-batching';
import { bodyGeometry, partitionBodySurface } from '../src/body-geometry';
import type { Cell } from '../src/types';

test('surface batching preserves disjoint triangle ranges and can split on temperature changes', () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(36), 3));
  geometry.addGroup(0, 3, 0); geometry.addGroup(6, 3, 2); geometry.addGroup(9, 3, 3);
  batchSurfaceGroups(geometry, [0, 1, 0, 3]);
  assert.deepEqual(geometry.groups, [{ start: 0, count: 6, materialIndex: 0 }, { start: 6, count: 3, materialIndex: 3 }]);
  assert.deepEqual(Array.from(geometry.index!.array), [0, 1, 2, 6, 7, 8, 9, 10, 11]);
  batchSurfaceGroups(geometry, [0, 1, 2, 0]);
  assert.deepEqual(geometry.groups, [{ start: 0, count: 6, materialIndex: 0 }, { start: 6, count: 3, materialIndex: 2 }]);
  assert.deepEqual(Array.from(geometry.index!.array), [0, 1, 2, 9, 10, 11, 6, 7, 8]);
  geometry.dispose();
});

test('sparse surface ownership retains the same clipped attributes around holes and corners', () => {
  const cells: Cell[] = [];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    if (x > 0 && x < 8 && y > 0 && y < 8) continue;
    cells.push({ key: cells.length, x, y, fixed: true, storesHeat: true, temperature: 0, edges: 0 });
  }
  const source = bodyGeometry(cells, 0.96), owners = new Set([0, 8, 18]);
  const full = partitionBodySurface(cells, source), sparse = partitionBodySurface(cells, source, undefined, owners);
  for (const name of ['position', 'normal', 'uv']) {
    const attribute = full.getAttribute(name), expected: number[] = [];
    for (const group of full.groups) if (owners.has(group.materialIndex!)) {
      for (let i = group.start; i < group.start + group.count; i++) {
        for (let component = 0; component < attribute.itemSize; component++) expected.push(attribute.getComponent(i, component));
      }
    }
    assert.deepEqual(Array.from(sparse.getAttribute(name).array), expected);
  }
  source.dispose(); full.dispose(); sparse.dispose();
});

test('large material regions preserve exterior holes and assign the exceptional cell its own surface', () => {
  const cells: Cell[] = [];
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    if (x >= 4 && x < 20 && y >= 4 && y < 20) continue;
    cells.push({ key: cells.length, x, y, fixed: true, storesHeat: true, temperature: 0, edges: 0 });
  }
  const exception = cells.findIndex(cell => cell.x === 5 && cell.y === 3);
  const exterior = { width: 24, height: 24 }, uniform = bodyGeometry(cells, 0.96, exterior);
  cells[exception] = { ...cells[exception], storesHeat: false };
  const mixed = bodyGeometry(cells, 0.96, exterior), material = new MeshBasicMaterial({ side: DoubleSide });
  assert.equal(mixed.userData.materialRegions, true);
  assert.deepEqual(mixed.groups.map(group => group.materialIndex), [0, exception]);
  assert.ok(mixed.getAttribute('position').count < uniform.getAttribute('position').count * 3);
  const a = new Mesh(uniform, material), b = new Mesh(mixed, cells.map(() => material));
  a.updateMatrixWorld(); b.updateMatrixWorld();
  const ray = new Raycaster();
  for (let x = -1; x <= 25; x += 1.75) for (let z = -1; z <= 25; z += 1.75) {
    ray.set(new Vector3(x, 3, z), new Vector3(0, -1, 0));
    const expected = ray.intersectObject(a)[0], actual = ray.intersectObject(b)[0];
    assert.equal(Boolean(actual), Boolean(expected));
    if (expected && actual) assert.ok(expected.point.distanceTo(actual.point) < 1e-5);
  }
  ray.set(new Vector3(5, 3, 3), new Vector3(0, -1, 0));
  assert.equal(ray.intersectObject(b)[0].face!.materialIndex, exception);
  uniform.dispose(); mixed.dispose(); material.dispose();
});
