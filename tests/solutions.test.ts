import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { observableState, Simulation } from '../src/editor-model';
import { compactOperations, parseSolutionFile, savedSolutions, solutionFile, solutionStartProgress, SolutionRecording, SolutionReplay } from '../src/solutions';
import { parseOperations } from '../src/editor-model';
import { edge } from '../src/engine';
import type { Dataset, Level } from '../src/types';

const data: Dataset | undefined = fs.existsSync('public/levels.local.json') ? JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) : undefined;

test('saved solution identifiers are unique and verified worlds include every numbered room', () => {
  assert.equal(new Set(savedSolutions.map(s => s.levelId)).size, savedSolutions.length);
  for (const world of [1, 2, 3, 9]) assert.deepEqual(savedSolutions.filter(s => s.label.startsWith(`${world}-`)).map(s => s.label), Array.from({ length: world === 9 ? 25 : 20 }, (_, i) => `${world}-${i + 1}`));
});

test('every saved solution completes through the room-session simulation', { skip: !data }, () => {
  for (const solution of savedSolutions) {
    const replay = new SolutionReplay(data!, solution);
    while (!replay.finished) {
      replay.advance(); assert.equal(replay.accepted, true, `${solution.label} step ${replay.cursor}`);
    }
    assert.equal(replay.passed, true, solution.label);
    assert.equal(replay.advance(), undefined); assert.equal(replay.cursor, replay.operations.length);
  }
});

test('7-11 preserves a surviving adhesive cut and revives an ordinary face', { skip: !data }, () => {
  const replay = new SolutionReplay(data!, savedSolutions.find(s => s.label === '7-11')!);
  replay.seek(3);
  assert.equal(replay.simulation.session.current.cells.some(c => c.key === 33), false);
  assert.equal(edge(replay.simulation.session.current.cells.find(c => c.key === 32)!, 2), 3);
  replay.seek(7);
  const state = replay.simulation.session.current;
  assert.equal(edge(state.cells.find(c => c.key === 32)!, 2), 3);
  assert.equal(edge(state.cells.find(c => c.key === 33)!, 0), 1);
  replay.seek(replay.operations.length); assert.equal(replay.passed, true);
});

test('numbered replay starts complete earlier worlds and rooms while leaving the destination and later rooms unsolved', { skip: !data }, () => {
  const solution = savedSolutions.find(solution => solution.label === '3-12')!;
  const progress = solutionStartProgress(data!, solution);
  const earlier = data!.levels.filter(level => level.category === 'main' && /^\d+-\d+$/.test(level.displayName ?? '')).filter(level => {
    const [world, number] = level.displayName!.split('-').map(Number);
    return world < 3 || world === 3 && number < 12;
  }).map(level => level.id);
  assert.deepEqual(new Set(progress.solved), new Set(earlier));
  assert.deepEqual(progress.visited, progress.solved);
  assert.equal(progress.solved.includes(solution.levelId), false);
  assert.equal(progress.solved.includes(savedSolutions.find(solution => solution.label === '3-13')!.levelId), false);
  const run = new SolutionReplay(data!, solution);
  assert.equal(run.simulation.session.current.levelId, 'f279621b');
  const entrance = run.simulation.session.current.cells.find(cell => cell.portal?.target === solution.levelId)!;
  assert.equal(entrance.temperature, entrance.portal!.before.temperature);
  const restored = parseSolutionFile(JSON.stringify(solutionFile([solution])), data!)[0];
  assert.deepEqual(solutionStartProgress(data!, restored), progress);
  assert.ok(savedSolutions.every(solution => solution.start && !('session' in solution.start) && solution.start.completion === 'previous-numbered'));
});

for (const label of ['1-11', '7-1', '3-1', '2-1']) {
  test(`seeking ${label} reconstructs undo, reset and room-entry history`, { skip: !data }, () => {
    const replay = new SolutionReplay(data!, savedSolutions.find(s => s.label === label)!);
    const sim = new SolutionReplay(data!, replay.solution).simulation;
    const special = replay.operations.findIndex(op => !['L', 'D', 'R', 'U'].includes(op.command));
    assert.ok(special >= 0);
    for (const operation of replay.operations.slice(0, special + 2)) sim.apply(operation.command, operation.target);
    replay.seek(replay.operations.length); assert.equal(replay.passed, true);
    replay.seek(special + 2); assert.deepEqual(observableState(replay.simulation.session.current), observableState(sim.session.current));
    replay.seek(0); assert.equal(replay.cursor, 0); assert.equal(replay.simulation.session.current.moves, 0);
    assert.throws(() => replay.seek(-1)); assert.throws(() => replay.seek(replay.operations.length + 1)); assert.throws(() => replay.seek(0.5));
  });
}

test('seeking 3-13 reconstructs shortcut directions, cached rooms, cut baselines and progress', { skip: !data }, () => {
  const solution = savedSolutions.find(s => s.label === '3-13')!, replay = new SolutionReplay(data!, solution);
  const expected = new SolutionReplay(data!, solution);
  while (expected.cursor < 62) expected.advance();
  replay.seek(replay.operations.length); assert.equal(replay.passed, true);
  replay.seek(62); assert.deepEqual(replay.simulation.checkpoint(), expected.simulation.checkpoint());
  assert.equal(replay.simulation.apply('UNDO'), true); assert.equal(expected.simulation.apply('UNDO'), true);
  assert.deepEqual(replay.simulation.checkpoint(), expected.simulation.checkpoint());
  assert.equal(replay.simulation.session.current.levelId, '83e5acbe');
  replay.seek(0); assert.deepEqual(replay.simulation.checkpoint(), new SolutionReplay(data!, solution).simulation.checkpoint());
});

