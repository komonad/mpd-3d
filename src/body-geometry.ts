import * as THREE from 'three';
import type { Cell, Point } from './types';

interface Segment { a: Point; b: Point; direction: number }
const key = (p: Point) => `${p.x},${p.y}`;
export function bodyLayerGeometry(cells: Cell[], height: number, exterior?: { width: number; height: number }): THREE.BufferGeometry {
  const root = cells[0], occupied = new Set(cells.map(key));
  const segments: (Segment & { kind: number })[] = [];
  for (const { x, y, edges } of cells) {
    if (!occupied.has(`${x},${y - 1}`)) segments.push({ a: { x, y }, b: { x: x + 1, y }, direction: 0, kind: (edges >> 6) & 3 });
    if (!occupied.has(`${x + 1},${y}`)) segments.push({ a: { x: x + 1, y }, b: { x: x + 1, y: y + 1 }, direction: 1, kind: (edges >> 4) & 3 });
    if (!occupied.has(`${x},${y + 1}`)) segments.push({ a: { x: x + 1, y: y + 1 }, b: { x, y: y + 1 }, direction: 2, kind: (edges >> 2) & 3 });
    if (!occupied.has(`${x - 1},${y}`)) segments.push({ a: { x, y: y + 1 }, b: { x, y }, direction: 3, kind: edges & 3 });
  }
  if (exterior) for (const s of segments) {
    if (s.a.x === 0 && s.b.x === 0 || s.a.y === 0 && s.b.y === 0 ||
      s.a.x === exterior.width && s.b.x === exterior.width || s.a.y === exterior.height && s.b.y === exterior.height) s.kind = 0;
  }
  const starts = new Map<string, typeof segments>();
  segments.forEach(s => { const list = starts.get(key(s.a)) ?? []; list.push(s); starts.set(key(s.a), list); });
  const used = new Set<Segment>(), loops: (typeof segments)[] = [];
  for (const start of segments) {
    if (used.has(start)) continue;
    const loop: typeof segments = []; let s = start;
    while (!used.has(s)) {
      used.add(s); loop.push(s);
      if (key(s.b) === key(start.a)) break;
      const candidates = (starts.get(key(s.b)) ?? []).filter(c => !used.has(c));
      candidates.sort((a, b) => [1, 0, 3, 2].indexOf((a.direction - s.direction + 4) % 4) - [1, 0, 3, 2].indexOf((b.direction - s.direction + 4) % 4));
      if (!candidates.length) throw new Error('Open surface-layer contour'); s = candidates[0];
    }
    loops.push(loop);
  }
  const surfaces = [{ vertices: [] as number[], uv: [] as number[] }, { vertices: [] as number[], uv: [] as number[] }];
  const geometry = new THREE.BufferGeometry();
  const lo = 0.055, hi = lo + height + 0.02;
  const vertex = (p: Point, y: number) => [p.x - root.x - 0.5, y, p.y - root.y - 0.5];
  function quad(points: number[][], coordinates: number[][], kind: number): void {
    if (kind !== 2 && kind !== 3) return;
    const surface = surfaces[kind - 2];
    for (const i of [0, 1, 2, 0, 2, 3]) { surface.vertices.push(...points[i]); surface.uv.push(...coordinates[i]); }
  }
  function strip(o: Point, i: Point, n: Point, e: Point, kind: number, u: number, v: number): void {
    const depth = 3, width = 0.1 / (hi - lo) * depth;
    quad([vertex(o, hi), vertex(i, hi), vertex(n, hi), vertex(e, hi)], [[u, 0], [u, width], [v, width], [v, 0]], kind);
    quad([vertex(o, lo), vertex(o, hi), vertex(e, hi), vertex(e, lo)], [[u, depth], [u, 0], [v, 0], [v, depth]], kind);
    quad([vertex(n, lo), vertex(n, hi), vertex(i, hi), vertex(i, lo)], [[v, depth + width], [v, width], [u, width], [u, depth + width]], kind);
    quad([vertex(e, lo), vertex(n, lo), vertex(i, lo), vertex(o, lo)], [[v, 0], [v, width], [u, width], [u, 0]], kind);
  }
  for (const loop of loops) {
    const curves = loop.map((s, j) => {
      const prev = loop[(j + loop.length - 1) % loop.length], p = s.a;
      const a = { x: prev.b.x - prev.a.x, y: prev.b.y - prev.a.y }, b = { x: s.b.x - p.x, y: s.b.y - p.y };
      const turn = a.x * b.y - a.y * b.x;
      const curve = (amount: number, radius: number): Point[] => {
        const c = turn ? { x: p.x - (a.y + b.y) * amount, y: p.y + (a.x + b.x) * amount } : { x: p.x - a.y * amount, y: p.y + a.x * amount };
        if (!turn) return [c];
        const entry = { x: c.x - a.x * radius, y: c.y - a.y * radius }, exit = { x: c.x + b.x * radius, y: c.y + b.y * radius };
        return Array.from({ length: 9 }, (_, k) => { const t = k / 8, u = 1 - t; return { x: u * u * entry.x + 2 * u * t * c.x + t * t * exit.x, y: u * u * entry.y + 2 * u * t * c.y + t * t * exit.y }; });
      };
      return { outer: curve(0.01, turn > 0 ? 0.16 : 0.06), inner: curve(0.11, turn > 0 ? 0.06 : 0.16) };
    });
    const strips: { o: Point; i: Point; n: Point; e: Point; kind: number; length: number }[] = [];
    const append = (o: Point, i: Point, n: Point, e: Point, kind: number) => {
      strips.push({ o, i, n, e, kind, length: Math.hypot(e.x + n.x - o.x - i.x, e.y + n.y - o.y - i.y) / 2 });
    };
    curves.forEach((c, j) => {
      const next = curves[(j + 1) % curves.length], prev = loop[(j + loop.length - 1) % loop.length], s = loop[j];
      for (let k = 0; k < c.outer.length - 1; k++) append(c.outer[k], c.inner[k], c.inner[k + 1], c.outer[k + 1], k < 4 ? prev.kind : s.kind);
      append(c.outer.at(-1)!, c.inner.at(-1)!, next.inner[0], next.outer[0], s.kind);
      if (prev.kind !== s.kind && c.outer.length > 1) {
        const o = c.outer[4], i = c.inner[4], kind = s.kind === 2 || s.kind === 3 ? s.kind : prev.kind;
        quad([vertex(o, lo), vertex(i, lo), vertex(i, hi), vertex(o, hi)], [[0, 2], [0.2, 2], [0.2, 0], [0, 0]], kind);
      }
    });
    const perimeter = strips.reduce((sum, s) => sum + s.length, 0), repeats = loop.length * 3;
    let distance = 0;
    for (const s of strips) {
      const u = distance / perimeter * repeats; distance += s.length;
      strip(s.o, s.i, s.n, s.e, s.kind, u, distance / perimeter * repeats);
    }
  }
  const vertices: number[] = [], uv: number[] = [];
  surfaces.forEach((s, index) => {
    if (s.vertices.length) geometry.addGroup(vertices.length / 3, s.vertices.length / 3, index);
    vertices.push(...s.vertices); uv.push(...s.uv);
  });
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.computeVertexNormals();
  return geometry;
}
export function bodyContours(cells: Pick<Cell, 'x' | 'y'>[]): Point[][] {
  const occupied = new Set(cells.map(key)), segments: Segment[] = [];
  for (const { x, y } of cells) {
    if (!occupied.has(`${x},${y - 1}`)) segments.push({ a: { x, y }, b: { x: x + 1, y }, direction: 0 });
    if (!occupied.has(`${x + 1},${y}`)) segments.push({ a: { x: x + 1, y }, b: { x: x + 1, y: y + 1 }, direction: 1 });
    if (!occupied.has(`${x},${y + 1}`)) segments.push({ a: { x: x + 1, y: y + 1 }, b: { x, y: y + 1 }, direction: 2 });
    if (!occupied.has(`${x - 1},${y}`)) segments.push({ a: { x, y: y + 1 }, b: { x, y }, direction: 3 });
  }
  const byStart = new Map<string, Segment[]>();
  segments.forEach(s => { const list = byStart.get(key(s.a)) ?? []; list.push(s); byStart.set(key(s.a), list); });
  const used = new Set<Segment>(), contours: Point[][] = [];
  for (const start of segments) {
    if (used.has(start)) continue;
    const points: Point[] = []; let s = start;
    while (!used.has(s)) {
      used.add(s); points.push(s.a);
      if (key(s.b) === key(start.a)) break;
      const candidates = (byStart.get(key(s.b)) ?? []).filter(e => !used.has(e));
      candidates.sort((a, b) => [1, 0, 3, 2].indexOf((a.direction - s.direction + 4) % 4) - [1, 0, 3, 2].indexOf((b.direction - s.direction + 4) % 4));
      if (!candidates.length) throw new Error('Open rigid-body contour');
      s = candidates[0];
    }
    contours.push(points.filter((p, i) => {
      const prev = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
      return (p.x - prev.x) * (next.y - p.y) !== (p.y - prev.y) * (next.x - p.x);
    }));
  }
  return contours;
}
export function fixedAnchorPoints(cells: Cell[]): Point[] {
  if (!cells.some(c => c.fixed)) return [];
  return bodyContours(cells).flatMap(points => points.map((p, i) => {
    const prev = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
    const ax = Math.sign(p.x - prev.x), ay = Math.sign(p.y - prev.y), bx = Math.sign(next.x - p.x), by = Math.sign(next.y - p.y);
    return { x: p.x - (ay + by) * 0.24 - 0.5, y: p.y + (ax + bx) * 0.24 - 0.5 };
  }));
}
function area(points: Point[]): number { return points.reduce((sum, p, i) => { const n = points[(i + 1) % points.length]; return sum + p.x * n.y - n.x * p.y; }, 0) / 2; }
function inset(points: Point[], amount: number): Point[] {
  return points.map((p, i) => {
    const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length];
    const ax = Math.sign(p.x - a.x), ay = Math.sign(p.y - a.y), bx = Math.sign(b.x - p.x), by = Math.sign(b.y - p.y);
    return { x: p.x + (-ay - by) * amount, y: p.y + (ax + bx) * amount };
  });
}

