import * as THREE from 'three';
import type { Cell, Point } from './types';
import { coatingMask, subtractCoating, type CoatingMask, type CoatingVertex } from './coating-geometry';

interface Segment { a: Point; b: Point; direction: number }
export const bodyBaseHeight = 0.055;
export const blockHeight = 0.96;
export const exteriorHalfExtent = 2048;
const key = (p: Point) => `${p.x},${p.y}`;
export function bodyLayerGeometry(cells: Cell[], height: number, exterior?: { width: number; height: number }): THREE.BufferGeometry {
  const root = cells[0], occupied = new Set(cells.map(key));
  const segments: (Segment & { kind: number; owner: number })[] = [];
  for (const { x, y, edges, key: owner } of cells) {
    if (!occupied.has(`${x},${y - 1}`)) segments.push({ a: { x, y }, b: { x: x + 1, y }, direction: 0, kind: (edges >> 6) & 3, owner });
    if (!occupied.has(`${x + 1},${y}`)) segments.push({ a: { x: x + 1, y }, b: { x: x + 1, y: y + 1 }, direction: 1, kind: (edges >> 4) & 3, owner });
    if (!occupied.has(`${x},${y + 1}`)) segments.push({ a: { x: x + 1, y: y + 1 }, b: { x, y: y + 1 }, direction: 2, kind: (edges >> 2) & 3, owner });
    if (!occupied.has(`${x - 1},${y}`)) segments.push({ a: { x, y: y + 1 }, b: { x, y }, direction: 3, kind: edges & 3, owner });
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
  const surfaces = [{ vertices: [] as number[], uv: [] as number[], owners: [] as number[] }, { vertices: [] as number[], uv: [] as number[], owners: [] as number[] }];
  const geometry = new THREE.BufferGeometry();
  const lo = bodyBaseHeight, hi = lo + height;
  const vertex = (p: Point, y: number) => [p.x - root.x - 0.5, y, p.y - root.y - 0.5];
  type Coating = { mask: CoatingMask; faces: CoatingVertex[][]; kind: number; owner: number };
  const coatings: Coating[] = [], caps: { face: CoatingVertex[]; kind: number; owner: number }[] = [];
  let current: Coating | undefined;
  function begin(points: Point[], kind: number, owner: number): void {
    if (kind !== 2 && kind !== 3) return;
    current = { mask: coatingMask(points.map(p => ({ x: p.x - root.x - 0.5, y: p.y - root.y - 0.5 }))), faces: [], kind, owner };
    coatings.push(current);
  }
  function polygon(face: CoatingVertex[], kind: number, owner: number): void {
    const surface = surfaces[kind - 2];
    for (let i = 1; i < face.length - 1; i++) {
      const a = face[0].position, b = face[i].position, c = face[i + 1].position;
      const cross = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]));
      if (cross.lengthSq() < 1e-18) continue;
      for (const v of [face[0], face[i], face[i + 1]]) { surface.vertices.push(...v.position); surface.uv.push(...v.uv); surface.owners.push(owner); }
    }
  }
  function quad(points: number[][], coordinates: number[][], kind: number, owner = -1): void {
    if (kind !== 2 && kind !== 3) return;
    const face = points.map((position, i) => ({ position, uv: coordinates[i] }));
    if (current) current.faces.push(face); else caps.push({ face, kind, owner });
  }
  function strip(o: Point, i: Point, n: Point, e: Point, kind: number, u: number, v: number, owner: number): void {
    begin([o, i, n, e], kind, owner);
    const depth = 3, width = 0.1 / (hi - lo) * depth;
    quad([vertex(o, hi), vertex(i, hi), vertex(n, hi), vertex(e, hi)], [[u, 0], [u, width], [v, width], [v, 0]], kind, owner);
    quad([vertex(o, lo), vertex(o, hi), vertex(e, hi), vertex(e, lo)], [[u, depth], [u, 0], [v, 0], [v, depth]], kind, owner);
    quad([vertex(n, lo), vertex(n, hi), vertex(i, hi), vertex(i, lo)], [[v, depth + width], [v, width], [u, width], [u, depth + width]], kind, owner);
    quad([vertex(e, lo), vertex(n, lo), vertex(i, lo), vertex(o, lo)], [[v, 0], [v, width], [u, width], [u, 0]], kind, owner);
    current = undefined;
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
    const strips: { o: Point; i: Point; n: Point; e: Point; kind: number; length: number; owner: number }[] = [];
    const append = (o: Point, i: Point, n: Point, e: Point, kind: number, owner: number) => {
      strips.push({ o, i, n, e, kind, owner, length: Math.hypot(e.x + n.x - o.x - i.x, e.y + n.y - o.y - i.y) / 2 });
    };
    curves.forEach((c, j) => {
      const next = curves[(j + 1) % curves.length], prev = loop[(j + loop.length - 1) % loop.length], s = loop[j];
      for (let k = 0; k < c.outer.length - 1; k++) append(c.outer[k], c.inner[k], c.inner[k + 1], c.outer[k + 1], k < 4 ? prev.kind : s.kind, k < 4 ? prev.owner : s.owner);
      append(c.outer.at(-1)!, c.inner.at(-1)!, next.inner[0], next.outer[0], s.kind, s.owner);
      if (prev.kind !== s.kind && c.outer.length > 1) {
        const o = c.outer[4], i = c.inner[4], kind = prev.kind === 2 || s.kind === 2 ? 2 : s.kind === 3 ? 3 : prev.kind;
        const owner = s.kind === kind ? s.owner : prev.owner;
        quad([vertex(o, lo), vertex(i, lo), vertex(i, hi), vertex(o, hi)], [[0, 2], [0.2, 2], [0.2, 0], [0, 0]], kind, owner);
      }
    });
    const perimeter = strips.reduce((sum, s) => sum + s.length, 0), repeats = loop.length * 3;
    let distance = 0;
    for (const s of strips) {
      const u = distance / perimeter * repeats; distance += s.length;
      strip(s.o, s.i, s.n, s.e, s.kind, u, distance / perimeter * repeats, s.owner);
    }
  }
  const at = new Map(cells.map(c => [key(c), c]));
  const edgeAt = (c: Cell, direction: number) => c.edges >> ((3 - direction) * 2) & 3;
  const interfaces = new Map<string, { cell: Cell; neighbor: Cell; direction: number; coatings: { kind: number; owner: Cell; side: number }[] }>();
  for (const cell of cells) for (const direction of [1, 2]) {
    const neighbor = at.get(`${cell.x + (direction === 1 ? 1 : 0)},${cell.y + (direction === 2 ? 1 : 0)}`);
    if (!neighbor || cell.container !== neighbor.container) continue;
    const opposite = (direction + 2) % 4;
    const a = edgeAt(cell, direction), b = edgeAt(neighbor, opposite);
    const adhesive = (a === 3 || b === 3) && (cell.storesHeat !== neighbor.storesHeat || cell.storesHeat && (a === 2 || b === 2));
    if (!adhesive && a !== 2 && b !== 2) continue;
    const owner = a === 3 ? cell : neighbor;
    const coatings = adhesive ? [{ kind: 3, owner, side: owner === cell ? 1 : -1 }] : [];
    if (a === 2) coatings.push({ kind: 2, owner: cell, side: 1 });
    if (b === 2) coatings.push({ kind: 2, owner: neighbor, side: -1 });
    interfaces.set(`${cell.x},${cell.y},${direction}`, { cell, neighbor, direction, coatings });
  }
  for (const { cell, neighbor, direction, coatings } of interfaces.values()) {
    const tangent = direction === 1 ? { x: 0, y: 1 } : { x: -1, y: 0 };
    const center = { x: cell.x + (direction === 1 ? 1 : 0.5), y: cell.y + (direction === 2 ? 1 : 0.5) };
    for (const { kind, owner, side } of coatings) {
      const continues = (sign: number) => interfaces.get(`${cell.x + tangent.x * sign},${cell.y + tangent.y * sign},${direction}`)?.coatings.some(c => c.kind === kind && c.side === side) ?? false;
      const junction = (sign: number) => kind === 2 && !continues(sign) &&
        at.has(`${cell.x + tangent.x * sign},${cell.y + tangent.y * sign}`) &&
        at.has(`${neighbor.x + tangent.x * sign},${neighbor.y + tangent.y * sign}`);
      const start = -0.5 - (junction(-1) ? 0.11 : 0), end = 0.5 + (junction(1) ? 0.11 : 0);
      const normal = { x: tangent.y * side, y: -tangent.x * side };
      const point = (along: number, across: number) => ({ x: center.x + tangent.x * along + normal.x * across, y: center.y + tangent.y * along + normal.y * across });
      const o = point(start, 0), i = point(start, -0.11), n = point(end, -0.11), e = point(end, 0);
      begin([o, i, n, e], kind, owner.key);
      const top = hi, width = 0.11 / height * 3, u = (start + 0.5) * 3, v = (end + 0.5) * 3;
      const face = (points: number[][], coordinates: number[][]) => quad(side > 0 ? points : [...points].reverse(), side > 0 ? coordinates : [...coordinates].reverse(), kind, owner.key);
      face([vertex(o, top), vertex(i, top), vertex(n, top), vertex(e, top)], [[u, 0], [u, width], [v, width], [v, 0]]);
      if (kind === 2 && coatings.find(c => c.kind === 2)!.owner === owner || !coatings.some(c => c.kind === 2)) {
        const points = [vertex(o, lo), vertex(o, top), vertex(e, top), vertex(e, lo)], coordinates = [[u, 3], [u, 0], [v, 0], [v, 3]];
        face(points, coordinates);
        if (kind === 2) face([...points].reverse(), [...coordinates].reverse());
      }
      face([vertex(n, lo), vertex(n, top), vertex(i, top), vertex(i, lo)], [[v, 3 + width], [v, width], [u, width], [u, 3 + width]]);
      if (!continues(-1)) face([vertex(i, lo), vertex(i, top), vertex(o, top), vertex(o, lo)], [[width, 3], [width, 0], [0, 0], [0, 3]]);
      if (!continues(1)) face([vertex(e, lo), vertex(e, top), vertex(n, top), vertex(n, lo)], [[0, 3], [0, 0], [width, 0], [width, 3]]);
      current = undefined;
    }
  }
  // Insulation owns intersections; later coatings cannot introduce coplanar surfaces.
  coatings.sort((a, b) => a.kind - b.kind);
  const tiles = new Map<string, Coating[]>();
  for (const coating of coatings) {
    const mask = coating.mask, nearby = new Set<Coating>();
    for (let y = Math.floor(mask.minY); y <= Math.floor(mask.maxY); y++) for (let x = Math.floor(mask.minX); x <= Math.floor(mask.maxX); x++) {
      const bucket = tiles.get(`${x},${y}`) ?? [];
      for (const previous of bucket) nearby.add(previous);
      bucket.push(coating); tiles.set(`${x},${y}`, bucket);
    }
    const masks = [...nearby].filter(c => c.mask.maxX >= mask.minX && c.mask.minX <= mask.maxX && c.mask.maxY >= mask.minY && c.mask.minY <= mask.maxY);
    for (const face of coating.faces) {
      let fragments = [face];
      for (const previous of masks) fragments = fragments.flatMap(fragment => subtractCoating(fragment, previous.mask));
      for (const fragment of fragments) polygon(fragment, coating.kind, coating.owner);
    }
  }
  for (const cap of caps) {
    let fragments = [cap.face];
    if (cap.kind === 3) {
      const mask = coatingMask(cap.face.map(v => ({ x: v.position[0], y: v.position[2] }))), nearby = new Set<Coating>();
      for (let y = Math.floor(mask.minY); y <= Math.floor(mask.maxY); y++) for (let x = Math.floor(mask.minX); x <= Math.floor(mask.maxX); x++) {
        for (const coating of tiles.get(`${x},${y}`) ?? []) if (coating.kind === 2) nearby.add(coating);
      }
      for (const coating of nearby) fragments = fragments.flatMap(fragment => subtractCoating(fragment, coating.mask));
    }
    for (const fragment of fragments) polygon(fragment, cap.kind, cap.owner);
  }
  const vertices: number[] = [], uv: number[] = [], owners: number[] = [];
  surfaces.forEach((s, index) => {
    if (s.vertices.length) geometry.addGroup(vertices.length / 3, s.vertices.length / 3, index);
    for (const value of s.vertices) vertices.push(value);
    for (const value of s.uv) uv.push(value);
    for (const value of s.owners) owners.push(value);
  });
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('ownerKey', new THREE.Int32BufferAttribute(owners, 1)); geometry.computeVertexNormals();
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
export function fixedAnchorPoints(cells: Cell[], exterior?: { width: number; height: number }): Point[] {
  if (!cells.some(c => c.fixed)) return [];
  return bodyContours(cells).flatMap(points => points.flatMap((p, i) => {
    if (exterior && (p.x === 0 || p.y === 0 || p.x === exterior.width || p.y === exterior.height)) return [];
    const prev = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
    const ax = Math.sign(p.x - prev.x), ay = Math.sign(p.y - prev.y), bx = Math.sign(next.x - p.x), by = Math.sign(next.y - p.y);
    return [{ x: p.x - (ay + by) * 0.24 - 0.5, y: p.y + (ax + bx) * 0.24 - 0.5 }];
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

export function bodyGeometry(cells: Cell[], height: number, exterior?: { width: number; height: number }): THREE.BufferGeometry {
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
  const shapes = exterior ? [new THREE.Shape([
    new THREE.Vector2(-exteriorHalfExtent - root.x, -exteriorHalfExtent + root.y), new THREE.Vector2(exteriorHalfExtent - root.x, -exteriorHalfExtent + root.y),
    new THREE.Vector2(exteriorHalfExtent - root.x, exteriorHalfExtent + root.y), new THREE.Vector2(-exteriorHalfExtent - root.x, exteriorHalfExtent + root.y),
  ])] : outers.map(p => path(p, new THREE.Shape()) as THREE.Shape);
  for (const hole of holes) {
    const points = path(hole, new THREE.Path()), test = hole[0];
    const owner = exterior ? 0 : outers.findIndex(p => {
      let inside = false;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i].y > test.y) !== (p[j].y > test.y) && test.x < (p[j].x - p[i].x) * (test.y - p[i].y) / (p[j].y - p[i].y) + p[i].x) inside = !inside;
      return inside;
    });
    if (owner >= 0) shapes[owner].holes.push(points);
  }
  const large = cells.length > 256;
  const geometry = new THREE.ExtrudeGeometry(shapes, { depth: height - 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: large ? 2 : 3, steps: 1, curveSegments: large ? 4 : 8 });
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, bodyBaseHeight + 0.03, 0);
  geometry.clearGroups(); geometry.addGroup(0, geometry.getAttribute('position').count, 0);
  if (uniform) return geometry;
  const mixed = partitionBodySurface(cells, geometry, exterior); geometry.dispose(); return mixed;
}

