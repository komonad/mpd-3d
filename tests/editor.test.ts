import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { blankLevel, checkState, observableState, parseCommands, parseOperations, parseProject, projectDataset, removeCell, replayScenario, Simulation, validateLevel } from '../src/editor-model';
import { addReferenceReplays, referenceReplays } from '../src/reference-replays';
import { addMechanismPresets, editorPresets } from '../src/editor-presets';
import { createChild, projectRooms, removeRoom, setParent } from '../src/editor-workspace';
import type { Dataset, Level } from '../src/types';

const project = editorPresets();
const data: Dataset = { version: 1, world: project.currentId, levels: project.levels, hints: {} };

test('operation sequences distinguish right movement from reset and reject unrecognized input', () => {
  assert.deepEqual(parseCommands('R3 ↓ LEFT RESET E Q H Z Y'), ['R', 'R', 'R', 'D', 'L', 'RESET', 'ENTER', 'EXIT', 'HINT', 'UNDO', 'REDO']);
  assert.deepEqual(parseCommands('UPDOWN←→!'), ['U', 'D', 'L', 'R', 'RESET']);
  assert.deepEqual(parseOperations('E(f094349a) RESET'), [{ command: 'ENTER', target: 'f094349a' }, { command: 'RESET' }]);
  for (const invalid of ['foo', 'R0', 'U1001', 'R-1', 'U(room)']) assert.throws(() => parseCommands(invalid));
});

test('mechanism fixtures meet their independent movement, reset and transient expectations', () => {
  for (const scenario of project.scenarios) {
    const result = replayScenario(data, scenario);
    assert.equal(result.passed, true, `${scenario.name}: ${JSON.stringify(result.checks.filter(c => !c.passed))}`);
  }
});

test('transparent owned adhesive joins another transparent cell and remains a rigid body', () => {
  const scenario = project.scenarios[0], result = replayScenario(data, scenario), joined = observableState(result.rows[0].state).bodies as number[][];
  assert.ok(joined.some(keys => keys.includes(32) && keys.includes(33)));
  assert.equal(result.rows[3].state.players[0].y, 4);
});

test('blocked actions count as replay steps without adding game moves or reusing thermal frames', () => {
  const result = replayScenario(data, { name: 'wall', levelId: project.levels[0].id, actions: 'L2', checks: [{ step: 2, path: 'accepted', equals: false }, { step: 2, path: 'moves', equals: 1 }] });
  assert.equal(result.passed, true); assert.equal(result.rows.length, 2); assert.deepEqual(result.rows[1].state.turnFrames, undefined);
});

test('replay checkpoints can inspect intermediate thermal frames and report exact failures', () => {
  const scenario = project.scenarios[3], result = replayScenario(data, scenario);
  assert.ok(result.rows[0].state.turnFrames!.some(f => f.players[0].temperature === 1));
  const frame = result.rows[0].state.turnFrames!.findIndex(f => f.players[0].temperature === 1);
  const checks = [{ step: 1, path: `frames.${frame}.players.0.temperature`, equals: 1 }, { step: 1, path: 'players.0.temperature', equals: -1 }];
  const compared = checkState(result.rows[0].state, checks, 1);
  assert.equal(compared[0].passed, true); assert.equal(compared[1].passed, false); assert.equal(compared[1].actual, 0);
});

test('simulation undo and redo restore full sessions without modifying definitions', () => {
  const before = structuredClone(data), simulation = new Simulation(data, project.levels[0]);
  assert.equal(simulation.apply('R'), true); assert.equal(simulation.canUndo, true);
  const moved = observableState(simulation.session.current);
  assert.equal(simulation.apply('UNDO'), true); assert.equal(simulation.session.current.moves, 0); assert.equal(simulation.canRedo, true);
  assert.equal(simulation.apply('REDO'), true); assert.deepEqual(observableState(simulation.session.current), moved);
  assert.deepEqual(data, before);
});

test('project JSON preserves nested mechanisms and test expectations', () => {
  const parsed = parseProject(JSON.stringify(project)); assert.deepEqual(parsed, project); parsed.levels[0].cells[0].temperature = 1;
  assert.equal(project.levels[0].cells[0].temperature, 0);
  assert.deepEqual(parseProject(JSON.stringify(blankLevel())).scenarios, []);
  assert.throws(() => parseProject(JSON.stringify({ ...project, currentId: 'missing' })));
  assert.throws(() => parseProject(JSON.stringify({ ...project, scenarios: [{ ...project.scenarios[0], checks: [{ step: 100, path: 'moves', equals: 0 }] }] })));
  assert.throws(() => parseProject(JSON.stringify({ ...project, scenarios: [{ ...project.scenarios[0], source: {} }] })));
});

test('validation rejects invalid properties, overlapping objects and cyclic inventory', () => {
  const level = blankLevel(); level.cells.push({ x: 2, y: 3, fixed: false, storesHeat: true, temperature: 0, edges: 0x55 });
  level.cells.push({ ...level.cells.at(-1)! }); assert.ok(validateLevel(level).some(e => e.includes('重叠')));
  level.cells.pop(); level.cells.at(-1)!.edges = 300; assert.ok(validateLevel(level).some(e => e.includes('属性')));
  const nested = structuredClone(project.levels[1]); nested.cells[32].container = 32;
  assert.ok(validateLevel(nested).some(e => e.includes('循环')));
});

