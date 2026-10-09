import { availablePortals, cloneState, directions, edge, initialState, opposite } from './engine';
import type { Cell, Dataset, Demon, Direction, Level, State, World } from './types';

export interface Entry { parentId: string; portalKey: number; directions: Direction[] }
export interface HintFrame { state: State; levelId: string }
export interface Session {
  current: State; solved: string[]; visited: string[];
  states: Record<string, State>; baselines: Record<string, State>;
  entries: Record<string, Entry>; hints: HintFrame[]; serial: number;
}

export function createSession(level: Level, solved: string[] = [], visited: string[] = []): Session {
  const current = initialState(level, new Set(solved));
  current.players.forEach((p, i) => { p.key = `${level.id}:0:${i}`; });
  return { current, solved: [...solved], visited: [...new Set([...visited, level.id])], states: { [level.id]: cloneState(current) }, baselines: { [level.id]: cloneState(current) }, entries: {}, hints: [], serial: 0 };
}

export function recordState(session: Session, state: State, level: Level): void {
  session.current = state; session.states[state.levelId] = cloneState(state);
  if (state.solved && level.category !== 'hint' && level.category !== 'lab' && !session.solved.includes(level.id)) session.solved.push(level.id);
}

export function unlockedWorlds(data: Dataset, solved: Iterable<string>): World[] {
  const completed = new Set(solved), worlds = data.worlds ?? [{ id: data.world, index: 1, title: '温度的世界', description: '冷与热之间，寻找平衡。', supported: true }];
  let unlocked = true;
  return worlds.filter((world, i) => {
    if (i) {
      const previous = worlds[i - 1], puzzles = data.levels.filter(l => l.worldId === previous.id && l.category === 'main');
      unlocked &&= completed.has(previous.id) || (puzzles.length > 0 && puzzles.every(l => completed.has(l.id)));
    }
    return unlocked && world.supported;
  });
}

export function portalCandidates(data: Dataset, session: Session): Cell[] {
  const levels = new Map(data.levels.map(l => [l.id, l])), worlds = new Set(unlockedWorlds(data, session.solved).map(w => w.id));
  return availablePortals(session.current).filter(c => {
    const target = levels.get(c.portal!.target);
    return target && (!target.worldId || worlds.has(target.worldId)) && (!c.portal!.shortcut || session.visited.includes(target.id));
  }).sort((a, b) => levels.get(a.portal!.target)!.label.localeCompare(levels.get(b.portal!.target)!.label, undefined, { numeric: true }));
}

export function destroyCells(state: State, keys: Set<number>): void {
  const removed = state.cells.filter(c => keys.has(c.key));
  for (const cell of state.cells) {
    if (keys.has(cell.key)) continue;
    directions.forEach((d, dir) => {
      if (edge(cell, dir) === 0 && removed.some(c => c.x === cell.x + d.x && c.y === cell.y + d.y && edge(c, opposite(dir)) === 0)) cell.edges |= 3 << (dir * 2);
    });
  }
  state.cells = state.cells.filter(c => !keys.has(c.key));
  state.pistons = state.pistons?.filter(p => !keys.has(p.baseKey));
}

function spawn(state: State, players: Demon[]): void {
  destroyCells(state, new Set(state.cells.filter(c => players.some(p => p.x === c.x && p.y === c.y)).map(c => c.key)));
  for (const p of players) if (!state.players.some(existing => existing.x === p.x && existing.y === p.y)) state.players.push(p);
  state.frozen = state.players.every(p => p.temperature === 1);
}

export function resetState(current: State, baseline: State, solved: string[]): State {
  const restored = cloneState(baseline), retainedCells = current.cells.filter(c => c.temperature === 2), retainedPlayers = current.players.filter(p => p.temperature === 2);
  const occupied = (x: number, y: number) => [...retainedCells, ...retainedPlayers].some(p => p.x === x && p.y === y);
  const retainedKeys = new Set(retainedCells.map(c => c.key)), playerKeys = new Set(retainedPlayers.map(p => p.key));
  destroyCells(restored, new Set(restored.cells.filter(c => retainedKeys.has(c.key) || occupied(c.x, c.y)).map(c => c.key)));
  restored.cells.push(...structuredClone(retainedCells));
  restored.players = restored.players.filter(p => !(p.key !== undefined && playerKeys.has(p.key)) && !occupied(p.x, p.y)).concat(structuredClone(retainedPlayers));
  restored.pistons = (restored.pistons ?? []).filter(p => restored.cells.some(c => c.key === p.baseKey));
  for (const p of current.pistons ?? []) if (retainedKeys.has(p.baseKey)) {
    restored.pistons = restored.pistons.filter(old => old.baseKey !== p.baseKey); restored.pistons.push(structuredClone(p));
  }
  for (const c of restored.cells) if (c.portal && solved.includes(c.portal.target) && !retainedKeys.has(c.key)) Object.assign(c, c.portal.after);
  restored.solved = false; restored.phase = 'ready'; restored.frozen = restored.players.every(p => p.temperature === 1);
  return restored;
}

