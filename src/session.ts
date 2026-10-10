import { availablePortals, canMoveDemon, cloneState, directions, edge, exposeOpenWelds, initialState, opposite, portalPlayers, syncExteriorTemperature } from './engine';
import type { Cell, Dataset, Demon, Direction, Level, State, World } from './types';
import { depth, descendants } from './topology';
import { portalUnlocked } from './level-labels';

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

export function startSession(data: Dataset): Session {
  const level = [data.root, data.hub, data.world].map(id => data.levels.find(l => l.id === id)).find(l => l !== undefined) ?? data.levels[0];
  if (!level) throw new Error('关卡目录为空。');
  return createSession(level);
}

export function selectSession(data: Dataset, level: Level, solved: string[] = [], visited: string[] = []): Session {
  const session = createSession(level, solved, visited), levels = new Map(data.levels.map(l => [l.id, l]));
  const seen = new Set([level.id]);
  for (let child = level; child.parentId; ) {
    const parent = levels.get(child.parentId); if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    const state = initialState(parent, new Set(solved)); state.players = [];
    const entrance = state.cells.find(c => c.portal?.target === child.id && !c.portal.shortcut); if (!entrance) break;
    const directionsBySpace = [2, 1, 0, 3].sort((a, b) => {
      const occupied = (direction: number) => state.cells.some(c => c.container === undefined && c.x === entrance.x - directions[direction].x && c.y === entrance.y - directions[direction].y);
      return Number(occupied(a)) - Number(occupied(b));
    }) as Direction[];
    const side = directionsBySpace.find(direction => {
      const probe = cloneState(state); probe.players = [{ x: entrance.x - directions[direction].x, y: entrance.y - directions[direction].y, temperature: 0 }];
      return portalPlayers(probe, entrance).length > 0;
    });
    if (side === undefined) break;
    session.entries[child.id] = { parentId: parent.id, portalKey: entrance.key, directions: [side] };
    session.states[parent.id] = state; session.baselines[parent.id] = cloneState(state);
    child = parent;
  }
  return session;
}

export function completeHierarchy(data: Dataset, session: Session): Session {
  const level = data.levels.find(l => l.id === session.current.levelId); if (!level) return session;
  const hierarchy = selectSession(data, level, session.solved, session.visited);
  const definitions = new Map(data.levels.map(l => [l.id, l]));
  const restorePortals = (state: State): State => {
    const source = definitions.get(state.levelId); if (!source) return state;
    const restoredState = { ...state, cells: state.cells.map(cell => {
      const definition = source.cells[cell.key]; if (!definition) return cell;
      const restored = { ...cell }; delete restored.portal;
      if (definition.portal) restored.portal = structuredClone(definition.portal);
      return restored;
    }) };
    exposeOpenWelds(source, restoredState); return restoredState;
  };
  const restoreRooms = (rooms: Record<string, State>) => Object.fromEntries(Object.entries(rooms).map(([id, state]) => [id, restorePortals(state)]));
  return { ...session, current: restorePortals(session.current),
    entries: { ...hierarchy.entries, ...session.entries },
    states: restoreRooms({ ...hierarchy.states, ...session.states }),
    baselines: restoreRooms({ ...hierarchy.baselines, ...session.baselines }),
    hints: session.hints.map(frame => ({ ...frame, state: restorePortals(frame.state) })),
  };
}

export function recordState(session: Session, state: State, level: Level): void {
  session.current = state; session.states[state.levelId] = cloneState(state);
  if (state.solved && level.category !== 'hint' && level.category !== 'lab' && !session.solved.includes(level.id)) session.solved.push(level.id);
}

export function unlockedWorlds(data: Dataset, _solved: Iterable<string>): World[] {
  const worlds = data.worlds ?? [{ id: data.world, index: 1, title: '温度的世界', description: '冷与热之间，寻找平衡。', supported: true }];
  return worlds.filter(world => world.supported);
}

export function portalCandidates(data: Dataset, session: Session): Cell[] {
  const levels = new Map(data.levels.map(l => [l.id, l])), worlds = new Set(unlockedWorlds(data, session.solved).map(w => w.id)), visited = new Set(session.visited);
  return availablePortals(session.current).filter(c => {
    const target = levels.get(c.portal!.target);
    return target && (!target.worldId || worlds.has(target.worldId)) && portalUnlocked(c, visited);
  }).sort((a, b) => levels.get(a.portal!.target)!.label.localeCompare(levels.get(b.portal!.target)!.label, undefined, { numeric: true }));
}

