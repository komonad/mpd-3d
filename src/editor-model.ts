import { bodies, cloneState, move } from './engine';
import { enterHint, enterPortal, exitLevel, recordState, resetSession, selectSession, type Session } from './session';
import type { BlockProperties, Dataset, Direction, Level, Point, State } from './types';

export type Command = 'L' | 'D' | 'R' | 'U' | 'RESET' | 'UNDO' | 'REDO' | 'ENTER' | 'EXIT' | 'HINT';
export interface Operation { command: Command; target?: string }
export interface Checkpoint { step: number; path: string; equals: unknown }
export interface Scenario { name: string; levelId: string; actions: string; checks: Checkpoint[]; source?: string }
export interface EditorProject { version: 1; levels: Level[]; currentId: string; scenarios: Scenario[] }
export interface CheckResult extends Checkpoint { actual: unknown; passed: boolean }
export interface ReplayRow extends Operation { step: number; accepted: boolean; state: State; checks: CheckResult[] }
export interface ReplayResult { rows: ReplayRow[]; checks: CheckResult[]; passed: boolean; session: Session }
const moves: Partial<Record<Command, Direction>> = { L: 0, D: 1, R: 2, U: 3 };
const commands: Record<string, Command> = { LEFT: 'L', DOWN: 'D', RIGHT: 'R', UP: 'U', '←': 'L', '↓': 'D', '→': 'R', '↑': 'U',
  L: 'L', D: 'D', R: 'R', U: 'U', RESET: 'RESET', '!': 'RESET', UNDO: 'UNDO', Z: 'UNDO', REDO: 'REDO', Y: 'REDO',
  ENTER: 'ENTER', E: 'ENTER', EXIT: 'EXIT', Q: 'EXIT', HINT: 'HINT', H: 'HINT' };

export function parseOperations(text: string): Operation[] {
  const result: Operation[] = [], input = text; let offset = 0;
  while (offset < input.length) {
    const separator = /^[\s,;]+/.exec(input.slice(offset));
    if (separator) { offset += separator[0].length; continue; }
    const token = /^(RESET|UNDO|REDO|ENTER|EXIT|HINT|LEFT|DOWN|RIGHT|UP|[LDRU←↓→↑!ZEQHY])(?:\(([a-z0-9_-]+)\))?(\d*)/i.exec(input.slice(offset));
    if (!token) throw new Error(`操作序列第 ${offset + 1} 个字符无法识别。`);
    const command = commands[token[1].toUpperCase()], target = token[2], count = token[3] ? Number(token[3]) : 1;
    if (target && command !== 'ENTER') throw new Error('只有 ENTER / E 操作可以指定入口目标。');
    if (!Number.isSafeInteger(count) || count < 1 || count > 1000 || result.length + count > 10000) throw new Error('单次重复限制为 1–1000，总操作数不能超过 10000。');
    for (let i = 0; i < count; i++) result.push({ command, ...(target ? { target } : {}) });
    offset += token[0].length;
  }
  return result;
}
export const parseCommands = (text: string): Command[] => parseOperations(text).map(o => o.command);

export function blankLevel(id = 'editor-room'): Level {
  const level: Level = { id, label: '自建', title: '新关卡', category: 'lab', width: 9, height: 9, cells: [], players: [{ x: 2, y: 6 }], goals: [], tail: [0] };
  const wall = new Set<string>();
  for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) if (x === 0 || y === 0 || x === level.width - 1 || y === level.height - 1) wall.add(`${x},${y}`);
  const directions = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  for (const position of wall) {
    const [x, y] = position.split(',').map(Number); let edges = 0xaa;
    directions.forEach(([dx, dy], d) => { if (wall.has(`${x + dx},${y + dy}`)) edges &= ~(3 << (d * 2)); });
    level.cells.push({ x, y, fixed: true, storesHeat: true, temperature: 0, edges });
  }
  return level;
}