export function bodyGeometry(cells: Cell[], height: number): THREE.BufferGeometry {
  const root = cells[0];
  const uniform = cells.every(c => c.storesHeat === root.storesHeat && c.temperature === root.temperature);
  const contours = bodyContours(cells), outers = contours.filter(p => area(p) > 0), holes = contours.filter(p => area(p) < 0);
  const path = (points: Point[], target: THREE.Path) => {
    const offset = inset(points, 0.05), coordinates = (p: Point) => [p.x - root.x - 0.5, -(p.y - root.y - 0.5)] as const;
    const corners = points.map((p, i) => {
      const prev = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length], c = offset[i];
      const a = { x: Math.sign(p.x - prev.x), y: Math.sign(p.y - prev.y) }, b = { x: Math.sign(next.x - p.x), y: Math.sign(next.y - p.y) };
      const radius = a.x * b.y - a.y * b.x > 0 ? 0.12 : 0.1;
      return { c, entry: { x: c.x - a.x * radius, y: c.y - a.y * radius }, exit: { x: c.x + b.x * radius, y: c.y + b.y * radius } };
    });
    target.moveTo(...coordinates(corners[0].entry));
    for (let i = 0; i < corners.length; i++) {
      const c = corners[i]; target.quadraticCurveTo(...coordinates(c.c), ...coordinates(c.exit)); target.lineTo(...coordinates(corners[(i + 1) % corners.length].entry));
    }
    target.closePath(); return target;
  };
  const shapes = outers.map(p => path(p, new THREE.Shape()) as THREE.Shape);
  for (const hole of holes) {
    const points = path(hole, new THREE.Path()), test = hole[0];
    const owner = outers.findIndex(p => {
      let inside = false;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i].y > test.y) !== (p[j].y > test.y) && test.x < (p[j].x - p[i].x) * (test.y - p[i].y) / (p[j].y - p[i].y) + p[i].x) inside = !inside;
      return inside;
    });
    if (owner >= 0) shapes[owner].holes.push(points);
  }
  const geometry = new THREE.ExtrudeGeometry(shapes, { depth: height - 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, steps: 1, curveSegments: 8 });
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, 0.085, 0);
  geometry.clearGroups(); geometry.addGroup(0, geometry.getAttribute('position').count, 0);
  if (uniform) return geometry;
  const mixed = partitionBodySurface(cells, geometry); geometry.dispose(); return mixed;
}

