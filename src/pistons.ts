import type { Cell, Direction, Level, Piston, State, TurnFrame } from './types';
import { bodies, directions, positionKey, transferHeat } from './engine';

export function pushPlan(level: Level, state: State, x: number, y: number, direction: Direction, forcePlayers = false, ignoredPlayer = -1, ignoredCells = new Set<number>()): { cells: Set<number>; players: Set<number> } | null {
  const delta = directions[direction], groups = bodies(state.cells), cellGroups = new Map<number, Cell[]>();
  groups.forEach(g => g.forEach(c => cellGroups.set(c.key, g)));
  const lookup = new Map(state.cells.filter(c => !ignoredCells.has(c.key)).map(c => [positionKey(c.x, c.y), c]));
  const cells = new Set<number>(), players = new Set<number>();
  function visit(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= level.width || ty >= level.height) return false;
    const obstacle = lookup.get(positionKey(tx, ty));
    if (obstacle && !cells.has(obstacle.key)) {
      const group = cellGroups.get(obstacle.key)!;
      if (group.some(c => c.fixed && !ignoredCells.has(c.key))) return false;
      if (group.some(c => !ignoredCells.has(c.key) && state.pistons?.some(p => p.expanded && p.headKey === c.key))) return false;
      group.forEach(c => { if (!ignoredCells.has(c.key)) cells.add(c.key); });
      for (const c of group) if (!ignoredCells.has(c.key) && !visit(c.x + delta.x, c.y + delta.y)) return false;
    }
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      if (i === ignoredPlayer || p.x !== tx || p.y !== ty || players.has(i)) continue;
      if (!forcePlayers) return false;
      players.add(i); if (!visit(tx + delta.x, ty + delta.y)) return false;
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

const signature = (s: State) => JSON.stringify([s.cells.map(c => [c.key, c.x, c.y, c.temperature]).sort((a, b) => a[0] - b[0]), s.players, s.pistons]);
export function captureFrame(state: State, phase: TurnFrame['phase']): TurnFrame {
  return structuredClone({ cells: state.cells, players: state.players, pistons: state.pistons ?? [], phase });
}
export function settleTurn(level: Level, state: State): void {
  if (!state.pistons?.length) { transferHeat(level, state); state.phase = 'ready'; return; }
  const frames = [captureFrame(state, 'motion')];
  transferHeat(level, state); frames.push(captureFrame(state, 'heat'));
  state.phase = 'ready'; const seen = new Set([signature(state)]);
  for (let step = 0; step < 128; step++) {
    const next = [...(state.pistons ?? [])].sort((a, b) => a.order - b.order).find(p => actuate(level, state, p));
    if (!next) { state.turnFrames = frames; return; }
    frames.push(captureFrame(state, 'motion')); transferHeat(level, state); frames.push(captureFrame(state, 'heat'));
    const current = signature(state);
    if (seen.has(current)) { state.phase = 'cycling'; state.turnFrames = frames; return; }
    seen.add(current);
  }
  state.phase = 'cycling'; state.turnFrames = frames;
}
