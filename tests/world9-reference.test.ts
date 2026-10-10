import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initialState, move } from '../src/engine';
import { savedSolutions, SolutionReplay } from '../src/solutions';
import type { Dataset } from '../src/types';

const data: Dataset | undefined = fs.existsSync('public/levels.local.json') ? JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) : undefined;

test('9-14 settles its demon to neutral after leaving the retentive block', { skip: !data }, () => {
  const run = new SolutionReplay(data!, savedSolutions.find(solution => solution.label === '9-14')!);
  assert.equal(run.solution.source, 'https://www.bilibili.com/video/BV1QugJ6PEMQ/');
  run.seek(1);
  assert.deepEqual(run.simulation.session.current.players.map(p => [p.x, p.y, p.temperature]), [[2, 2, 2]]);
  run.advance(); assert.equal(run.accepted, true);
  assert.deepEqual(run.simulation.session.current.players.map(p => [p.x, p.y, p.temperature]), [[1, 2, 0]]);
});

test('9-17 opens by moving the enclosing frame with both demons', { skip: !data }, () => {
  const level = data!.levels.find(level => level.displayName === '9-17')!, state = initialState(level);
  const next = move(level, state, 2)!;
  assert.ok(next);
  assert.deepEqual(next.players.map(p => [p.x, p.y]), [[4, 3], [4, 4]]);
  const frame = [29, 30, 31, 38, 39, 46, 47];
  assert.deepEqual(next.cells.filter(c => frame.includes(c.key)).map(c => [c.x, c.y]), [[3, 2], [4, 2], [5, 2], [3, 3], [5, 3], [3, 4], [5, 4]]);
  assert.equal(next.moves, 1); assert.equal(next.pushes, 1);
});

test('9-25 retains its load through reset before the final movement and actuation', { skip: !data }, () => {
  const run = new SolutionReplay(data!, savedSolutions.find(solution => solution.label === '9-25')!);
  assert.equal(run.solution.source, 'https://www.bilibili.com/video/BV1mRtQzyEK4/');
  run.seek(run.operations.length - 2);
  const before = run.simulation.session.current.cells.find(c => c.key === 44)!;
  assert.deepEqual([before.x, before.y, before.temperature], [2, 2, 2]);
  assert.equal(run.advance()?.command, 'RESET'); assert.equal(run.accepted, true);
  const reset = run.simulation.session.current;
  assert.equal(reset.solved, false);
  assert.deepEqual(reset.cells.filter(c => c.key === 44).map(c => [c.x, c.y, c.temperature]), [[2, 2, 2]]);
  assert.equal(run.advance()?.command, 'U'); assert.equal(run.accepted, true); assert.equal(run.passed, true);
  assert.deepEqual(run.simulation.session.current.pistons!.map(p => p.expanded), [true, true]);
  assert.deepEqual(run.simulation.session.current.cells.filter(c => c.key === 44).map(c => [c.x, c.y, c.temperature]), [[3, 1, 2]]);
});
