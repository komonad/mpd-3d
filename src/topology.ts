import type { Cell, Demon, Direction, Piston, State } from './types';

export const directions = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }];
export const edge = (cell: { edges: number }, direction: number) => (cell.edges >> (direction * 2)) & 3;
export const opposite = (direction: number) => (direction + 2) % 4;
export const positionKey = (x: number, y: number) => `${x},${y}`;
export const address = (p: { x: number; y: number; container?: number }) => `${p.container ?? 'root'}:${p.x},${p.y}`;
export const boundaryPiston = (state: State, key: number): Piston | undefined => state.pistons?.find(p => p.model === 'boundary' && p.baseKey === key);

export function depth(object: { container?: number }, cells: Cell[]): number {
  const seen = new Set<number>();
  for (let key = object.container; key !== undefined && !seen.has(key); key = cells.find(c => c.key === key)?.container) seen.add(key);
  return seen.size;
}

export function descendants(state: State, key: number): { cells: Cell[]; players: Demon[] } {
  const keys = new Set([key]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of state.cells) if (c.container !== undefined && keys.has(c.container) && !keys.has(c.key)) { keys.add(c.key); changed = true; }
  }
  return { cells: state.cells.filter(c => c.key !== key && keys.has(c.key)), players: state.players.filter(p => p.container !== undefined && keys.has(p.container)) };
}

export interface Contact { a: number; b: number; direction: Direction; internal: boolean }
export function contacts(cells: Cell[], pistons: Piston[] = []): Contact[] {
  const lookup = new Map(cells.map(c => [address(c), c]));
  const pistonMap = new Map(pistons.filter(p => p.model === 'boundary').map(p => [p.baseKey, p]));
  const result: Contact[] = [];
  const add = (a: Cell, b: Cell, direction: number, internal = false) => result.push({ a: a.key, b: b.key, direction: direction as Direction, internal });
  const exposed = (cell: Cell, direction: number): Cell | undefined => {
    const seen = new Set<number>();
    for (;;) {
      const p = pistonMap.get(cell.key);
      if (!p || p.expanded || p.direction !== direction) return cell;
      if (seen.has(cell.key)) return undefined;
      seen.add(cell.key);
      const content = lookup.get(address({ x: cell.x, y: cell.y, container: cell.key }));
      if (!content) return undefined;
      cell = content;
    }
  };
  for (const a of cells) {
    const parent = a.container === undefined ? undefined : cells.find(c => c.key === a.container);
    if (parent) {
      const p = pistonMap.get(parent.key);
      if (p) {
        add(parent, a, p.direction, true);
        const d = directions[p.direction];
        const front = lookup.get(address({ x: parent.x + d.x, y: parent.y + d.y, container: parent.container }));
        const surface = front && exposed(front, opposite(p.direction));
        const contentSurface = exposed(a, p.direction);
        if (contentSurface && surface) add(contentSurface, surface, p.direction);
      }
    }
    directions.forEach((d, dir) => {
      const b = lookup.get(address({ x: a.x + d.x, y: a.y + d.y, container: a.container }));
      if (!b || a.key >= b.key) return;
      const left = exposed(a, dir), right = exposed(b, opposite(dir));
      if (left && right) add(left, right, dir);
    });
  }
  return result;
}
