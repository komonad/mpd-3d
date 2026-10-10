import catalogue from './solutions.json';
import { parseOperations, Simulation, type Operation, type SimulationCheckpoint } from './editor-model';
import { cloneState } from './engine';
import { selectSession, type Session } from './session';
import type { Dataset, Level } from './types';

export interface SavedSolution {
  levelId: string;
  label: string;
  actions: string;
  origin: 'search' | 'video' | 'play';
  source?: string;
  start?: SimulationCheckpoint | { levelId: string; solved?: string[]; visited?: string[]; completion?: 'previous-numbered' };
  entryStep?: number;
  id?: string;
  expected: { moves: number; pushes: number };
}

export const savedSolutions = catalogue.solutions as SavedSolution[];
export const solutionStartId = (solution: SavedSolution): string => solution.start && 'session' in solution.start ? solution.start.session.current.levelId : solution.start?.levelId ?? solution.levelId;
export const solutionCrossesScenes = (solution: SavedSolution): boolean => solutionStartId(solution) !== solution.levelId ||
  parseOperations(solution.actions).some(operation => operation.command === 'EXIT' || operation.command === 'HINT' || operation.command === 'ENTER' && operation.target !== solution.levelId);

const roomNumber = (level: Level): number[] | undefined => {
  const name = level.displayName ?? level.label;
  return level.category === 'main' && /^\d+-\d+$/.test(name) ? name.split('-').map(Number) : undefined;
};

export function solutionStartProgress(data: Dataset, solution: SavedSolution): { solved: string[]; visited: string[] } {
  const start = solution.start;
  if (start && 'session' in start) return { solved: start.session.solved, visited: start.session.visited };
  const destination = data.levels.find(level => level.id === solution.levelId);
  const number = destination && roomNumber(destination);
  const previous = start?.completion === 'previous-numbered' && number ? data.levels.filter(level => {
    const candidate = roomNumber(level);
    return candidate && (candidate[0] < number[0] || candidate[0] === number[0] && candidate[1] < number[1]);
  }).map(level => level.id) : [];
  return { solved: [...new Set([...previous, ...(start?.solved ?? [])])], visited: [...new Set([...previous, ...(start?.visited ?? [])])] };
}

export function solutionFile(solutions: SavedSolution[]) {
  const starts: Record<string, NonNullable<SavedSolution['start']>> = {}, references = new Map<NonNullable<SavedSolution['start']>, string>();
  const records = solutions.map(solution => {
    if (!solution.start) return solution;
    let reference = references.get(solution.start);
    if (reference === undefined) { reference = String(references.size); references.set(solution.start, reference); starts[reference] = solution.start; }
    const { start: _, ...record } = solution; return { ...record, startRef: reference };
  });
  return { version: 2, starts, solutions: records };
}

export function compactOperations(operations: Operation[]): string {
  const result: string[] = [];
  for (let i = 0; i < operations.length;) {
    const operation = operations[i]; let count = 1;
    while (count < 1000 && i + count < operations.length && operations[i + count].command === operation.command && operations[i + count].target === operation.target) count++;
    result.push(`${operation.command}${operation.target ? `(${operation.target})` : ''}${count > 1 ? count : ''}`); i += count;
  }
  return result.join(' ');
}

function cleanSession(session: Session): Session {
  return { ...session, current: cloneState(session.current),
    states: Object.fromEntries(Object.entries(session.states).map(([id, state]) => [id, cloneState(state)])),
    baselines: Object.fromEntries(Object.entries(session.baselines).map(([id, state]) => [id, cloneState(state)])),
    hints: session.hints.map(hint => ({ ...hint, state: cloneState(hint.state) })) };
}

export class SolutionRecording {
  readonly start: SimulationCheckpoint;
  readonly operations: Operation[] = [];
  constructor(checkpoint: SimulationCheckpoint) {
    this.start = structuredClone({ session: cleanSession(checkpoint.session), undo: checkpoint.undo.map(cleanSession), redo: checkpoint.redo.map(cleanSession) });
  }
  append(operation: Operation): void { this.operations.push({ ...operation }); }
  solution(levelId: string, label: string, session: Session): SavedSolution {
    let entry = -1;
    this.operations.forEach((op, i) => { if (entry < 0 && op.command === 'ENTER' && op.target === levelId) entry = i; });
    return { levelId, label, origin: 'play', start: this.start, actions: compactOperations(this.operations),
      ...(entry >= 0 ? { entryStep: entry + 1 } : {}), expected: { moves: session.current.moves, pushes: session.current.pushes } };
  }
}

