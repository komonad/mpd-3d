import assert from 'node:assert/strict';
import test from 'node:test';
import { blankLevel, replayScenario, Simulation, validateLevel } from '../src/editor-model';
import { editorPresets } from '../src/editor-presets';
import { editorTestWorldId, isEditorTestLevel, withEditorTestWorld } from '../src/editor-test-world';
import { startSession } from '../src/session';
import type { Dataset } from '../src/types';

const original = blankLevel('original-root'); original.category = 'world'; original.worldId = original.id;
const source: Dataset = { version: 1, world: original.id, root: original.id, hub: original.id, levels: [original], hints: {},
  worlds: [{ id: original.id, index: 0, title: 'Root', description: '', supported: true }] };

test('test world preserves the native root and contains only independent fixtures', () => {
  const before = structuredClone(source), data = withEditorTestWorld(source);
  assert.deepEqual(source, before); assert.deepEqual(data.levels[0], source.levels[0]);
  assert.equal(startSession(data).current.levelId, original.id);
  assert.equal(data.levels[0].cells.some(c => c.portal?.target === editorTestWorldId), false);
  const rooms = data.levels.filter(isEditorTestLevel); assert.equal(rooms.length, 21);
  assert.equal(data.worlds!.at(-1)!.id, editorTestWorldId);
  for (const room of rooms) assert.deepEqual(validateLevel(room), [], room.id);
  assert.deepEqual(withEditorTestWorld(data), data);
});

test('gallery entrances resolve all fixtures and nested rooms retain their canonical return chain', () => {
  const data = withEditorTestWorld(source), world = data.levels.find(l => l.id === editorTestWorldId)!;
  assert.equal(world.cells.filter(c => c.portal).length, 20);
  for (const entrance of world.cells.filter(c => c.portal)) assert.ok(data.levels.some(l => l.id === entrance.portal!.target && isEditorTestLevel(l)));
  const leaf = data.levels.find(l => l.id === 'editor-portal-leaf')!, simulation = new Simulation(data, leaf);
  assert.equal(simulation.apply('EXIT'), true); assert.equal(simulation.level.id, 'editor-portal-child');
  assert.equal(simulation.apply('EXIT'), true); assert.equal(simulation.level.id, 'editor-portal-hub');
  assert.equal(simulation.apply('EXIT'), true); assert.equal(simulation.level.id, editorTestWorldId);
});

test('gallery metadata preserves every mechanism scenario expectation', () => {
  const data = withEditorTestWorld(source);
  for (const scenario of editorPresets().scenarios) {
    const result = replayScenario(data, scenario);
    assert.equal(result.passed, true, `${scenario.name}: ${JSON.stringify(result.checks.filter(c => !c.passed))}`);
  }
});
