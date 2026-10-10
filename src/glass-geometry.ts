import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bodyContours, partitionBodySurface } from './body-geometry';
import type { Cell } from './types';

export function glassRimGeometry(cells: Cell[], height: number): THREE.BufferGeometry {
  const root = cells[0], parts: THREE.BufferGeometry[] = [];
  const lo = 0.057, hi = 0.055 + height - 0.002;
  for (const contour of bodyContours(cells)) {
    const corners = contour.map((p, index) => {
      const prev = contour[(index + contour.length - 1) % contour.length], next = contour[(index + 1) % contour.length];
      const a = new THREE.Vector2(Math.sign(p.x - prev.x), Math.sign(p.y - prev.y));
      const b = new THREE.Vector2(Math.sign(next.x - p.x), Math.sign(next.y - p.y));
      const center = new THREE.Vector2(p.x - (a.y + b.y) * 0.05 - root.x - 0.5, p.y + (a.x + b.x) * 0.05 - root.y - 0.5);
      const radius = a.x * b.y - a.y * b.x > 0 ? 0.12 : 0.1;
      return { center, entry: center.clone().addScaledVector(a, -radius), exit: center.clone().addScaledVector(b, radius) };
    });
    for (const y of [lo, hi]) {
      const path = new THREE.CurvePath<THREE.Vector3>();
      const point = (p: THREE.Vector2) => new THREE.Vector3(p.x, y, p.y);
      corners.forEach((c, index) => {
        path.add(new THREE.QuadraticBezierCurve3(point(c.entry), point(c.center), point(c.exit)));
        path.add(new THREE.LineCurve3(point(c.exit), point(corners[(index + 1) % corners.length].entry)));
      });
      parts.push(new THREE.TubeGeometry(path, Math.ceil(path.getLength() * 24), y === hi ? 0.019 : 0.01, 8, true));
    }
    for (const c of corners) {
      const p = c.entry.clone().add(c.exit).multiplyScalar(0.25).addScaledVector(c.center, 0.5);
      const line = new THREE.LineCurve3(new THREE.Vector3(p.x, lo, p.y), new THREE.Vector3(p.x, hi, p.y));
      parts.push(new THREE.TubeGeometry(line, 1, 0.012, 8, false));
    }
  }
  const geometry = mergeGeometries(parts)!; parts.forEach(p => p.dispose());
  if (cells.every(c => !c.storesHeat)) return geometry;
  const triangles = geometry.toNonIndexed(), surface = partitionBodySurface(cells, triangles);
  triangles.dispose(); geometry.dispose();
  const groups = surface.groups.filter(g => !cells[g.materialIndex ?? 0].storesHeat), result = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const source = surface.getAttribute(name), values: number[] = [];
    for (const group of groups) for (let i = group.start; i < group.start + group.count; i++) {
      for (let j = 0; j < source.itemSize; j++) values.push(source.getComponent(i, j));
    }
    result.setAttribute(name, new THREE.Float32BufferAttribute(values, source.itemSize));
  }
  surface.dispose(); return result;
}
