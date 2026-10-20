import type { Cell, Direction, Level, State, Temperature } from './types';
import { applyPush, passiveCompression, pushPlan, settleTurn } from './pistons';
import { contacts, directions, edge, opposite, positionKey } from './topology';
import { moveBoundaryDemons } from './boundary-pistons';

// Edge pairs are ordered west, south, east, north in the MXW stream.
export { directions, edge, opposite, positionKey } from './topology';
export const cloneState = (state: State): State => {
  const { turnFrames: _, ...rest } = state;
  return {
    ...rest,
    cells: state.cells.map(cell => ({ ...cell, ...(cell.portal ? { portal: { ...cell.portal, before: { ...cell.portal.before }, after: { ...cell.portal.after } } } : {}) })),
    players: state.players.map(player => ({ ...player })),
    ...(state.pistons ? { pistons: state.pistons.map(piston => ({ ...piston, head: { ...piston.head } })) } : {}),
  };
};
export const canMoveDemon = (player: State['players'][number]): boolean => player.temperature !== 1 && player.awake !== false;

export function exposeOpenWelds(level: Pick<Level, 'width' | 'height'>, state: State, onlyKeys?: ReadonlySet<number>): void {
  const lookup = new Map(state.cells.filter(c => c.container === undefined).map(c => [`${c.x},${c.y}`, c]));
  const pistonKeys = new Set(state.pistons?.flatMap(p => [p.baseKey, p.headKey]));
  for (const c of state.cells) {
    if (c.container !== undefined || pistonKeys.has(c.key) || onlyKeys && !onlyKeys.has(c.key)) continue;
    for (const [dir, d] of directions.entries()) {
      if (edge(c, dir) !== 0) continue;
      const x = c.x + d.x, y = c.y + d.y;
      if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
      const neighbor = lookup.get(`${x},${y}`);
      if (neighbor && (pistonKeys.has(neighbor.key) || edge(neighbor, opposite(dir)) === 0)) continue;
      c.edges |= 3 << (dir * 2);
    }
  }
}

export function initialState(level: Level, solved: Set<string> = new Set(), outside: Temperature = 0): State {
  const cells = level.cells.map((c, key) => ({ ...structuredClone(c), ...(c.portal && solved.has(c.portal.target) ? c.portal.after : {}), key }));
  const players = level.players.map(p => ({ ...p, temperature: p.temperature ?? 0 }));
  const state: State = { levelId: level.id, cells, players, outside, moves: 0, pushes: 0, solved: false, frozen: players.every(p => !canMoveDemon(p)), pistons: structuredClone(level.pistons ?? []), phase: 'ready', transient: true };
  exposeOpenWelds(level, state); syncExteriorTemperature(level, state); return state;
}

export function bodies(cells: Cell[], pistons: State['pistons'] = []): Cell[][] {
  const links = new Map<number, Set<number>>(), lookup = new Map(cells.map(c => [c.key, c]));
  for (const contact of contacts(cells, pistons)) {
    const c = lookup.get(contact.a)!, n = lookup.get(contact.b)!;
    const a = edge(c, contact.direction), b = edge(n, opposite(contact.direction));
    const stickyInterior = contact.internal && ([0, 1, 2, 3].some(d => d !== contact.direction && d !== opposite(contact.direction) && (edge(c, d) === 3 || edge(n, d) === 3)));
    // Absent faces retain their external connections to housings and transparent neighbors.
    const housingJoin = !contact.internal && pistons?.some(p => p.model === 'boundary' && (p.baseKey === c.key && b === 0 || p.baseKey === n.key && a === 0));
    const transparentJoin = !contact.internal && (a === 0 || b === 0) && (!c.storesHeat || !n.storesHeat);
    if (contact.internal ? stickyInterior : a === 3 || b === 3 || housingJoin || transparentJoin || a === 0 && b === 0) {
      if (!links.has(c.key)) links.set(c.key, new Set());
      if (!links.has(n.key)) links.set(n.key, new Set());
      links.get(c.key)!.add(n.key); links.get(n.key)!.add(c.key);
    }
  }
  const visited = new Set<number>(), result: Cell[][] = [];
  for (const start of cells) {
    if (visited.has(start.key)) continue;
    const body = [start]; visited.add(start.key);
    for (let i = 0; i < body.length; i++) {
      for (const key of links.get(body[i].key) ?? []) if (!visited.has(key)) { visited.add(key); body.push(lookup.get(key)!); }
    }
    result.push(body);
  }
  return result;
}