export function parseSolutionFile(text: string, data: Dataset): SavedSolution[] {
  const file = JSON.parse(text);
  if (![1, 2].includes(file?.version) || !Array.isArray(file.solutions) || !file.solutions.length || file.solutions.length > 256) throw new Error('解法文件格式无效。');
  const levels = new Set(data.levels.map(level => level.id));
  const solutions: SavedSolution[] = file.solutions.map((record: SavedSolution & { startRef?: string }) => {
    if (!Object.hasOwn(record, 'startRef')) return record;
    if (typeof record.startRef !== 'string' || !file.starts || !Object.hasOwn(file.starts, record.startRef) || !file.starts[record.startRef]) throw new Error('回放起点引用不存在。');
    const { startRef, ...solution } = record; return { ...solution, start: file.starts[startRef] };
  });
  const state = (value: unknown): boolean => {
    const s = value as Session['current'];
    return !!s && levels.has(s.levelId) && Array.isArray(s.cells) && s.cells.length <= 20000 && Array.isArray(s.players) && s.players.length <= 256 &&
      typeof s.solved === 'boolean' && typeof s.frozen === 'boolean' && [-1, 0, 1, 2].includes(s.outside) && Number.isInteger(s.moves) && Number.isInteger(s.pushes);
  };
  const session = (value: Session): boolean => !!value && state(value.current) && ['solved', 'visited'].every(key => Array.isArray(value[key as 'solved']) && value[key as 'solved'].every(id => levels.has(id))) &&
    ['states', 'baselines'].every(key => value[key as 'states'] && Object.values(value[key as 'states']).every(state)) && !!value.baselines[value.current.levelId] &&
    !!value.entries && Array.isArray(value.hints) && value.hints.every(h => state(h.state) && levels.has(h.levelId)) && Number.isInteger(value.serial);
  for (const solution of solutions) {
    if (!solution || !levels.has(solution.levelId) || typeof solution.label !== 'string' || !['play', 'search', 'video'].includes(solution.origin) ||
      typeof solution.actions !== 'string' || !solution.expected || ![solution.expected.moves, solution.expected.pushes].every(n => Number.isInteger(n) && n >= 0)) throw new Error('解法对应的关卡或预期结果无效。');
    const count = parseOperations(solution.actions).length;
    if (solution.source !== undefined && (typeof solution.source !== 'string' || !/^https?:\/\//i.test(solution.source))) throw new Error('解法来源需要 HTTP 或 HTTPS 地址。');
    if (solution.entryStep !== undefined && (!Number.isInteger(solution.entryStep) || solution.entryStep < 1 || solution.entryStep > count)) throw new Error('进入步骤超出回放范围。');
    if (solution.start) {
      if ('session' in solution.start) {
        if (!session(solution.start.session) || ![solution.start.undo, solution.start.redo].every(history => Array.isArray(history) && history.length <= 512 && history.every(session))) throw new Error('回放起点缺少有效的场景缓存或历史。');
      } else {
        if (!levels.has(solution.start.levelId) || [solution.start.solved, solution.start.visited].some(ids => ids !== undefined && (!Array.isArray(ids) || ids.some(id => !levels.has(id))))) throw new Error('回放起点的场景或进度无效。');
        if (solution.start.completion !== undefined && (solution.start.completion !== 'previous-numbered' || !roomNumber(data.levels.find(level => level.id === solution.levelId)!))) throw new Error('回放的前序通关条件无效。');
      }
    }
  }
  return structuredClone(solutions);
}

export const operationLabel = (operation: Operation): string => ({
  L: '←', D: '↓', R: '→', U: '↑', RESET: '重置', UNDO: '撤销', REDO: '重做', ENTER: '进入', EXIT: '退出', HINT: '提示',
})[operation.command];

export class SolutionReplay {
  simulation: Simulation;
  readonly operations: Operation[];
  cursor = 0;
  accepted = true;
  private valid = true;

  constructor(readonly data: Dataset, readonly solution: SavedSolution) {
    this.operations = parseOperations(solution.actions);
    this.simulation = this.createSimulation();
  }

  private createSimulation(): Simulation {
    const level = this.data.levels.find(l => l.id === solutionStartId(this.solution));
    if (!level) throw new Error('解法对应的关卡数据未载入。');
    const start = this.solution.start;
    const progress = solutionStartProgress(this.data, this.solution);
    const checkpoint = start && ('session' in start ? start : { session: selectSession(this.data, level, progress.solved, progress.visited), undo: [], redo: [] });
    return new Simulation(this.data, level, checkpoint);
  }

  get finished(): boolean { return this.cursor === this.operations.length; }
  get passed(): boolean {
    const state = this.simulation.session.current;
    return this.valid && this.finished && state.levelId === this.solution.levelId && state.solved && state.moves === this.solution.expected.moves && state.pushes === this.solution.expected.pushes;
  }

  advance(): Operation | undefined {
    const operation = this.operations[this.cursor];
    if (!operation) return;
    this.accepted = this.simulation.apply(operation.command, operation.target);
    this.valid &&= this.accepted;
    this.cursor++;
    return operation;
  }

  seek(step: number): void {
    if (!Number.isInteger(step) || step < 0 || step > this.operations.length) throw new Error('回放步数超出范围。');
    this.simulation = this.createSimulation(); this.cursor = 0; this.accepted = true; this.valid = true;
    while (this.cursor < step) this.advance();
  }
}