export function destroyCells(state: State, keys: Set<number>): void {
  for (const key of [...keys]) descendants(state, key).cells.forEach(c => keys.add(c.key));
  const removed = state.cells.filter(c => keys.has(c.key));
  for (const cell of state.cells) {
    if (keys.has(cell.key)) continue;
    directions.forEach((d, dir) => {
      if (edge(cell, dir) === 0 && removed.some(c => c.container === cell.container && c.x === cell.x + d.x && c.y === cell.y + d.y && edge(c, opposite(dir)) === 0)) cell.edges |= 3 << (dir * 2);
    });
  }
  state.cells = state.cells.filter(c => !keys.has(c.key));
  state.players = state.players.filter(p => p.container === undefined || !keys.has(p.container));
  state.pistons = state.pistons?.filter(p => !keys.has(p.baseKey));
}

function spawn(state: State, players: Demon[]): void {
  destroyCells(state, new Set(state.cells.filter(c => players.some(p => p.x === c.x && p.y === c.y && p.container === c.container)).map(c => c.key)));
  for (const p of players) if (!state.players.some(existing => existing.x === p.x && existing.y === p.y && existing.container === p.container)) state.players.push(p);
  state.frozen = state.players.every(p => !canMoveDemon(p));
}

export function resetState(current: State, baseline: State, solved: string[]): State {
  const restored = cloneState(baseline), retainedCells = current.cells.filter(c => c.temperature === 2), retainedPlayers = current.players.filter(p => p.temperature === 2);
  const retainedKeys = new Set(retainedCells.map(c => c.key)), playerKeys = new Set(retainedPlayers.map(p => p.key));
  const pistons = [...(baseline.pistons ?? []).filter(p => !retainedKeys.has(p.baseKey)), ...(current.pistons ?? []).filter(p => retainedKeys.has(p.baseKey))];
  const candidates = [
    ...baseline.cells.filter(c => !retainedKeys.has(c.key)).map(c => ({ object: structuredClone(c), depth: depth(c, baseline.cells), retained: false, player: false })),
    ...baseline.players.filter(p => p.key === undefined || !playerKeys.has(p.key)).map(p => ({ object: structuredClone(p), depth: depth(p, baseline.cells), retained: false, player: true })),
    ...retainedCells.map(c => ({ object: structuredClone(c), depth: depth(c, current.cells), retained: true, player: false })),
    ...retainedPlayers.map(p => ({ object: structuredClone(p), depth: depth(p, current.cells), retained: true, player: true })),
  ].sort((a, b) => Number(b.retained) - Number(a.retained) || a.depth - b.depth);
  restored.cells = []; restored.players = [];
  const positions = new Map<string, Map<number, typeof candidates[number]>>();
  const compressed = (candidate: typeof candidates[number]) => !candidate.player && pistons.some(p => p.baseKey === (candidate.object as Cell).key && p.model === 'boundary' && !p.expanded);
  for (const candidate of candidates) {
    const { object, depth: layer } = candidate, coordinate = `${object.x},${object.y}`;
    const at = positions.get(coordinate) ?? new Map<number, typeof candidate>();
    if (at.has(layer) || [...at].some(([d, occupant]) => d < layer && !compressed(occupant) || d > layer && !compressed(candidate))) continue;
    at.set(layer, candidate); positions.set(coordinate, at);
  }
  for (const at of positions.values()) {
    let parent: typeof candidates[number] | undefined;
    for (const candidate of [...at.values()].sort((a, b) => a.depth - b.depth)) {
      const { object, player } = candidate;
      if (parent) object.container = (parent.object as Cell).key; else delete object.container;
      if (player) restored.players.push(object as Demon); else restored.cells.push(object as Cell);
      parent = candidate;
    }
  }
  restored.cells.sort((a, b) => a.key - b.key);
  restored.pistons = structuredClone(pistons.filter(p => restored.cells.some(c => c.key === p.baseKey)));
  for (const c of restored.cells) if (c.portal && solved.includes(c.portal.target) && !retainedKeys.has(c.key)) Object.assign(c, c.portal.after);
  restored.solved = false; restored.phase = 'ready'; restored.frozen = restored.players.every(p => !canMoveDemon(p));
  return restored;
}

export function resetSession(session: Session): Session {
  const next = structuredClone(session), id = next.current.levelId;
  next.current = resetState(next.current, next.baselines[id], next.solved); next.states[id] = cloneState(next.current);
  return next;
}

