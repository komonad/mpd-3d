import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { observableState, Simulation } from '../src/editor-model';
import { savedSolutions, SolutionReplay } from '../src/solutions';
import type { Dataset } from '../src/types';

const data: Dataset | undefined = fs.existsSync('public/levels.local.json') ? JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) : undefined;

test('saved solution identifiers are unique and world 1 includes every main room', () => {
  assert.equal(new Set(savedSolutions.map(s => s.levelId)).size, savedSolutions.length);
  assert.deepEqual(savedSolutions.filter(s => s.label.startsWith('1-')).map(s => s.label), Array.from({ length: 20 }, (_, i) => `1-${i + 1}`));
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

for (const label of ['1-11', '7-1', '3-1']) {
  test(`seeking ${label} reconstructs undo, reset and room-entry history`, { skip: !data }, () => {
    const replay = new SolutionReplay(data!, savedSolutions.find(s => s.label === label)!);
    const sim = new Simulation(data!, data!.levels.find(l => l.id === replay.solution.levelId)!);
    const special = replay.operations.findIndex(op => !['L', 'D', 'R', 'U'].includes(op.command));
    assert.ok(special >= 0);
    for (const operation of replay.operations.slice(0, special + 2)) sim.apply(operation.command, operation.target);
    replay.seek(replay.operations.length); assert.equal(replay.passed, true);
    replay.seek(special + 2); assert.deepEqual(observableState(replay.simulation.session.current), observableState(sim.session.current));
    replay.seek(0); assert.equal(replay.cursor, 0); assert.equal(replay.simulation.session.current.moves, 0);
    assert.throws(() => replay.seek(-1)); assert.throws(() => replay.seek(replay.operations.length + 1)); assert.throws(() => replay.seek(0.5));
  });
}