const block = (x: number, y: number, temperature: -1 | 0 | 1 | 2 = 0) => ({ x, y, temperature, edges: 0x55, storesHeat: true, fixed: false });
const room = (id: string): Level => ({ id, label: id, width: 8, height: 6, category: 'main', cells: [], players: [{ x: 1, y: 2 }], goals: [], tail: [0] });

test('a recorded approach restores portal movement, outside heat, cached rooms and initial undo history', () => {
  const parent = room('parent'), child = { ...room('child'), parentId: 'parent', cells: [block(2, 2)], goals: [{ x: 3, y: 2 }] };
  parent.cells = [{ ...block(3, 2, -1), portal: { target: child.id, shortcut: false, before: block(3, 2, -1), after: block(3, 2) } }];
  const cache = room('cache'), fixture: Dataset = { version: 2, world: parent.id, root: parent.id, levels: [parent, child, cache], hints: {} };
  const simulation = new Simulation(fixture, parent);
  simulation.apply('R');
  const cached = new Simulation(fixture, cache).session.current;
  cached.cells = [{ ...block(6, 4, 2), key: 0 }, { ...block(6, 4, 2), key: 1, container: 0 }];
  cached.pistons = [{ baseKey: 0, headKey: -10000, direction: 2, expanded: false, order: 1, model: 'boundary', head: block(0, 0, 2) }];
  simulation.session.states.cache = structuredClone(cached); simulation.session.baselines.cache = structuredClone(cached);
  const recording = new SolutionRecording(simulation.checkpoint());
  const operations = parseOperations('UNDO REDO R ENTER(child) R');
  for (const operation of operations) { assert.equal(simulation.apply(operation.command, operation.target), true); recording.append(operation); }
  const solution = recording.solution(child.id, 'child', simulation.session), expected = structuredClone(simulation.session);
  assert.equal(solution.entryStep, 4); assert.equal(solution.expected.moves, 1); assert.equal(solution.expected.pushes, 1);
  const imported = parseSolutionFile(JSON.stringify({ version: 2, solutions: [solution] }), fixture)[0], replay = new SolutionReplay(fixture, imported);
  replay.seek(3); assert.equal(replay.simulation.session.current.cells[0].x, 4);
  replay.seek(4); assert.equal(replay.simulation.session.current.outside, -1); assert.deepEqual(replay.simulation.session.entries.child.directions, [2]);
  assert.equal(replay.simulation.session.baselines.child.outside, -1); assert.equal(replay.simulation.session.states.parent.cells[0].x, 4);
  replay.seek(5); assert.equal(replay.passed, true); assert.deepEqual(replay.simulation.session, expected);
  replay.seek(0); assert.equal(replay.simulation.canUndo, true); assert.deepEqual(replay.simulation.session.states.cache, cached);
  assert.deepEqual(recording.start.session.states.cache, cached);
  const packed = solutionFile([solution, { ...solution, id: 'second' }]); assert.equal(Object.keys(packed.starts).length, 1);
  const restored = parseSolutionFile(JSON.stringify(packed), fixture); assert.deepEqual(restored[0], solution); assert.equal(restored[0].start, restored[1].start);
  assert.throws(() => parseSolutionFile(JSON.stringify({ version: 2, solutions: [{ ...solution, entryStep: 6 }] }), fixture));
});

test('recording retains explicit exits and compaction preserves targets', () => {
  const operations = parseOperations('R2 ENTER(child) EXIT ENTER(other) RESET UNDO REDO');
  assert.deepEqual(parseOperations(compactOperations(operations)), operations);
});

test('a blocked prefix prevents a replay from passing even when its final counts match', () => {
  const level = room('blocked'); level.cells = [{ ...block(0, 2), fixed: true }, block(2, 2)]; level.goals = [{ x: 4, y: 2 }];
  const fixture: Dataset = { version: 2, world: level.id, levels: [level], hints: {} };
  const run = new SolutionReplay(fixture, { levelId: level.id, label: level.id, origin: 'play', actions: 'L R2', expected: { moves: 2, pushes: 2 } });
  run.seek(3); assert.equal(run.simulation.session.current.solved, true); assert.equal(run.passed, false);
  run.seek(0); assert.equal(run.cursor, 0); assert.equal(run.accepted, true);
});

test('solution files accept legacy routes and reject missing rooms or malformed starts', { skip: !data }, () => {
  const { start: _, ...legacy } = savedSolutions[0];
  assert.deepEqual(parseSolutionFile(JSON.stringify({ version: 1, solutions: [legacy] }), data!), [legacy]);
  assert.deepEqual(solutionStartProgress(data!, legacy), { solved: [], visited: [] });
  assert.throws(() => parseSolutionFile(JSON.stringify({ version: 2, solutions: [{ ...savedSolutions[0], start: { levelId: 'missing' } }] }), data!));
  assert.throws(() => parseSolutionFile(JSON.stringify({ version: 2, solutions: [{ ...savedSolutions[0], start: { session: {}, undo: [], redo: [] } }] }), data!));
  assert.throws(() => parseSolutionFile(JSON.stringify({ version: 2, solutions: [{ ...savedSolutions[0], start: { levelId: savedSolutions[0].levelId, completion: 'all' } }] }), data!));
});
