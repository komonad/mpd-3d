import { Box3, OrthographicCamera, Vector3 } from 'three';

export function renderPixelRatio(deviceRatio: number, high: boolean): number {
  return high ? Math.min(Math.max(deviceRatio, 2), 3) : Math.min(deviceRatio, 1.5);
}

export function fitShadowCamera(camera: OrthographicCamera, bounds: Box3, margin = 0.6): void {
  camera.updateMatrixWorld(true);
  const lightBounds = new Box3();
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        lightBounds.expandByPoint(new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
      }
    }
  }
  camera.left = lightBounds.min.x - margin;
  camera.right = lightBounds.max.x + margin;
  camera.bottom = lightBounds.min.y - margin;
  camera.top = lightBounds.max.y + margin;
  camera.near = Math.max(0.1, -lightBounds.max.z - margin);
  camera.far = -lightBounds.min.z + margin;
  camera.updateProjectionMatrix();
}