export function validateLevel(level: Level): string[] {
  const errors: string[] = [];
  if (!level || typeof level !== 'object') return ['关卡必须是对象。'];
  if (typeof level.id !== 'string' || !level.id.trim()) errors.push('关卡 ID 不能为空。');
  if (typeof level.label !== 'string' || !['main', 'extra', 'world', 'hint', 'lab'].includes(level.category)) errors.push('关卡名称或分类无效。');
  if (![level.width, level.height].every(n => Number.isInteger(n) && n >= 1 && n <= 128)) errors.push('宽、高必须是 1–128 的整数。');
  if (![level.cells, level.players, level.goals, level.tail].every(Array.isArray)) return [...errors, 'cells、players、goals、tail 必须是数组。'];
  if (level.cells.length > 20000 || level.players.length > 256) return [...errors, '关卡物品数量超出限制。'];
  const coordinate = (p: Point) => p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < level.width && p.y < level.height;
  const property = (p: BlockProperties) => p && typeof p.fixed === 'boolean' && typeof p.storesHeat === 'boolean' && [-1, 0, 1, 2].includes(p.temperature) && Number.isInteger(p.edges) && p.edges >= 0 && p.edges <= 255 && (p.heatCapacity === undefined || Number.isInteger(p.heatCapacity) && p.heatCapacity >= (p.storesHeat ? 1 : 0) && p.heatCapacity <= 100000);
  const occupied = new Set<string>(), pistonKeys = new Set<number>();
  if (level.pistons !== undefined && !Array.isArray(level.pistons)) return [...errors, 'pistons 必须是数组。'];
  for (const p of level.pistons ?? []) {
    if (!p || !Number.isInteger(p.baseKey) || !level.cells[p.baseKey] || pistonKeys.has(p.baseKey) || !Number.isInteger(p.headKey) || ![0, 1, 2, 3].includes(p.direction) || typeof p.expanded !== 'boolean' || !Number.isInteger(p.order) || p.order < 0 || !property(p.head) || p.model !== undefined && p.model !== 'boundary') errors.push('活塞定义无效或重复。');
    if (p) pistonKeys.add(p.baseKey);
  }
  for (const [i, cell] of level.cells.entries()) {
    if (!coordinate(cell) || !property(cell)) { errors.push(`方块 #${i} 的坐标或属性无效。`); continue; }
    const address = `${cell.x},${cell.y},${cell.container ?? 'floor'}`;
    if (occupied.has(address)) errors.push(`方块 #${i} 与同层方块重叠。`); occupied.add(address);
    if (cell.portal && (typeof cell.portal.target !== 'string' || typeof cell.portal.shortcut !== 'boolean' || !property(cell.portal.before) || !property(cell.portal.after))) errors.push(`方块 #${i} 的入口属性无效。`);
  }
  for (const [i, player] of level.players.entries()) {
    if (!coordinate(player) || player.temperature !== undefined && ![-1, 0, 1, 2].includes(player.temperature)) errors.push(`麦妖 ${i + 1} 的坐标或温度无效。`);
    if (player && occupied.has(`${player.x},${player.y},${player.container ?? 'floor'}`) && !(level.pistons ?? []).some(p => !p.expanded && level.cells[p.baseKey]?.x === player.x && level.cells[p.baseKey]?.y === player.y && level.cells[p.baseKey]?.container === player.container)) errors.push(`麦妖 ${i + 1} 与实心方块重叠。`);
  }
  for (const object of [...level.cells, ...level.players]) {
    if (!object || object.container === undefined) continue;
    const seen = new Set<number>(); let parent: number | undefined = object.container;
    while (parent !== undefined) {
      if (!Number.isInteger(parent) || !pistonKeys.has(parent) || seen.has(parent)) { errors.push('内部物品必须引用活塞，且不能循环包含。'); break; }
      seen.add(parent); parent = level.cells[parent]?.container;
    }
    const housing = level.cells[object.container];
    if (housing && (object.x !== housing.x || object.y !== housing.y)) errors.push('收纳物品必须与其所属活塞同格。');
  }
  if (level.goals.some(p => !p || !Number.isInteger(p.x) || !Number.isInteger(p.y))) errors.push('终点坐标无效。');
  return [...new Set(errors)];
}

export function parseProject(text: string): EditorProject {
  const parsed = JSON.parse(text), project: EditorProject = parsed?.version === 1 && Array.isArray(parsed.levels)
    ? parsed : { version: 1, levels: [parsed], currentId: parsed?.id, scenarios: [] };
  if (!project.levels.length || project.levels.length > 128) throw new Error('项目需包含 1–128 个关卡。');
  const ids = new Set<string>();
  for (const level of project.levels) {
    const errors = validateLevel(level); if (errors.length) throw new Error(errors.join('\n'));
    if (ids.has(level.id)) throw new Error('项目内关卡 ID 不能重复。'); ids.add(level.id);
  }
  if (!ids.has(project.currentId)) throw new Error('当前关卡不存在。');
  if (!Array.isArray(project.scenarios)) throw new Error('scenarios 必须是数组。');
  for (const scenario of project.scenarios) {
    if (!scenario || typeof scenario.name !== 'string' || !ids.has(scenario.levelId) || typeof scenario.actions !== 'string' || scenario.source !== undefined && typeof scenario.source !== 'string') throw new Error('测试用例的名称、关卡、操作序列或来源无效。');
    const count = parseCommands(scenario.actions).length; validateChecks(scenario.checks, count);
  }
  return structuredClone(project);
}

export function validateChecks(checks: Checkpoint[], count: number): void {
  if (!Array.isArray(checks) || checks.length > 20000) throw new Error('检查点必须是数组，最多 20000 项。');
  for (const c of checks) if (!c || !Number.isInteger(c.step) || c.step < 0 || c.step > count || typeof c.path !== 'string' || !Object.hasOwn(c, 'equals') || c.path.split('.').some(p => ['__proto__', 'constructor', 'prototype'].includes(p))) throw new Error('检查点需要有效的 step、path、equals，step 不能超过操作数。');
}