export function bodySurfaceGeometries(cells: Cell[], height: number, exterior?: { width: number; height: number }): { solid?: THREE.BufferGeometry; glass?: THREE.BufferGeometry } {
  const solid = bodyGeometry(cells, height, exterior);
  if (cells.every(c => c.storesHeat)) return { solid };
  if (cells.every(c => !c.storesHeat)) return { glass: solid };
  const glass = solid.clone(), groups = solid.groups;
  solid.groups = groups.filter(g => cells[g.materialIndex ?? 0].storesHeat);
  glass.groups = groups.filter(g => !cells[g.materialIndex ?? 0].storesHeat);
  return { solid, glass };
}

// Material partitions clip the rounded surface; they never create internal faces.
export function partitionBodySurface(cells: Cell[], surface: THREE.BufferGeometry, exterior?: { width: number; height: number }, owners?: ReadonlySet<number>): THREE.BufferGeometry {
  type Vertex = { p: THREE.Vector3; n: THREE.Vector3; uv: THREE.Vector2 };
  const root = cells[0], byPosition = new Map(cells.map((c, i) => [key(c), i]));
  const buckets = cells.map(() => ({ positions: [] as number[], normals: [] as number[], uv: [] as number[] }));
  const position = surface.getAttribute('position'), normal = surface.getAttribute('normal'), uv = surface.getAttribute('uv');
  const selected = owners && cells.filter((_, index) => owners.has(index));
  const exceptions = cells.length > 256 && !owners ? cells.flatMap((cell, index) => cell.storesHeat !== root.storesHeat || cell.temperature !== root.temperature ? [index] : []) : [];
  const regional = exceptions.length === 1;
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
    if (selected) {
      const minX = Math.min(position.getX(i), position.getX(i + 1), position.getX(i + 2)) + root.x;
      const maxX = Math.max(position.getX(i), position.getX(i + 1), position.getX(i + 2)) + root.x;
      const minY = Math.min(position.getZ(i), position.getZ(i + 1), position.getZ(i + 2)) + root.y;
      const maxY = Math.max(position.getZ(i), position.getZ(i + 1), position.getZ(i + 2)) + root.y;
      // Rim tubes stay within one cell of their owning contour segment.
      if (!selected.some(cell => cell.x + 1 >= minX && cell.x - 1 <= maxX && cell.y + 1 >= minY && cell.y - 1 <= maxY)) continue;
    }
    const triangle = [0, 1, 2].map(j => ({ p: new THREE.Vector3().fromBufferAttribute(position, i + j), n: new THREE.Vector3().fromBufferAttribute(normal, i + j), uv: new THREE.Vector2(uv.getX(i + j), uv.getY(i + j)) }));
    if (regional) {
      const index = exceptions[0], cell = cells[index], x = cell.x - root.x, z = cell.y - root.y;
      const middle = clip(clip(triangle, 'x', x - 0.5, 1), 'x', x + 0.5, -1);
      const polygons = [clip(triangle, 'x', x - 0.5, -1), clip(triangle, 'x', x + 0.5, 1),
        clip(middle, 'z', z - 0.5, -1), clip(middle, 'z', z + 0.5, 1), clip(clip(middle, 'z', z - 0.5, 1), 'z', z + 0.5, -1)];
      polygons.forEach((polygon, part) => {
        const bucket = buckets[part === 4 ? index : 0];
        for (let j = 1; j < polygon.length - 1; j++) {
          const vertices = [polygon[0], polygon[j], polygon[j + 1]];
          if (vertices[1].p.clone().sub(vertices[0].p).cross(vertices[2].p.clone().sub(vertices[0].p)).lengthSq() < 1e-16) continue;
          for (const vertex of vertices) {
            bucket.positions.push(vertex.p.x, vertex.p.y, vertex.p.z);
            const length = vertex.n.length() || 1;
            bucket.normals.push(vertex.n.x / length, vertex.n.y / length, vertex.n.z / length);
            bucket.uv.push(vertex.uv.x, vertex.uv.y);
          }
        }
      });
      continue;
    }
    const xs = triangle.map(v => v.p.x + root.x), zs = triangle.map(v => v.p.z + root.y);
    if (exterior) {
      const west = -root.x - 0.5, east = exterior.width - root.x - 0.5, north = -root.y - 0.5, south = exterior.height - root.y - 0.5;
      const middle = clip(clip(triangle, 'x', west, 1), 'x', east, -1);
      for (const polygon of [clip(triangle, 'x', west, -1), clip(triangle, 'x', east, 1), clip(middle, 'z', north, -1), clip(middle, 'z', south, 1)]) {
        for (let j = 1; j < polygon.length - 1; j++) for (const v of [polygon[0], polygon[j], polygon[j + 1]]) {
          buckets[0].positions.push(v.p.x, v.p.y, v.p.z); buckets[0].normals.push(v.n.x, v.n.y, v.n.z); buckets[0].uv.push(v.uv.x, v.uv.y);
        }
      }
    }
    for (let y = Math.max(exterior ? 0 : -Infinity, Math.floor(Math.min(...zs) + 0.5)); y <= Math.min(exterior ? exterior.height - 1 : Infinity, Math.floor(Math.max(...zs) + 0.5)); y++) {
      for (let x = Math.max(exterior ? 0 : -Infinity, Math.floor(Math.min(...xs) + 0.5)); x <= Math.min(exterior ? exterior.width - 1 : Infinity, Math.floor(Math.max(...xs) + 0.5)); x++) {
        let polygon = clip(triangle, 'x', x - root.x - 0.5, 1);
        polygon = clip(polygon, 'x', x - root.x + 0.5, -1);
        polygon = clip(polygon, 'z', y - root.y - 0.5, 1);
        polygon = clip(polygon, 'z', y - root.y + 0.5, -1);
        if (polygon.length < 3) continue;
        const center = polygon.reduce((sum, v) => sum.add(v.p), new THREE.Vector3()).multiplyScalar(1 / polygon.length);
        const index = byPosition.get(`${x},${y}`) ?? cells.reduce((best, c, j) =>
          Math.hypot(c.x - root.x - center.x, c.y - root.y - center.z) < Math.hypot(cells[best].x - root.x - center.x, cells[best].y - root.y - center.z) ? j : best, 0);
        if (owners && !owners.has(index)) continue;
        const bucket = buckets[index];
        for (let j = 1; j < polygon.length - 1; j++) {
          const vertices = [polygon[0], polygon[j], polygon[j + 1]];
          if (vertices[1].p.clone().sub(vertices[0].p).cross(vertices[2].p.clone().sub(vertices[0].p)).lengthSq() < 1e-16) continue;
          for (const v of vertices) {
            bucket.positions.push(v.p.x, v.p.y, v.p.z);
            const length = v.n.length() || 1;
            bucket.normals.push(v.n.x / length, v.n.y / length, v.n.z / length);
            bucket.uv.push(v.uv.x, v.uv.y);
          }
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry(), positions: number[] = [], normals: number[] = [], coordinates: number[] = [];
  if (regional) geometry.userData.materialRegions = true;
  buckets.forEach((b, i) => {
    if (b.positions.length) geometry.addGroup(positions.length / 3, b.positions.length / 3, i);
    for (const value of b.positions) positions.push(value);
    for (const value of b.normals) normals.push(value);
    for (const value of b.uv) coordinates.push(value);
  });
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(coordinates, 2));
  return geometry;
}
