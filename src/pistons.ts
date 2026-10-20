import type { Cell, Direction, Level, Piston, State, TurnFrame } from './types';
import { bodies, canMoveDemon, cloneState, directions, exposeOpenWelds, positionKey, transferHeat } from './engine';
import { actuateBoundary } from './boundary-pistons';

export function pushPlan(level: Level, state: State, x: number, y: number, direction: Direction, forcePlayers = false, ignoredPlayer = -1, ignoredCells = new Set<number>()): { cells: Set<number>; players: Set<number> } | null {
  const delta = directions[direction];
  let cellGroups: Map<number, Cell[]> | undefined;
  const lookup = new Map(state.cells.filter(c => !ignoredCells.has(c.key)).map(c => [positionKey(c.x, c.y), c]));
  const cells = new Set<number>(), players = new Set<number>();
  function visit(tx: number, ty: number, displacePlayers = forcePlayers): boolean {
    if (tx < 0 || ty < 0 || tx >= level.width || ty >= level.height) return false;
    const obstacle = lookup.get(positionKey(tx, ty));
    if (obstacle && !cells.has(obstacle.key)) {
      if (obstacle.fixed) return false;
      if (!cellGroups) {
        cellGroups = new Map();
        bodies(state.cells).forEach(group => group.forEach(cell => cellGroups!.set(cell.key, group)));
      }
      const group = cellGroups.get(obstacle.key)!;
      if (group.some(c => c.fixed && !ignoredCells.has(c.key))) return false;
      if (group.some(c => !ignoredCells.has(c.key) && state.pistons?.some(p => p.expanded && p.headKey === c.key))) return false;
      group.forEach(c => { if (!ignoredCells.has(c.key)) cells.add(c.key); });
      for (const c of group) if (!ignoredCells.has(c.key) && !visit(c.x + delta.x, c.y + delta.y, true)) return false;
    }
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      if (i === ignoredPlayer || p.x !== tx || p.y !== ty || players.has(i)) continue;
      if (!displacePlayers && !canMoveDemon(p)) return false;
      players.add(i); if (!visit(tx + delta.x, ty + delta.y, displacePlayers)) return false;
    }
    return true;
  }
  return visit(x, y) ? { cells, players } : null;
}

export function applyPush(state: State, plan: NonNullable<ReturnType<typeof pushPlan>>, direction: Direction): void {
  const d = directions[direction];
  for (const c of state.cells) if (plan.cells.has(c.key)) { c.x += d.x; c.y += d.y; }
  plan.players.forEach(i => { state.players[i].x += d.x; state.players[i].y += d.y; });
}

export function passiveCompression(level: Level, state: State, head: Cell, direction: Direction): boolean {
  const piston = state.pistons?.find(p => p.expanded && p.headKey === head.key);
  if (!piston || direction !== (piston.direction + 2) % 4) return false;
  const base = state.cells.find(c => c.key === piston.baseKey);
  if (!base || !base.fixed) return false;
  const attached = bodies(state.cells).find(b => b.some(c => c.key === head.key))!.filter(c => c.key !== head.key);
  if (attached.some(c => c.fixed)) return false;
  const d = directions[direction], ignored = new Set([head.key]);
  const plans = attached.map(c => pushPlan(level, state, c.x + d.x, c.y + d.y, direction, false, -1, ignored));
  if (plans.some(p => !p)) return false;
  if (attached.length) {
    const cells = new Set(attached.map(c => c.key)), players = new Set<number>();
    plans.forEach(p => { p!.cells.forEach(k => cells.add(k)); p!.players.forEach(k => players.add(k)); });
    applyPush(state, { cells, players }, direction);
  }
  piston.head = { fixed: head.fixed, storesHeat: head.storesHeat, temperature: head.temperature, edges: head.edges };
  piston.expanded = false; state.cells = state.cells.filter(c => c.key !== head.key);
  if (base.storesHeat && base.temperature === 0) base.temperature = 1;
  return true;
}