export function bodySurfaceGeometries(cells: Cell[], height: number): { solid?: THREE.BufferGeometry; glass?: THREE.BufferGeometry } {
  const solid = bodyGeometry(cells, height);
  if (cells.every(c => c.storesHeat)) return { solid };
  if (cells.every(c => !c.storesHeat)) return { glass: solid };
  const glass = solid.clone(), groups = solid.groups;
  solid.groups = groups.filter(g => cells[g.materialIndex ?? 0].storesHeat);
  glass.groups = groups.filter(g => !cells[g.materialIndex ?? 0].storesHeat);
  return { solid, glass };
}

// Material partitions clip the rounded surface; they never create internal faces.
export function partitionBodySurface(cells: Cell[], surface: THREE.BufferGeometry): THREE.BufferGeometry {
  type Vertex = { p: THREE.Vector3; n: THREE.Vector3; uv: THREE.Vector2 };
  const root = cells[0], byPosition = new Map(cells.map((c, i) => [key(c), i]));
  const buckets = cells.map(() => ({ positions: [] as number[], normals: [] as number[], uv: [] as number[] }));
  const position = surface.getAttribute('position'), normal = surface.getAttribute('normal'), uv = surface.getAttribute('uv');
  const interpolate = (a: Vertex, b: Vertex, t: number): Vertex => ({ p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t), uv: a.uv.clone().lerp(b.uv, t) });
  function clip(polygon: Vertex[], axis: 'x' | 'z', boundary: number, sign: number): Vertex[] {
    const result: Vertex[] = [];
    polygon.forEach((b, i) => {
      const a = polygon[(i + polygon.length - 1) % polygon.length];
      const da = (a.p[axis] - boundary) * sign, db = (b.p[axis] - boundary) * sign;
      if ((da >= 0) !== (db >= 0)) result.push(interpolate(a, b, da / (da - db)));
      if (db >= 0) result.push(b);
    });
    return result;
  }
  for (let i = 0; i < position.count; i += 3) {
    const triangle = [0, 1, 2].map(j => ({ p: new THREE.Vector3().fromBufferAttribute(position, i + j), n: new THREE.Vector3().fromBufferAttribute(normal, i + j), uv: new THREE.Vector2(uv.getX(i + j), uv.getY(i + j)) }));
    const xs = triangle.map(v => v.p.x + root.x), zs = triangle.map(v => v.p.z + root.y);
    for (let y = Math.floor(Math.min(...zs) + 0.5); y <= Math.floor(Math.max(...zs) + 0.5); y++) {
      for (let x = Math.floor(Math.min(...xs) + 0.5); x <= Math.floor(Math.max(...xs) + 0.5); x++) {
        let polygon = clip(triangle, 'x', x - root.x - 0.5, 1);
        polygon = clip(polygon, 'x', x - root.x + 0.5, -1);
        polygon = clip(polygon, 'z', y - root.y - 0.5, 1);
        polygon = clip(polygon, 'z', y - root.y + 0.5, -1);
        if (polygon.length < 3) continue;
        const center = polygon.reduce((sum, v) => sum.add(v.p), new THREE.Vector3()).multiplyScalar(1 / polygon.length);
        const index = byPosition.get(`${x},${y}`) ?? cells.reduce((best, c, j) =>
          Math.hypot(c.x - root.x - center.x, c.y - root.y - center.z) < Math.hypot(cells[best].x - root.x - center.x, cells[best].y - root.y - center.z) ? j : best, 0);
        const bucket = buckets[index];
        for (let j = 1; j < polygon.length - 1; j++) {
          const vertices = [polygon[0], polygon[j], polygon[j + 1]];
          if (vertices[1].p.clone().sub(vertices[0].p).cross(vertices[2].p.clone().sub(vertices[0].p)).lengthSq() < 1e-16) continue;
          for (const v of vertices) { bucket.positions.push(...v.p.toArray()); bucket.normals.push(...v.n.clone().normalize().toArray()); bucket.uv.push(...v.uv.toArray()); }
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry(), positions: number[] = [], normals: number[] = [], coordinates: number[] = [];
  buckets.forEach((b, i) => { if (b.positions.length) geometry.addGroup(positions.length / 3, b.positions.length / 3, i); positions.push(...b.positions); normals.push(...b.normals); coordinates.push(...b.uv); });
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(coordinates, 2));
  return geometry;
}
