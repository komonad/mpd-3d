import type { Cell, Demon, Direction, Level, Piston, State } from './types';
import { bodies, canMoveDemon, cloneState } from './engine';
import { address, boundaryPiston, contacts, descendants, directions, edge, opposite } from './topology';

type Entity = Cell | Demon;
interface Destination { x: number; y: number; container?: number }

function supportDistances(level: Level, state: State, direction: Direction): Map<number, number> {
  const groups = bodies(state.cells, state.pistons), groupByKey = new Map(groups.flatMap((group, i) => group.map(c => [c.key, i] as const)));
  const dependents = new Map<number, Set<number>>(), distances = new Map<number, number>(), queue: number[] = [];
  const link = (support: number, dependent: number) => {
    if (!dependents.has(support)) dependents.set(support, new Set());
    dependents.get(support)!.add(dependent);
  };
  for (const c of state.cells) {
    const d = directions[direction], x = c.x + d.x, y = c.y + d.y;
    if (c.fixed || c.container === undefined && (x < 0 || y < 0 || x >= level.width || y >= level.height)) { distances.set(c.key, 0); queue.push(c.key); }
  }
  for (const contact of contacts(state.cells, state.pistons)) {
    if (groupByKey.get(contact.a) === groupByKey.get(contact.b)) { link(contact.a, contact.b); link(contact.b, contact.a); }
    else if (!contact.internal) {
      if (contact.direction === direction) link(contact.b, contact.a);
      else if (opposite(contact.direction) === direction) link(contact.a, contact.b);
    }
  }
  for (let i = 0; i < queue.length; i++) for (const key of dependents.get(queue[i]) ?? []) {
    if (distances.has(key)) continue;
    distances.set(key, distances.get(queue[i])! + 1); queue.push(key);
  }
  return distances;
}

class MotionPlan {
  readonly cells = new Map<number, Destination>();
  readonly players = new Map<number, Destination>();
  readonly compressed = new Set<number>();
  private visiting = new Set<number>();
  constructor(private level: Level, readonly state: State, private direction: Direction, private forcePlayers: boolean, private allowCompression = true) {}

  private destination(entity: Entity): Destination | null {
    const d = directions[this.direction];
    if (entity.container !== undefined) {
      let container: number | undefined = entity.container;
      const seen = new Set<number>();
      while (container !== undefined) {
        if (seen.has(container)) return null; seen.add(container);
        const base = this.state.cells.find(c => c.key === container), piston = boundaryPiston(this.state, container);
        if (!base || !piston || piston.direction !== this.direction) return null;
        container = base.container;
      }
      return { x: entity.x + d.x, y: entity.y + d.y };
    }
    return { x: entity.x + d.x, y: entity.y + d.y };
  }

  private resolve(destination: Destination, moving: Set<number>, ignoredPlayer = -1): Destination | null {
    if (destination.x < 0 || destination.y < 0 || destination.x >= this.level.width || destination.y >= this.level.height) return null;
    let obstacle = this.state.cells.find(c => address(c) === address(destination) && !moving.has(c.key));
    if (obstacle && this.cells.has(obstacle.key)) obstacle = undefined;
    if (obstacle) {
      const piston = boundaryPiston(this.state, obstacle.key);
      if (piston && this.direction === opposite(piston.direction) && !this.visiting.has(obstacle.key)) {
        if (this.tryTranslate(obstacle)) obstacle = undefined;
        else if (!piston.expanded || this.compressed.has(obstacle.key) || this.allowCompression) {
          const trial = this.fork();
          if (piston.expanded) trial.compressed.add(obstacle.key);
          const entered = trial.resolve({ ...destination, container: obstacle.key }, moving, ignoredPlayer);
          if (entered) { this.accept(trial); return entered; }
        }
      }
      if (obstacle && (destination.container !== undefined && obstacle.key === destination.container || !this.moveCell(obstacle))) return null;
    }
    for (let i = 0; i < this.state.players.length; i++) {
      const p = this.state.players[i];
      if (i === ignoredPlayer || this.players.has(i) || address(p) !== address(destination)) continue;
      if (!this.forcePlayers || !this.movePlayer(i)) return null;
    }
    return destination;
  }

  private fork(allowCompression = this.allowCompression): MotionPlan {
    const trial = new MotionPlan(this.level, this.state, this.direction, this.forcePlayers, allowCompression);
    this.cells.forEach((destination, key) => trial.cells.set(key, destination));
    this.players.forEach((destination, index) => trial.players.set(index, destination));
    this.compressed.forEach(key => trial.compressed.add(key)); trial.visiting = new Set(this.visiting);
    return trial;
  }

  private accept(trial: MotionPlan): void {
    this.cells.clear(); trial.cells.forEach((destination, key) => this.cells.set(key, destination));
    this.players.clear(); trial.players.forEach((destination, index) => this.players.set(index, destination));
    this.compressed.clear(); trial.compressed.forEach(key => this.compressed.add(key)); this.visiting = trial.visiting;
  }