function actuate(level: Level, state: State, piston: Piston): boolean {
  if (piston.model === 'boundary') return actuateBoundary(level, state, piston);
  const base = state.cells.find(c => c.key === piston.baseKey);
  // The thermal actuator uses the anchored housing as its mechanical reference.
  if (!base?.fixed) return false;
  const d = directions[piston.direction];
  if (!piston.expanded && base.temperature === 1) {
    const plan = pushPlan(level, state, base.x + d.x, base.y + d.y, piston.direction, true);
    if (!plan) return false;
    applyPush(state, plan, piston.direction);
    state.cells.push({ ...piston.head, key: piston.headKey, x: base.x + d.x, y: base.y + d.y });
    piston.expanded = true; base.temperature = 0; return true;
  }
  if (piston.expanded && base.temperature === -1) {
    const head = state.cells.find(c => c.key === piston.headKey); if (!head) return false;
    const attached = bodies(state.cells).find(b => b.some(c => c.key === head.key))!.filter(c => c.key !== head.key);
    if (attached.some(c => c.fixed)) return false;
    const reverse = ((piston.direction + 2) % 4) as Direction;
    const ignored = new Set([head.key]);
    const plans = attached.map(c => pushPlan(level, state, c.x - d.x, c.y - d.y, reverse, true, -1, ignored));
    if (plans.some(p => !p)) return false;
    if (attached.length) {
      const cells = new Set(attached.map(c => c.key)), players = new Set<number>();
      plans.forEach(p => { p!.cells.forEach(k => cells.add(k)); p!.players.forEach(k => players.add(k)); });
      applyPush(state, { cells, players }, reverse);
    }
    piston.head = { fixed: head.fixed, storesHeat: head.storesHeat, temperature: head.temperature, edges: head.edges };
    state.cells = state.cells.filter(c => c.key !== piston.headKey); piston.expanded = false; base.temperature = 0; return true;
  }
  return false;
}

const signature = (s: State) => JSON.stringify([s.cells.map(c => [c.key, c.x, c.y, c.temperature, c.container ?? -1]).sort((a, b) => a[0] - b[0]), s.players, s.pistons]);
export function captureFrame(state: State, phase: TurnFrame['phase']): TurnFrame {
  const { cells, players, pistons } = cloneState(state);
  return { cells, players, pistons: pistons ?? [], phase };
}
export function settleTurn(level: Level, state: State, beforeMotion?: State): void {
  state.transient = false;
  const inventoryKeys = new Set(level.cells.flatMap((c, key) => c.container === undefined ? [] : [key]));
  for (const c of beforeMotion?.cells ?? []) if (c.container !== undefined) inventoryKeys.add(c.key);
  for (const c of state.cells) if (c.container !== undefined) inventoryKeys.add(c.key);
  exposeOpenWelds(level, state, inventoryKeys);
  const frames = [captureFrame(state, 'motion')];
  transferHeat(level, state); frames.push(captureFrame(state, 'heat'));
  if (!state.pistons?.length) { state.phase = 'ready'; state.turnFrames = frames; return; }
  state.phase = 'ready'; const seen = new Set([signature(state)]);
  for (let step = 0; step < 128; step++) {
    for (const c of state.cells) if (c.container !== undefined) inventoryKeys.add(c.key);
    const next = [...(state.pistons ?? [])].sort((a, b) => a.order - b.order).find(p => actuate(level, state, p));
    if (!next) { state.turnFrames = frames; return; }
    exposeOpenWelds(level, state, inventoryKeys);
    frames.push(captureFrame(state, 'motion')); transferHeat(level, state); frames.push(captureFrame(state, 'heat'));
    const current = signature(state);
    if (seen.has(current)) { state.phase = 'cycling'; state.turnFrames = frames; return; }
    seen.add(current);
  }
  state.phase = 'cycling'; state.turnFrames = frames;
}
