import type { Point } from './types';

export interface CoatingVertex { position: number[]; uv: number[] }
export interface CoatingMask { points: Point[]; minX: number; maxX: number; minY: number; maxY: number }

export function coatingMask(points: Point[]): CoatingMask {
  return { points, minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
    minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)) };
}

// Coatings occupy extruded planar regions. Subtraction preserves face winding and texture phase.
export function subtractCoating(face: CoatingVertex[], mask: CoatingMask): CoatingVertex[][] {
  const winding = Math.sign(mask.points.reduce((sum, a, i) => {
    const b = mask.points[(i + 1) % mask.points.length]; return sum + a.x * b.y - b.x * a.y;
  }, 0));
  const result: CoatingVertex[][] = []; let inside = face;
  for (let i = 0; i < mask.points.length && inside.length; i++) {
    const a = mask.points[i], b = mask.points[(i + 1) % mask.points.length];
    const distance = (v: CoatingVertex) => winding * ((b.x - a.x) * (v.position[2] - a.y) - (b.y - a.y) * (v.position[0] - a.x));
    const kept: CoatingVertex[] = [], outside: CoatingVertex[] = [];
    inside.forEach((v, j) => {
      const previous = inside[(j + inside.length - 1) % inside.length], d = distance(v), p = distance(previous);
      const isInside = d >= -1e-9, wasInside = p >= -1e-9;
      if (isInside !== wasInside) {
        const t = p / (p - d), cross = {
          position: previous.position.map((value, k) => value + (v.position[k] - value) * t),
          uv: previous.uv.map((value, k) => value + (v.uv[k] - value) * t),
        };
        kept.push(cross); outside.push(cross);
      }
      (isInside ? kept : outside).push(v);
    });
    if (outside.length >= 3) result.push(outside);
    inside = kept;
  }
  return result;
}
