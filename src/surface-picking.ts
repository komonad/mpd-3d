import { Box3, Matrix4, Mesh, Ray, Vector3 } from 'three';
import type { BufferGeometry, Intersection, Raycaster } from 'three';

interface Chunk { start: number; count: number; bounds: Box3 }
const partitions = new WeakMap<BufferGeometry, { index: BufferGeometry['index']; chunks: Chunk[] }>();

export function prepareSurfacePicking(geometry: BufferGeometry): void {
  if (partitions.get(geometry)?.index === geometry.index) return;
  const positions = geometry.getAttribute('position'), index = geometry.index;
  const count = index?.count ?? positions.count, chunks: Chunk[] = [], point = new Vector3();
  for (let start = 0; start < count; start += 384) {
    const end = Math.min(start + 384, count), bounds = new Box3();
    for (let i = start; i < end; i++) bounds.expandByPoint(point.fromBufferAttribute(positions, index ? index.getX(i) : i));
    chunks.push({ start, count: end - start, bounds });
  }
  partitions.set(geometry, { index, chunks });
}

// Spatial rejection narrows exact triangle picking without changing visible geometry.
export function surfaceRaycast(this: Mesh, raycaster: Raycaster, intersects: Intersection[]): void {
  const geometry = this.geometry;
  prepareSurfacePicking(geometry);
  const chunks = partitions.get(geometry)!.chunks;
  if (chunks.length < 8) { Mesh.prototype.raycast.call(this, raycaster, intersects); return; }
  const ray = new Ray().copy(raycaster.ray).applyMatrix4(new Matrix4().copy(this.matrixWorld).invert());
  const { start, count } = geometry.drawRange, end = start + count;
  try {
    for (const chunk of chunks) {
      if (!ray.intersectsBox(chunk.bounds)) continue;
      const first = Math.max(start, chunk.start), last = Math.min(end, chunk.start + chunk.count);
      if (last <= first) continue;
      geometry.setDrawRange(first, last - first);
      Mesh.prototype.raycast.call(this, raycaster, intersects);
    }
  } finally { geometry.setDrawRange(start, count); }
}