export function projectDataset(base: Dataset, project: EditorProject): Dataset {
  const levels = new Map(base.levels.map(l => [l.id, l])); project.levels.forEach(l => levels.set(l.id, l));
  return { ...base, levels: [...levels.values()] };
}

export function observableState(state: State): Record<string, unknown> {
  const snapshot = cloneState(state);
  return { levelId: snapshot.levelId, cells: snapshot.cells.sort((a, b) => a.key - b.key).map(c => ({ ...c, container: c.container ?? null })),
    players: snapshot.players.map(({ key: _, ...p }) => ({ ...p, container: p.container ?? null })),
    pistons: (snapshot.pistons ?? []).sort((a, b) => a.baseKey - b.baseKey), moves: snapshot.moves, pushes: snapshot.pushes,
    outside: snapshot.outside, solved: snapshot.solved, frozen: snapshot.frozen, transient: snapshot.transient ?? false, phase: snapshot.phase ?? 'ready',
    bodies: bodies(snapshot.cells, snapshot.pistons).map(b => b.map(c => c.key).sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]), frames: structuredClone(state.turnFrames ?? []) };
}

function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export function checkState(state: State, checks: Checkpoint[], step: number, accepted = true): CheckResult[] {
  const source = { ...observableState(state), accepted };
  return checks.filter(c => c.step === step).map(c => {
    let actual: unknown = source;
    for (const part of c.path ? c.path.split('.') : []) actual = actual && typeof actual === 'object' && Object.hasOwn(actual, part) ? (actual as Record<string, unknown>)[part] : undefined;
    return { ...c, actual, passed: equal(actual, c.equals) };
  });
}

export class Simulation {
  session: Session;
  private undo: Session[] = [];
  private redo: Session[] = [];
  constructor(readonly data: Dataset, level: Level) { this.session = selectSession(data, level); }
  get level(): Level { return this.data.levels.find(l => l.id === this.session.current.levelId)!; }
  get canUndo(): boolean { return this.undo.length > 0; }
  get canRedo(): boolean { return this.redo.length > 0; }
  apply(command: Command, target?: string): boolean {
    if (command === 'UNDO' || command === 'REDO') {
      const from = command === 'UNDO' ? this.undo : this.redo, to = command === 'UNDO' ? this.redo : this.undo;
      const next = from.pop(); if (!next) return false; to.push(structuredClone(this.session)); this.session = next; return true;
    }
    let next: Session | null = null;
    const direction = moves[command];
    if (direction !== undefined) {
      const state = move(this.level, this.session.current, direction);
      if (state) { next = structuredClone(this.session); recordState(next, state, this.level); }
    } else if (command === 'RESET') next = resetSession(this.session);
    else if (command === 'ENTER') next = enterPortal(this.data, this.session, target);
    else if (command === 'EXIT') next = exitLevel(this.data, this.session);
    else if (command === 'HINT' && this.level.hintId) next = enterHint(this.data, this.session, this.level.hintId);
    if (!next) { delete this.session.current.turnFrames; return false; }
    this.undo.push(structuredClone(this.session)); if (this.undo.length > 512) this.undo.shift(); this.redo = []; this.session = next; return true;
  }
}

export function replayScenario(data: Dataset, scenario: Scenario): ReplayResult {
  const level = data.levels.find(l => l.id === scenario.levelId); if (!level) throw new Error('测试关卡不存在。');
  const commands = parseOperations(scenario.actions); validateChecks(scenario.checks, commands.length);
  const simulation = new Simulation(data, level), rows: ReplayRow[] = [], results = checkState(simulation.session.current, scenario.checks, 0);
  for (const [i, operation] of commands.entries()) {
    const accepted = simulation.apply(operation.command, operation.target), state = structuredClone(simulation.session.current), checks = checkState(state, scenario.checks, i + 1, accepted);
    results.push(...checks); rows.push({ step: i + 1, ...operation, accepted, state, checks });
  }
  return { rows, checks: results, passed: results.length > 0 && results.every(c => c.passed), session: simulation.session };
}

export function removeCell(level: Level, index: number): void {
  const removed = new Set([index]);
  for (let count = -1; count !== removed.size;) { count = removed.size; level.cells.forEach((c, i) => { if (c.container !== undefined && removed.has(c.container)) removed.add(i); }); }
  const remap = new Map<number, number>(), cells = level.cells.filter((_, i) => !removed.has(i)); let next = 0;
  level.cells.forEach((_, i) => { if (!removed.has(i)) remap.set(i, next++); });
  for (const c of cells) if (c.container !== undefined) c.container = remap.get(c.container);
  level.players = level.players.filter(p => p.container === undefined || !removed.has(p.container));
  for (const p of level.players) if (p.container !== undefined) p.container = remap.get(p.container);
  level.pistons = level.pistons?.filter(p => !removed.has(p.baseKey) && (p.model === 'boundary' || !removed.has(p.headKey))).map(p => ({ ...p, baseKey: remap.get(p.baseKey)!, headKey: p.model === 'boundary' ? -10000 - remap.get(p.baseKey)! : remap.get(p.headKey) ?? p.headKey }));
  level.cells = cells;
}
