import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, OrthographicCamera, Vector3 } from 'three';
import { fitShadowCamera, renderPixelRatio } from '../src/render-quality';

test('high quality supersamples standard displays and preserves native density through 3×', () => {
  for (const density of [1, 1.25, 1.5, 2, 2.5, 3]) {
    const ratio = renderPixelRatio(density, true);
    assert.ok(ratio >= density);
    assert.ok(ratio >= 2);
  }
  assert.equal(renderPixelRatio(4, true), 3);
  assert.equal(renderPixelRatio(1, false), 1);
  assert.equal(renderPixelRatio(3, false), 1.5);
});

test('shadow projection contains the platform, tall pieces, and ground across board sizes', () => {
  for (const [width, height] of [[9, 7], [11, 9], [32, 28], [60, 12]]) {
    const camera = new OrthographicCamera();
    camera.position.copy(new Vector3(-9, 16, 7).normalize().multiplyScalar(Math.hypot(width, height) + 20));
    camera.lookAt(0, 0, 0);
    const bounds = new Box3(new Vector3(-width / 2 - 1.2, -0.6, -height / 2 - 1.2), new Vector3(width / 2 + 1.2, 1.8, height / 2 + 1.2));
    fitShadowCamera(camera, bounds);
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const projected = new Vector3(x, y, z).project(camera);
          assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1);
        }
      }
    }
    if (width === 9) {
      assert.ok(camera.right - camera.left < 20);
      assert.ok(camera.top - camera.bottom < 20);
    }
  }
});