test('removing a housing removes descendants and remaps surviving inventory references', () => {
  const level = structuredClone(project.levels[1]); level.cells.push({ ...level.cells[32], x: 5 }, { ...level.cells[32], container: 32 });
  level.pistons!.push({ ...level.pistons![0], baseKey: 33, headKey: -10033 });
  level.players.push({ x: 7, y: 4, container: 32 }); removeCell(level, 32);
  assert.equal(level.cells.length, 33); assert.equal(level.cells[32].x, 5); assert.deepEqual(level.pistons!.map(p => [p.baseKey, p.headKey]), [[32, -10032]]);
  assert.equal(level.players.length, 1); assert.deepEqual(validateLevel(level), []);
});

test('editor room overrides leave the source dataset unchanged', () => {
  const edited = structuredClone(project); edited.levels[0].title = 'Edited'; const merged = projectDataset(data, edited);
  assert.equal(merged.levels[0].title, 'Edited'); assert.equal(data.levels[0].title, '透明粘边');
});

test('adding mechanism fixtures preserves edited layouts and cases and is idempotent', () => {
  const draft = { ...structuredClone(project), levels: structuredClone(project.levels.slice(0, 4)), scenarios: structuredClone(project.scenarios.slice(0, 4)) };
  draft.levels[0].title = 'Edited'; draft.scenarios[0].actions = 'R4';
  assert.equal(addMechanismPresets(draft), project.scenarios.length - 4); assert.equal(addMechanismPresets(draft), 0);
  assert.equal(draft.levels[0].title, 'Edited'); assert.equal(draft.scenarios[0].actions, 'R4'); assert.doesNotThrow(() => parseProject(JSON.stringify(draft)));
});

test('nested authoring keeps hierarchy, entrances and export references consistent', () => {
  const root = blankLevel('root'), draft = { version: 1 as const, levels: [root], currentId: root.id, scenarios: [] };
  const child = createChild(draft, { x: 3, y: 4 });
  const leaf = createChild(draft, { x: 3, y: 4 });
  assert.equal(child.parentId, root.id); assert.equal(leaf.parentId, child.id);
  assert.equal(root.cells[32].portal?.target, child.id); assert.equal(child.cells[32].portal?.target, leaf.id);
  assert.deepEqual(projectRooms(draft).map(r => r.depth), [0, 1, 2]);
  assert.throws(() => setParent(draft, root.id, leaf.id), /循环/);
  assert.equal(root.parentId, undefined);
  assert.doesNotThrow(() => parseProject(JSON.stringify(draft)));
  removeRoom(draft, child.id);
  assert.equal(root.cells[32].portal, undefined); assert.equal(leaf.parentId, undefined);
  assert.deepEqual(projectRooms(draft).map(r => r.depth), [0, 0]);
});

test('initial progress round trips and a fresh simulation clears nested states and retained changes', () => {
  const draft = structuredClone(project);
  draft.rootId = 'editor-portal-hub'; draft.progress = { solved: ['editor-portal-leaf'], visited: ['editor-portal-leaf'] };
  const imported = parseProject(JSON.stringify(draft)); assert.deepEqual(imported.progress, draft.progress);
  const hub = imported.levels.find(l => l.id === imported.rootId)!;
  const merged = projectDataset(data, imported), simulation = new Simulation(merged, hub, undefined, imported.progress);
  assert.equal(simulation.apply('ENTER'), true);
  assert.equal(simulation.apply('ENTER'), true); assert.equal(simulation.apply('R'), true); assert.equal(simulation.apply('EXIT'), true);
  assert.equal(simulation.session.current.cells[32].temperature, 2);
  const restored = new Simulation(merged, hub, undefined, imported.progress);
  assert.equal(restored.session.current.levelId, hub.id); assert.equal(restored.session.current.moves, 0);
  assert.equal(restored.session.states['editor-portal-child'], undefined);
  assert.equal(restored.canUndo, false); assert.deepEqual(restored.session.solved, imported.progress!.solved);
  assert.throws(() => parseProject(JSON.stringify({ ...draft, progress: { solved: 'room' } })), /数组/);
});

test('all imported rooms including dormant hints validate without changing native properties', { skip: !fs.existsSync('public/levels.local.json') }, () => {
  const imported: Dataset = JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8'));
  for (const level of imported.levels) assert.deepEqual(validateLevel(level), [], level.displayName ?? level.id);
});

test('self entry, hint entry, exit and reset use the room session rules', { skip: !fs.existsSync('public/levels.local.json') }, () => {
  const imported: Dataset = JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8'));
  const level = imported.levels.find(l => l.id === 'f094349a') as Level;
  const simulation = new Simulation(imported, level); simulation.session.current.players[0].x = 4; simulation.session.current.players[0].y = 4;
  assert.equal(simulation.apply('ENTER'), true); assert.deepEqual([simulation.session.current.players[0].x, simulation.session.current.players[0].y], [2, 3]);
  assert.equal(simulation.apply('HINT'), true); assert.equal(simulation.level.category, 'hint');
  assert.equal(simulation.apply('EXIT'), true); assert.equal(simulation.level.id, level.id);
  assert.equal(simulation.apply('RESET'), true); assert.equal(simulation.session.current.moves, 0);
});

test('recorded original video routes satisfy intermediate and final checkpoints', { skip: !fs.existsSync('public/levels.local.json') }, () => {
  const imported: Dataset = JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8'));
  for (const scenario of referenceReplays) {
    const result = replayScenario(imported, scenario); assert.equal(result.passed, true, scenario.name);
    assert.equal(result.session.current.solved, true); assert.ok(result.rows.every(r => r.accepted));
  }
  const presets = editorPresets(), count = presets.scenarios.length; assert.equal(addReferenceReplays(imported, presets), 2); assert.equal(addReferenceReplays(imported, presets), 0);
  assert.equal(presets.scenarios.length, count + 2); assert.doesNotThrow(() => parseProject(JSON.stringify(presets)));
});