  private tryTranslate(cell: Cell): boolean {
    const trial = this.fork(false);
    // Relative piston motion follows the attempt to translate the rigid body.
    if (!trial.moveCell(cell)) return false;
    this.accept(trial); return true;
  }

  private canTranslate(cell: Cell): boolean {
    const probe = new MotionPlan(this.level, this.state, this.direction, this.forcePlayers, false);
    return probe.moveCell(cell);
  }

  moveCell(cell: Cell): boolean {
    if (this.cells.has(cell.key)) return true;
    if (this.visiting.has(cell.key)) return false;
    const groups = bodies(this.state.cells, this.state.pistons?.map(p => this.compressed.has(p.baseKey) ? { ...p, expanded: false } : p));
    const group = [...groups.find(g => g.some(c => c.key === cell.key))!];
    if (this.allowCompression && !this.canTranslate(cell)) {
      const candidates = (this.state.pistons ?? []).filter(p => p.model === 'boundary' && p.expanded && !this.compressed.has(p.baseKey) && group.some(c => c.key === p.baseKey) &&
        (this.direction === opposite(p.direction) && cell.key !== p.baseKey || this.direction === p.direction && cell.key === p.baseKey));
      const distance = supportDistances(this.level, this.state, this.direction);
      candidates.sort((a, b) => (distance.get(a.baseKey) ?? Infinity) - (distance.get(b.baseKey) ?? Infinity) || a.baseKey - b.baseKey);
      if (candidates.length) { this.compressed.add(candidates[0].baseKey); return this.moveCell(cell); }
    }
    const include = (key: number) => { for (const c of groups.find(g => g.some(c => c.key === key)) ?? []) if (!group.some(old => old.key === c.key)) group.push(c); };
    for (let i = 0; i < group.length; i++) {
      const c = group[i];
      if (cell.container === undefined && c.container !== undefined && boundaryPiston(this.state, c.container)?.direction !== this.direction) include(c.container);
      descendants(this.state, c.key).cells.forEach(child => include(child.key));
    }
    if (group.some(c => c.fixed)) return false;
    const moving = new Set(group.map(c => c.key));
    // A housing carries its inventory; an inventory cannot push its containing housing.
    if (group.some(c => c.container !== undefined && moving.has(c.container)) && cell.container !== undefined && moving.has(cell.container)) return false;
    group.forEach(c => this.visiting.add(c.key));
    const carriedCells = new Set<number>(), carriedPlayers = new Set<number>();
    for (const c of group) {
      const inventory = descendants(this.state, c.key);
      inventory.cells.forEach(child => { if (!moving.has(child.key)) { carriedCells.add(child.key); moving.add(child.key); } });
      inventory.players.forEach(child => carriedPlayers.add(this.state.players.indexOf(child)));
    }
    const d = directions[this.direction];
    for (const c of group) {
      const destination = c.container !== undefined && moving.has(c.container) ? { x: c.x + d.x, y: c.y + d.y, container: c.container } : this.destination(c);
      if (!destination) return false;
      const piston = boundaryPiston(this.state, c.key);
      if (piston && (!piston.expanded || this.allowCompression || this.compressed.has(c.key)) && piston.direction === this.direction && !this.state.cells.some(child => child.container === c.key) && !this.state.players.some(child => child.container === c.key)) {
        const stored = this.state.cells.find(other => !moving.has(other.key) && address(other) === address(destination));
        if (stored && !this.cells.has(stored.key) && !this.canTranslate(stored)) {
          if (groups.some(body => body.some(part => part.key === stored.key) && body.some(part => part.fixed))) return false;
          if (piston.expanded) this.compressed.add(c.key);
          this.cells.set(stored.key, { x: stored.x, y: stored.y, container: c.key });
        }
      }
      const resolved = this.resolve(destination, moving);
      if (!resolved) return false;
      this.cells.set(c.key, resolved);
    }
    for (const key of carriedCells) {
      const c = this.state.cells.find(c => c.key === key)!;
      this.cells.set(key, { x: c.x + d.x, y: c.y + d.y, container: c.container });
    }
    for (const index of carriedPlayers) {
      const p = this.state.players[index];
      this.players.set(index, { x: p.x + d.x, y: p.y + d.y, container: p.container });
    }
    group.forEach(c => this.visiting.delete(c.key));
    return true;
  }

  movePlayer(index: number): boolean {
    if (this.players.has(index)) return true;
    const destination = this.destination(this.state.players[index]);
    if (!destination) return false;
    const resolved = this.resolve(destination, new Set(), index);
    if (!resolved) return false;
    this.players.set(index, resolved); return true;
  }

