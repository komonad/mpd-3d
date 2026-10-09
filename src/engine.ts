import type { Cell, Direction, Level, State, Temperature } from './types';
import { applyPush, passiveCompression, pushPlan, settleTurn } from './pistons';

// Edge pairs are ordered west, south, east, north in the MXW stream.
export const directions = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }];
export const edge = (cell: Cell, direction: number) => (cell.edges >> (direction * 2)) & 3;
export const opposite = (direction: number) => (direction + 2) % 4;
export const positionKey = (x: number, y: number) => `${x},${y}`;
export const cloneState = (state: State): State => { const { turnFrames: _, ...rest } = state; return structuredClone(rest); };

export function initialState(level: Level, solved: Set<string> = new Set(), outside: Temperature = 0): State {
  const cells = level.cells.map((c, key) => ({ ...structuredClone(c), ...(c.portal && solved.has(c.portal.target) ? c.portal.after : {}), key }));
  const players = level.players.map(p => ({ ...p, temperature: p.temperature ?? 0 }));
  return { levelId: level.id, cells, players, outside, moves: 0, pushes: 0, solved: false, frozen: players.every(p => p.temperature === 1), pistons: structuredClone(level.pistons ?? []), phase: 'ready' };
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
    const sum = component.reduce((s, c) => s + (c.storesHeat && c.temperature !== 2 ? c.temperature : 0), 0);
    const retentive = component.some(c => c.storesHeat && c.temperature === 2);
    const balance: Temperature = sum ? Math.sign(sum) as Temperature : retentive || outside && state.outside === 2 ? 2 : 0;
    const temperature: Temperature = outside && state.outside !== 2 ? state.outside : balance;
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
  if (state.solved || state.frozen || state.phase === 'cycling') return null;
  const next = cloneState(state), d = directions[direction];
  let didMove = false, pushed = false;
  const order = next.players.map((p, i) => ({ i, distance: p.x * d.x + p.y * d.y })).sort((a, b) => b.distance - a.distance || a.i - b.i);
  const movedCells = new Set<number>();
  for (const { i: index } of order) {
    const player = next.players[index];
    if (player.temperature === 1) continue;
    const x = player.x + d.x, y = player.y + d.y;
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
    const target = next.cells.find(c => c.x === x && c.y === y);
    if (target && passiveCompression(level, next, target, direction)) pushed = true;
    else {
      const plan = pushPlan(level, next, x, y, direction, false, index); if (!plan) continue;
      if ([...plan.cells].some(key => movedCells.has(key))) continue;
      applyPush(next, plan, direction); plan.cells.forEach(key => movedCells.add(key)); if (plan.cells.size) pushed = true;
    }
    player.x = x; player.y = y; didMove = true;
  }
  if (!didMove) return null;
  next.moves++; if (pushed) next.pushes++;
  settleTurn(level, next);
  next.solved = next.phase === 'ready' && isSolved(level, next);
  return next;
}

export function availablePortals(state: State): Cell[] {
  return state.cells.filter(c => c.portal && state.players.some(p => p.temperature !== 1 && Math.abs(p.x - c.x) + Math.abs(p.y - c.y) === 1));
}
