import type { BufferGeometry } from 'three';
import type { Cell } from './types';

export function surfaceMaterialRegions(cells: Pick<Cell, 'storesHeat' | 'temperature'>[]): number[] {
  const materials = new Map<string, number>();
  return cells.map((cell, index) => {
    const key = `${cell.storesHeat}:${cell.temperature}`;
    if (!materials.has(key)) materials.set(key, index);
    return materials.get(key)!;
  });
}

// Preserve cell partitions so temperature changes can split previously shared draws.
export function batchSurfaceGroups(geometry: BufferGeometry, materials: readonly number[]): void {
  const source = geometry.userData.cellGroups ??= geometry.groups.map(group => ({ ...group }));
  const buckets = new Map<number, number[]>();
  for (const group of source as BufferGeometry['groups']) {
    const material = materials[group.materialIndex ?? 0];
    const indices = buckets.get(material) ?? [];
    for (let i = group.start; i < group.start + group.count; i++) indices.push(i);
    buckets.set(material, indices);
  }
  const indices: number[] = [];
  geometry.clearGroups();
  for (const [material, bucket] of buckets) {
    geometry.addGroup(indices.length, bucket.length, material);
    for (const index of bucket) indices.push(index);
  }
  geometry.setIndex(indices);
}