  apply(): void {
    const extended = new Set<number>();
    for (const c of this.state.cells) if (c.container !== undefined && this.cells.has(c.key) && !this.cells.has(c.container)) {
      const p = boundaryPiston(this.state, c.container), destination = this.cells.get(c.key)!;
      if (p && !p.expanded && destination.container !== c.container && (edge(c, opposite(p.direction)) === 0 || edge(c, opposite(p.direction)) === 3)) extended.add(c.container);
    }
    const place = (entity: Entity, destination: Destination) => { entity.x = destination.x; entity.y = destination.y; if (destination.container === undefined) delete entity.container; else entity.container = destination.container; };
    this.cells.forEach((destination, key) => place(this.state.cells.find(c => c.key === key)!, destination));
    this.players.forEach((destination, index) => place(this.state.players[index], destination));
    for (const key of this.compressed) {
      const piston = boundaryPiston(this.state, key)!, base = this.state.cells.find(c => c.key === key)!;
      piston.expanded = false;
      if (base.storesHeat && base.temperature === 0) base.temperature = 1;
    }
    for (const piston of this.state.pistons ?? []) {
      if (piston.model !== 'boundary' || piston.expanded || this.cells.has(piston.baseKey)) continue;
      const base = this.state.cells.find(c => c.key === piston.baseKey);
      if (base && extended.has(base.key)) {
        piston.expanded = true;
        if (base.storesHeat && base.temperature === 0) base.temperature = -1;
        continue;
      }
      if (!base || this.state.cells.some(c => c.container === base.key) || this.state.players.some(p => p.container === base.key)) continue;
      const d = directions[piston.direction];
      const pulled = this.state.cells.find(c => this.cells.has(c.key) && c.container === base.container && c.x === base.x + 2 * d.x && c.y === base.y + 2 * d.y);
      if (this.direction === piston.direction && pulled && (edge(base, piston.direction) === 3 || edge(pulled, opposite(piston.direction)) === 3)) {
        piston.expanded = true;
        if (base.storesHeat && base.temperature === 0) base.temperature = -1;
      }
    }
  }
}

export function moveBoundaryDemons(level: Level, state: State, direction: Direction): { moved: boolean; pushed: boolean } {
  const d = directions[direction], movedCells = new Set<number>(), movedPlayers = new Set<number>();
  const order = state.players.map((p, index) => ({ index, distance: p.x * d.x + p.y * d.y })).sort((a, b) => b.distance - a.distance || a.index - b.index);
  let moved = false, pushed = false;
  for (const { index } of order) {
    if (!canMoveDemon(state.players[index]) || movedPlayers.has(index)) continue;
    const plan = new MotionPlan(level, state, direction, false);
    if (!plan.movePlayer(index) || [...plan.cells.keys()].some(key => movedCells.has(key))) continue;
    plan.apply(); moved = true; pushed ||= plan.cells.size > 0 || plan.compressed.size > 0;
    plan.cells.forEach((_, key) => movedCells.add(key));
    plan.players.forEach((_, index) => movedPlayers.add(index));
  }
  return { moved, pushed };
}

export function actuateBoundary(level: Level, state: State, candidate: Piston): boolean {
  const trial = cloneState(state), piston = boundaryPiston(trial, candidate.baseKey)!, base = trial.cells.find(c => c.key === piston.baseKey);
  if (!base) return false;
  if (!piston.expanded && base.temperature === 1) {
    const child = trial.cells.find(c => c.container === base.key), player = trial.players.findIndex(p => p.container === base.key);
    const plan = new MotionPlan(level, trial, piston.direction, true);
    if (child && !plan.moveCell(child) || player >= 0 && !plan.movePlayer(player)) {
      // When the load is immovable, the housing can retreat while the load stays in place.
      const fallback = cloneState(state), housing = fallback.cells.find(c => c.key === base.key)!;
      const inventory = fallback.cells.find(c => c.container === housing.key), demon = fallback.players.find(p => p.container === housing.key);
      if (inventory) { if (housing.container === undefined) delete inventory.container; else inventory.container = housing.container; }
      if (demon) { if (housing.container === undefined) delete demon.container; else demon.container = housing.container; }
      const retreat = new MotionPlan(level, fallback, opposite(piston.direction) as Direction, true);
      if (!retreat.moveCell(housing)) return false;
      retreat.apply(); boundaryPiston(fallback, housing.key)!.expanded = true; housing.temperature = 0;
      Object.assign(state, fallback); return true;
    }
    plan.apply(); piston.expanded = true; base.temperature = 0;
    Object.assign(state, trial); return true;
  }
  if (piston.expanded && base.temperature === -1) {
    piston.expanded = false;
    const d = directions[piston.direction];
    const load = trial.cells.find(c => c.container === base.container && c.x === base.x + d.x && c.y === base.y + d.y);
    if (load && (edge(base, piston.direction) === 3 || edge(load, opposite(piston.direction)) === 3 || edge(load, opposite(piston.direction)) === 0)) {
      const plan = new MotionPlan(level, trial, opposite(piston.direction) as Direction, true);
      if (!plan.moveCell(load)) {
        if (load.fixed) return false;
        const advance = new MotionPlan(level, trial, piston.direction, true);
        if (!advance.moveCell(base)) return false;
        advance.apply(); base.temperature = 0; Object.assign(state, trial); return true;
      }
      plan.apply();
      // Active compression consumes the cold impulse after mechanical motion.
      base.temperature = 0;
    } else base.temperature = 0;
    Object.assign(state, trial); return true;
  }
  return false;
}
