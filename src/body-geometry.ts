import * as THREE from 'three';
import type { Cell, Point } from './types';

interface Segment { a: Point; b: Point; direction: number }
const key = (p: Point) => `${p.x},${p.y}`;
export function bodyLayerGeometry(cells: Cell[], height: number): THREE.BufferGeometry {
  const root = cells[0], occupied = new Set(cells.map(key));
  const segments: (Segment & { kind: number })[] = [];
  for (const { x, y, edges } of cells) {
    if (!occupied.has(`${x},${y - 1}`)) segments.push({ a: { x, y }, b: { x: x + 1, y }, direction: 0, kind: (edges >> 6) & 3 });
    if (!occupied.has(`${x + 1},${y}`)) segments.push({ a: { x: x + 1, y }, b: { x: x + 1, y: y + 1 }, direction: 1, kind: (edges >> 4) & 3 });
    if (!occupied.has(`${x},${y + 1}`)) segments.push({ a: { x: x + 1, y: y + 1 }, b: { x, y: y + 1 }, direction: 2, kind: (edges >> 2) & 3 });
    if (!occupied.has(`${x - 1},${y}`)) segments.push({ a: { x, y: y + 1 }, b: { x, y }, direction: 3, kind: edges & 3 });
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
  const vertices: number[] = [], uv: number[] = [], geometry = new THREE.BufferGeometry();
  const lo = 0.055, hi = lo + height + 0.02;
  const vertex = (p: Point, y: number) => [p.x - root.x - 0.5, y, p.y - root.y - 0.5];
  function quad(points: number[][], kind: number, top = false): void {
    if (kind !== 2 && kind !== 3) return;
    const start = vertices.length / 3;
    for (const i of [0, 1, 2, 0, 2, 3]) { vertices.push(...points[i]); uv.push(points[i][0] + points[i][2], top ? points[i][2] : points[i][1]); }
    geometry.addGroup(start, 6, kind - 2);
  }
  function strip(o: Point, i: Point, n: Point, e: Point, kind: number): void {
    quad([vertex(o, hi), vertex(i, hi), vertex(n, hi), vertex(e, hi)], kind, true);
    quad([vertex(o, lo), vertex(o, hi), vertex(e, hi), vertex(e, lo)], kind);
    quad([vertex(n, lo), vertex(n, hi), vertex(i, hi), vertex(i, lo)], kind);
    quad([vertex(e, lo), vertex(n, lo), vertex(i, lo), vertex(o, lo)], kind, true);
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
    curves.forEach((c, j) => {
      const next = curves[(j + 1) % curves.length], prev = loop[(j + loop.length - 1) % loop.length], s = loop[j];
      strip(c.outer.at(-1)!, c.inner.at(-1)!, next.inner[0], next.outer[0], s.kind);
      for (let k = 0; k < c.outer.length - 1; k++) strip(c.outer[k], c.inner[k], c.inner[k + 1], c.outer[k + 1], k < 4 ? prev.kind : s.kind);
      if (prev.kind !== s.kind && c.outer.length > 1) {
        const o = c.outer[4], i = c.inner[4], kind = s.kind === 2 || s.kind === 3 ? s.kind : prev.kind;
        quad([vertex(o, lo), vertex(i, lo), vertex(i, hi), vertex(o, hi)], kind);
      }
    });
  }
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
  if (!uniform) return mixedSurface(cells, height);
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
  return geometry;
}

// Mixed thermal bodies retain per-cell materials without adding internal walls.
function mixedSurface(cells: Cell[], height: number): THREE.BufferGeometry {
  const root = cells[0], occupied = new Set(cells.map(key));
  const vertices: number[] = [], normals: number[] = [], uv: number[] = [];
  const geometry = new THREE.BufferGeometry();
  function quad(points: number[][], normal: number[], material: number): void {
    const start = vertices.length / 3;
    for (const i of [0, 1, 2, 0, 2, 3]) { vertices.push(...points[i]); normals.push(...normal); uv.push(normal[0] ? points[i][2] : points[i][0], normal[1] ? points[i][2] : points[i][1]); }
    geometry.addGroup(start, 6, material);
  }
  cells.forEach((c, index) => {
    const x = c.x - root.x, z = c.y - root.y;
    const a = x - 0.5 + (occupied.has(`${c.x - 1},${c.y}`) ? 0 : 0.02), b = x + 0.5 - (occupied.has(`${c.x + 1},${c.y}`) ? 0 : 0.02);
    const f = z - 0.5 + (occupied.has(`${c.x},${c.y - 1}`) ? 0 : 0.02), g = z + 0.5 - (occupied.has(`${c.x},${c.y + 1}`) ? 0 : 0.02), lo = 0.055, hi = lo + height;
    quad([[a, hi, f], [a, hi, g], [b, hi, g], [b, hi, f]], [0, 1, 0], index);
    quad([[a, lo, f], [b, lo, f], [b, lo, g], [a, lo, g]], [0, -1, 0], index);
    if (!occupied.has(`${c.x - 1},${c.y}`)) quad([[a, lo, g], [a, hi, g], [a, hi, f], [a, lo, f]], [-1, 0, 0], index);
    if (!occupied.has(`${c.x + 1},${c.y}`)) quad([[b, lo, f], [b, hi, f], [b, hi, g], [b, lo, g]], [1, 0, 0], index);
    if (!occupied.has(`${c.x},${c.y - 1}`)) quad([[a, lo, f], [a, hi, f], [b, hi, f], [b, lo, f]], [0, 0, -1], index);
    if (!occupied.has(`${c.x},${c.y + 1}`)) quad([[b, lo, g], [b, hi, g], [a, hi, g], [a, lo, g]], [0, 0, 1], index);
  });
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}