function initializeRooms(data: Dataset, session: Session): void {
  for (const id of Object.keys(session.states)) {
    const level = data.levels.find(l => l.id === id); if (!level) continue;
    const state = initialState(level, new Set(session.solved)); state.players = [];
    session.states[id] = state; session.baselines[id] = cloneState(state);
  }
}

export function enterPortal(data: Dataset, session: Session, targetId?: string): Session | null {
  if (session.current.solved || session.current.frozen || session.current.phase === 'cycling') return null;
  const portal = portalCandidates(data, session).find(c => !targetId || c.portal!.target === targetId); if (!portal) return null;
  const next = structuredClone(session), levels = new Map(data.levels.map(l => [l.id, l])), target = levels.get(portal.portal!.target)!;
  const entrances = portalCandidates(data, next).filter(c => c.portal!.target === target.id);
  const entering = [...new Set(entrances.flatMap(c => portalPlayers(next.current, c)))];
  const sides = [...new Set(entrances.flatMap(c => portalPlayers(next.current, c).map(p => directions.findIndex(d => d.x === c.x - p.x && d.y === c.y - p.y) as Direction)))];
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
  const heat = entrances.reduce((sum, c) => sum + (c.temperature === 2 ? 0 : c.temperature), 0);
  state.outside = heat ? Math.sign(heat) as State['outside'] : entrances.some(c => c.temperature === 2) ? 2 : 0;
  state.solved = false; state.phase = 'ready'; state.transient = true;
  syncExteriorTemperature(target, state);
  next.serial++;
  spawn(state, target.players.map((p, i) => ({ ...p, temperature: p.temperature ?? 0, key: `${target.id}:${next.serial}:${i}` })));
  next.current = state; next.states[target.id] = cloneState(state); next.baselines[target.id] = cloneState(state);
  if (!next.visited.includes(target.id)) next.visited.push(target.id);
  return next;
}

export function exitLevel(data: Dataset, session: Session): Session | null {
  const next = structuredClone(session), hint = next.hints.at(-1);
  if (hint?.levelId === next.current.levelId) {
    const source = data.levels.find(l => l.id === hint.state.levelId); if (!source) return null;
    next.hints.pop();
    next.current = initialState(source, new Set(next.solved));
    next.serial++;
    next.current.players.forEach((p, i) => { p.key = `${source.id}:${next.serial}:${i}`; });
    initializeRooms(data, next);
    next.states[source.id] = cloneState(next.current); next.baselines[source.id] = cloneState(next.current);
    return next;
  }
  const entry = next.entries[next.current.levelId]; if (!entry) return null;
  const remaining = structuredClone(next.states[entry.parentId]?.players ?? []);
  initializeRooms(data, next);
  const parent = next.states[entry.parentId], parentLevel = data.levels.find(l => l.id === entry.parentId);
  if (!parent || !parentLevel) return null;
  const portal = parent.cells.find(c => c.key === entry.portalKey) ?? parentLevel.cells.map((c, key) => ({ ...c, key })).find(c => c.key === entry.portalKey);
  if (!portal) return null;
  parent.players = [];
  parent.outside = 0; parent.solved = false;
  syncExteriorTemperature(parentLevel, parent);
  spawn(parent, [...remaining, ...entry.directions.map((direction, i) => ({ x: portal.x - directions[direction].x, y: portal.y - directions[direction].y, temperature: 0 as const, key: `${parent.levelId}:exit:${++next.serial}:${i}` }))]);
  next.states[next.current.levelId].players = [];
  next.current = cloneState(parent);
  next.baselines[parent.levelId] = cloneState(parent);
  return next;
}

export function enterHint(data: Dataset, session: Session, id: string): Session | null {
  if (session.current.solved || session.current.frozen || session.current.phase === 'cycling') return null;
  const level = data.levels.find(l => l.id === id); if (!level) return null;
  const next = structuredClone(session); next.hints.push({ state: cloneState(next.current), levelId: id });
  next.current.players.forEach(p => { if (canMoveDemon(p)) p.awake = false; });
  next.states[next.current.levelId] = cloneState(next.current);
  next.current = initialState(level, new Set(next.solved), next.current.outside); next.serial++;
  next.current.players.forEach((p, i) => { p.key = `${id}:${next.serial}:${i}`; });
  next.states[id] = cloneState(next.current); next.baselines[id] = cloneState(next.current);
  return next;
}