export function exteriorKeys(level: Pick<Level, 'width' | 'height'>, state: State): Set<number> {
  const pistonKeys = new Set(state.pistons?.map(p => p.baseKey));
  const walls = state.cells.filter(c => c.container === undefined && !c.portal && !pistonKeys.has(c.key));
  // Only mutually absent faces identify the exterior's intrinsic cells; attached objects retain finite capacity.
  const lookup = new Map(walls.map(c => [positionKey(c.x, c.y), c])), seen = new Set<number>(), keys = new Set<number>();
  for (const start of walls) {
    if (seen.has(start.key)) continue;
    const group = [start]; seen.add(start.key);
    for (let i = 0; i < group.length; i++) for (const [dir, d] of directions.entries()) {
      const c = group[i], n = lookup.get(positionKey(c.x + d.x, c.y + d.y));
      if (!n || seen.has(n.key) || edge(c, dir) !== 0 || edge(n, opposite(dir)) !== 0) continue;
      seen.add(n.key); group.push(n);
    }
    if (group.some(c => c.fixed) && group.some(c => c.x === 0 || c.y === 0 || c.x === level.width - 1 || c.y === level.height - 1)) group.forEach(c => keys.add(c.key));
  }
  return keys;
}

export function syncExteriorTemperature(level: Pick<Level, 'width' | 'height'>, state: State): Set<number> {
  const keys = exteriorKeys(level, state);
  state.cells.forEach(c => { if (keys.has(c.key)) c.temperature = state.outside; });
  return keys;
}

export function transferHeat(level: Level, state: State): void {
  const infinite = syncExteriorTemperature(level, state);
  const nodes = [...state.cells, ...state.players.map((p, i) => ({ ...p, key: -(i + 1), fixed: false, edges: 0x55, storesHeat: false, heatCapacity: 0 }))];
  const byKey = new Map(nodes.map(c => [c.key, c]));
  const links = new Map<number, Set<number>>();
  for (const contact of contacts(nodes, state.pistons)) {
    const a = byKey.get(contact.a)!, b = byKey.get(contact.b)!;
    if (edge(a, contact.direction) === 2 || edge(b, opposite(contact.direction)) === 2) continue;
    if (!links.has(a.key)) links.set(a.key, new Set());
    if (!links.has(b.key)) links.set(b.key, new Set());
    links.get(a.key)!.add(b.key); links.get(b.key)!.add(a.key);
  }
  const seen = new Set<number>();
  for (const start of nodes) {
    if (seen.has(start.key)) continue;
    const component = [start]; seen.add(start.key);
    let outside = infinite.has(start.key);
    for (let i = 0; i < component.length; i++) {
      const c = component[i];
      outside ||= infinite.has(c.key);
      directions.forEach((d, dir) => {
        if (edge(c, dir) === 2) return;
        const x = c.x + d.x, y = c.y + d.y;
        if (c.container === undefined && (x < 0 || y < 0 || x >= level.width || y >= level.height)) { outside = true; return; }
      });
      for (const key of links.get(c.key) ?? []) if (!seen.has(key)) { seen.add(key); component.push(byKey.get(key)!); }
    }
    // Demons and transparent cells conduct heat without contributing to its balance.
    const sum = component.reduce((s, c) => s + (c.storesHeat && !infinite.has(c.key) && c.temperature !== 2 ? c.temperature * (c.heatCapacity ?? 1) : 0), 0);
    const retentive = component.some(c => c.storesHeat && !infinite.has(c.key) && c.temperature === 2);
    const balance: Temperature = sum ? Math.sign(sum) as Temperature : retentive ? 2 : 0;
    const temperature: Temperature = outside ? state.outside : balance;
    for (const c of component) {
      if (c.key < 0) {
        const player = state.players[-c.key - 1];
        if (player.temperature !== temperature && temperature === 1 && player.awake === false) player.awake = true;
        player.temperature = temperature;
      }
      else c.temperature = infinite.has(c.key) ? state.outside : temperature;
    }
  }
  state.frozen = state.players.every(p => !canMoveDemon(p));
}

