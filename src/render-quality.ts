import { Box3, OrthographicCamera, Vector3 } from 'three';

export function renderPixelRatio(deviceRatio: number, high: boolean): number {
  return Math.min(deviceRatio, high ? 1.5 : 1);
}

export function visibleShadowBounds(camera: OrthographicCamera, board: Box3, lightDirection: Vector3): Box3 {
  camera.updateMatrixWorld(true);
  const view = new Box3(), direction = camera.getWorldDirection(new Vector3());
  if (Math.abs(direction.y) < 1e-5) return board.clone();
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    const origin = new Vector3(x, y, 0).unproject(camera);
    for (const height of [board.min.y, board.max.y]) {
      view.expandByPoint(origin.clone().addScaledVector(direction, (height - origin.y) / direction.y));
    }
  }
  // Include offscreen casters whose shadows reach visible receivers.
  const height = board.max.y - board.min.y, vertical = Math.max(Math.abs(lightDirection.y), 1e-5);
  const padX = height * Math.abs(lightDirection.x) / vertical + 0.6;
  const padZ = height * Math.abs(lightDirection.z) / vertical + 0.6;
  view.min.x -= padX; view.max.x += padX; view.min.z -= padZ; view.max.z += padZ;
  view.min.y = board.min.y; view.max.y = board.max.y;
  view.intersect(board);
  return view.isEmpty() ? board.clone() : view;
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