export function resetSession(session: Session): Session {
  const next = structuredClone(session), id = next.current.levelId;
  next.current = resetState(next.current, next.baselines[id], next.solved); next.states[id] = cloneState(next.current);
  return next;
}

export function enterPortal(data: Dataset, session: Session, targetId?: string): Session | null {
  if (session.current.solved || session.current.frozen || session.current.phase === 'cycling') return null;
  const portal = portalCandidates(data, session).find(c => !targetId || c.portal!.target === targetId); if (!portal) return null;
  const next = structuredClone(session), levels = new Map(data.levels.map(l => [l.id, l])), target = levels.get(portal.portal!.target)!;
  const entering = next.current.players.filter(p => p.temperature !== 1 && Math.abs(p.x - portal.x) + Math.abs(p.y - portal.y) === 1);
  const sides = [...new Set(entering.map(p => directions.findIndex(d => d.x === portal.x - p.x && d.y === portal.y - p.y) as Direction))];
  next.current.players = next.current.players.filter(p => !entering.includes(p)); next.states[next.current.levelId] = cloneState(next.current);
  if (portal.portal!.shortcut) {
    // Shortcut exits follow the canonical hierarchy, with the entry side inherited at each intermediate level.
    for (let child: Level | undefined = target; child?.parentId; child = levels.get(child.parentId)) {
      const parent = levels.get(child.parentId)!;
      const parentState = next.states[parent.id] ?? initialState(parent, new Set(next.solved));
      const entrance = parentState.cells.find(c => c.portal?.target === child!.id && !c.portal.shortcut);
      if (!entrance) return null;
      next.entries[child.id] = { parentId: parent.id, portalKey: entrance.key, directions: sides };
      next.baselines[parent.id] ??= cloneState(parentState);
      if (!next.states[parent.id]) { parentState.players = []; next.states[parent.id] = cloneState(parentState); }
      if (!next.visited.includes(parent.id)) next.visited.push(parent.id);
    }
  } else next.entries[target.id] = { parentId: next.current.levelId, portalKey: portal.key, directions: sides };
  const state = next.states[target.id] ? cloneState(next.states[target.id]) : initialState(target, new Set(next.solved));
  if (!next.states[target.id]) state.players = [];
  state.outside = portal.temperature; state.solved = false; state.phase = 'ready';
  next.serial++;
  spawn(state, target.players.map((p, i) => ({ ...p, temperature: p.temperature ?? 0, key: `${target.id}:${next.serial}:${i}` })));
  next.current = state; next.states[target.id] = cloneState(state); next.baselines[target.id] = cloneState(state);
  if (!next.visited.includes(target.id)) next.visited.push(target.id);
  return next;
}

export function exitLevel(data: Dataset, session: Session): Session | null {
  const next = structuredClone(session), hint = next.hints.at(-1);
  if (hint?.levelId === next.current.levelId) { next.hints.pop(); next.current = cloneState(hint.state); next.states[next.current.levelId] = cloneState(next.current); return next; }
  const entry = next.entries[next.current.levelId]; if (!entry) return null;
  const remaining = structuredClone(next.states[entry.parentId]?.players ?? []);
  for (const [id, current] of Object.entries(next.states)) next.states[id] = resetState(current, next.baselines[id], next.solved);
  const parent = next.states[entry.parentId], parentLevel = data.levels.find(l => l.id === entry.parentId);
  if (!parent || !parentLevel) return null;
  const portal = parent.cells.find(c => c.key === entry.portalKey) ?? parentLevel.cells.map((c, key) => ({ ...c, key })).find(c => c.key === entry.portalKey);
  if (!portal) return null;
  parent.players = remaining.map(p => parent.players.find(initial => initial.key === p.key) ?? p);
  parent.outside = 0; parent.solved = false;
  spawn(parent, entry.directions.map((direction, i) => ({ x: portal.x - directions[direction].x, y: portal.y - directions[direction].y, temperature: 0, key: `${parent.levelId}:exit:${++next.serial}:${i}` })));
  next.states[next.current.levelId].players = [];
  next.current = cloneState(parent);
  return next;
}

export function enterHint(data: Dataset, session: Session, id: string): Session | null {
  const level = data.levels.find(l => l.id === id); if (!level) return null;
  const next = structuredClone(session); next.hints.push({ state: cloneState(next.current), levelId: id });
  next.current = initialState(level, new Set(next.solved), next.current.outside); next.states[id] = cloneState(next.current); next.baselines[id] = cloneState(next.current);
  return next;
}
