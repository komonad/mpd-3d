import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, OrthographicCamera, Vector3 } from 'three';
import { fitShadowCamera, renderPixelRatio, visibleShadowBounds } from '../src/render-quality';

test('render density stays within native resolution and the selected quality budget', () => {
  for (const density of [1, 1.25, 1.5, 2, 2.5, 3]) {
    const ratio = renderPixelRatio(density, true);
    assert.equal(ratio, Math.min(density, 1.5));
  }
  assert.equal(renderPixelRatio(4, true), 1.5);
  assert.equal(renderPixelRatio(1, false), 1);
  assert.equal(renderPixelRatio(3, false), 1);
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

test('visible shadow bounds include offscreen casters and remain local on large maps', () => {
  const board = new Box3(new Vector3(-40, -0.6, -40), new Vector3(40, 1.8, 40));
  const light = new Vector3(-9, 16, 7);
  for (const tilt of [0.1, 0.55, 1.1]) for (const yaw of [0, 0.8, 2]) {
    const camera = new OrthographicCamera(-6, 6, 5, -5, 0.1, 1000);
    camera.position.set(Math.sin(yaw) * Math.sin(tilt) * 100, Math.cos(tilt) * 100, Math.cos(yaw) * Math.sin(tilt) * 100);
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    const bounds = visibleShadowBounds(camera, board, light);
    assert.ok(bounds.getSize(new Vector3()).x < 50 && bounds.getSize(new Vector3()).z < 50);
    const direction = camera.getWorldDirection(new Vector3());
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      const origin = new Vector3(x, y, 0).unproject(camera);
      const receiver = origin.clone().addScaledVector(direction, (board.min.y - origin.y) / direction.y);
      const caster = receiver.clone().addScaledVector(light, (board.max.y - receiver.y) / light.y);
      if (board.containsPoint(receiver)) assert.ok(bounds.clone().expandByScalar(1e-6).containsPoint(receiver));
      if (board.containsPoint(caster)) assert.ok(bounds.clone().expandByScalar(1e-6).containsPoint(caster));
    }
  }
});
