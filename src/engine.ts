import type { Cell, Direction, Level, State, Temperature } from './types';

// Edge pairs are ordered west, south, east, north in the MXW stream.
export const directions = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }];
export const edge = (cell: Cell, direction: number) => (cell.edges >> (direction * 2)) & 3;
export const opposite = (direction: number) => (direction + 2) % 4;
export const positionKey = (x: number, y: number) => `${x},${y}`;
export const cloneState = (state: State): State => structuredClone(state);

export function initialState(level: Level, solved: Set<string> = new Set(), outside: Temperature = 0): State {
  const cells = level.cells.map((c, key) => ({ ...structuredClone(c), ...(c.portal && solved.has(c.portal.target) ? c.portal.after : {}), key }));
  return { levelId: level.id, cells, players: level.players.map(p => ({ ...p, temperature: 0 })), outside, moves: 0, pushes: 0, solved: false, frozen: false };
}

export function bodies(cells: Cell[]): Cell[][] {
  const lookup = new Map(cells.map(c => [positionKey(c.x, c.y), c]));
  const visited = new Set<number>(), result: Cell[][] = [];
  for (const start of cells) {
    if (visited.has(start.key)) continue;
    const body = [start]; visited.add(start.key);
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      directions.forEach((d, dir) => {
        const n = lookup.get(positionKey(c.x + d.x, c.y + d.y));
        if (!n || visited.has(n.key)) return;
        const a = edge(c, dir), b = edge(n, opposite(dir));
        if ((a === 0 && b === 0) || a === 3 || b === 3) { visited.add(n.key); body.push(n); }
      });
    }
    result.push(body);
  }
  return result;
}

export function transferHeat(level: Level, state: State): void {
  const nodes = [...state.cells, ...state.players.map((p, i) => ({ ...p, key: -(i + 1), fixed: false, edges: 0x55, storesHeat: false }))];
  const lookup = new Map(nodes.map(c => [positionKey(c.x, c.y), c]));
  const seen = new Set<number>();
  for (const start of nodes) {
    if (seen.has(start.key)) continue;
    const component = [start]; seen.add(start.key);
    let outside = false;
    for (let i = 0; i < component.length; i++) {
      const c = component[i];
      directions.forEach((d, dir) => {
        if (edge(c, dir) === 2) return;
        const x = c.x + d.x, y = c.y + d.y;
        if (x < 0 || y < 0 || x >= level.width || y >= level.height) { outside = true; return; }
        const n = lookup.get(positionKey(x, y));
        if (n && edge(n, opposite(dir)) !== 2 && !seen.has(n.key)) { seen.add(n.key); component.push(n); }
      });
    }
    // Demons and transparent cells conduct heat without contributing to its balance.
    const sum = component.reduce((s, c) => s + (c.storesHeat ? c.temperature : 0), 0);
    const temperature: Temperature = outside ? state.outside : Math.sign(sum) as Temperature;
    for (const c of component) {
      if (c.key < 0) state.players[-c.key - 1].temperature = temperature;
      else c.temperature = temperature;
    }
  }
  state.frozen = state.players.every(p => p.temperature === 1);
}

export function isSolved(level: Level, state: State): boolean {
  return level.goals.length > 0 && level.goals.every(g => state.cells.some(c => c.storesHeat && c.x === g.x && c.y === g.y)) && state.players.some(p => p.temperature !== 1);
}

export function move(level: Level, state: State, direction: Direction): State | null {
  if (state.solved || state.frozen) return null;
  const next = cloneState(state), d = directions[direction];
  const groups = bodies(next.cells), byKey = new Map<number, number>();
  groups.forEach((group, index) => group.forEach(c => byKey.set(c.key, index)));
  const lookup = new Map(next.cells.map(c => [positionKey(c.x, c.y), c]));
  const moved = new Set<number>();
  let didMove = false;
  for (const player of next.players) {
    if (player.temperature === 1) continue;
    const x = player.x + d.x, y = player.y + d.y;
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
    const target = lookup.get(positionKey(x, y));
    const planned = new Set<number>();
    function plan(groupId: number): boolean {
      if (planned.has(groupId)) return true;
      const group = groups[groupId];
      if (group.some(c => c.fixed)) return false;
      planned.add(groupId);
      for (const c of group) {
        const tx = c.x + d.x, ty = c.y + d.y;
        if (tx < 0 || ty < 0 || tx >= level.width || ty >= level.height) return false;
        const obstacle = lookup.get(positionKey(tx, ty));
        if (obstacle && byKey.get(obstacle.key) !== groupId && !plan(byKey.get(obstacle.key)!)) return false;
      }
      return true;
    }
    if (target && !plan(byKey.get(target.key)!)) continue;
    for (const index of planned) {
      if (moved.has(index)) continue;
      groups[index].forEach(c => { lookup.delete(positionKey(c.x, c.y)); });
    }
    for (const index of planned) {
      if (moved.has(index)) continue;
      groups[index].forEach(c => { c.x += d.x; c.y += d.y; lookup.set(positionKey(c.x, c.y), c); });
      moved.add(index);
    }
    player.x = x; player.y = y; didMove = true;
  }
  if (!didMove) return null;
  next.moves++; if (moved.size) next.pushes++;
  transferHeat(level, next);
  next.solved = isSolved(level, next);
  return next;
}

export function availablePortals(state: State): Cell[] {
  return state.cells.filter(c => c.portal && state.players.some(p => p.temperature !== 1 && Math.abs(p.x - c.x) + Math.abs(p.y - c.y) === 1));
}