export function isSolved(level: Level, state: State): boolean {
  return level.goals.length > 0 && level.goals.every(g => state.cells.some(c => c.storesHeat && c.x === g.x && c.y === g.y)) && state.players.some(p => p.temperature !== 1);
}

export function move(level: Level, state: State, direction: Direction): State | null {
  if (state.solved || state.frozen || state.phase === 'cycling') return null;
  const next = cloneState(state), d = directions[direction];
  if (next.pistons?.some(p => p.model === 'boundary')) {
    const result = moveBoundaryDemons(level, next, direction);
    if (!result.moved) return null;
    next.moves++; if (result.pushed) next.pushes++;
    settleTurn(level, next, state); next.solved = next.phase === 'ready' && isSolved(level, next);
    return next;
  }
  let didMove = false, pushed = false;
  const order = next.players.map((p, i) => ({ i, distance: p.x * d.x + p.y * d.y })).sort((a, b) => b.distance - a.distance || a.i - b.i);
  const movedCells = new Set<number>(), movedPlayers = new Set<number>();
  for (const { i: index } of order) {
    const player = next.players[index];
    if (!canMoveDemon(player) || movedPlayers.has(index)) continue;
    const x = player.x + d.x, y = player.y + d.y;
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
    const target = next.cells.find(c => c.x === x && c.y === y);
    if (target && passiveCompression(level, next, target, direction)) pushed = true;
    else {
      const plan = pushPlan(level, next, x, y, direction, false, index); if (!plan) continue;
      if ([...plan.cells].some(key => movedCells.has(key))) continue;
      applyPush(next, plan, direction); plan.cells.forEach(key => movedCells.add(key)); plan.players.forEach(i => movedPlayers.add(i)); if (plan.cells.size) pushed = true;
    }
    player.x = x; player.y = y; didMove = true;
  }
  if (!didMove) return null;
  next.moves++; if (pushed) next.pushes++;
  settleTurn(level, next, state);
  next.solved = next.phase === 'ready' && isSolved(level, next);
  return next;
}

export function availablePortals(state: State): Cell[] {
  const touching = portalDemonContacts(state);
  return state.cells.filter(c => c.portal && touching.has(c.key));
}

export function portalPlayers(state: State, portal: Cell) {
  return portalDemonContacts(state).get(portal.key) ?? [];
}

function portalDemonContacts(state: State): Map<number, State['players']> {
  const nodes = [...state.cells, ...state.players.map((p, i) => ({ ...p, key: -(i + 1), fixed: false, edges: 0x55, storesHeat: false }))];
  const touching = new Map<number, State['players']>();
  for (const contact of contacts(nodes, state.pistons)) {
    if (contact.internal || contact.a >= 0 && contact.b >= 0 || contact.a < 0 && contact.b < 0) continue;
    const key = Math.max(contact.a, contact.b), player = state.players[-Math.min(contact.a, contact.b) - 1];
    if (!canMoveDemon(player)) continue;
    const players = touching.get(key) ?? []; if (!players.includes(player)) players.push(player); touching.set(key, players);
  }
  return touching;
}
