import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initialState, move } from '../src/engine';
import { savedSolutions, SolutionReplay } from '../src/solutions';
import type { Dataset } from '../src/types';
import { address } from '../src/topology';

const data: Dataset | undefined = fs.existsSync('public/levels.local.json') ? JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) : undefined;

test('9-5 pushes an overheated demon with its movable entrance', { skip: !data }, () => {
  const level = data!.levels.find(level => level.displayName === '9-5')!;
  const state = initialState({ ...level, players: [{ x: 5, y: 3 }, { x: 7, y: 3 }] });
  const first = move(level, state, 2)!;
  assert.deepEqual(first.players.map(p => [p.x, p.y, p.temperature]), [[6, 3, 0], [8, 3, 1]]);
  const next = move(level, first, 2)!;
  assert.ok(next);
  assert.deepEqual(next.players.map(p => [p.x, p.y, p.temperature]), [[7, 3, 0], [9, 3, 1]]);
  assert.equal(next.cells.find(c => c.portal?.target === '5c96029d')!.x, 8);
});

test('9-6 resets around the retained upper block before pushing it onto the goal', { skip: !data }, () => {
  const run = new SolutionReplay(data!, savedSolutions.find(solution => solution.label === '9-6')!);
  run.seek(run.operations.length - 2);
  assert.deepEqual(run.simulation.session.current.cells.filter(c => c.key === 18).map(c => [c.x, c.y, c.temperature]), [[11, 5, 2]]);
  assert.equal(run.advance()?.command, 'RESET'); assert.equal(run.accepted, true);
  const reset = run.simulation.session.current;
  assert.deepEqual(reset.cells.filter(c => c.key === 18).map(c => [c.x, c.y, c.temperature]), [[11, 5, 2]]);
  assert.equal(reset.players.length, 2); assert.equal(reset.solved, false);
  assert.equal(run.advance()?.command, 'R'); assert.equal(run.accepted, true); assert.equal(run.passed, true);
  assert.deepEqual(run.simulation.session.current.cells.filter(c => c.key === 18).map(c => [c.x, c.y]), [[12, 5]]);
  assert.equal(run.simulation.session.current.moves, 1); assert.equal(run.simulation.session.current.pushes, 1);
});

test('9-11 moves a compressed housing with the transparent frame behind it', { skip: !data }, () => {
  const run = new SolutionReplay(data!, savedSolutions.find(solution => solution.label === '9-11')!);
  assert.equal(run.solution.source, 'https://www.bilibili.com/video/BV1ewbW6cEx7/');
  run.seek(57);
  const before = run.simulation.session.current;
  assert.deepEqual(before.players.map(p => [p.x, p.y]), [[7, 4]]);
  assert.equal(before.pistons![0].expanded, false);
  assert.deepEqual(before.cells.filter(c => [18, 24].includes(c.key)).map(c => [c.x, c.y]), [[8, 3], [7, 3]]);
  assert.equal(run.advance()?.command, 'U'); assert.equal(run.accepted, true);
  const after = run.simulation.session.current;
  assert.deepEqual(after.players.map(p => [p.x, p.y]), [[7, 3]]);
  assert.equal(after.pistons![0].expanded, false);
  assert.deepEqual(after.cells.filter(c => [18, 24].includes(c.key)).map(c => [c.x, c.y]), [[8, 2], [7, 2]]);
});

test('9-14 settles its demon to neutral after leaving the retentive block', { skip: !data }, () => {
  const run = new SolutionReplay(data!, savedSolutions.find(solution => solution.label === '9-14')!);
  assert.equal(run.solution.source, 'https://www.bilibili.com/video/BV1QugJ6PEMQ/');
  run.seek(1);
  assert.deepEqual(run.simulation.session.current.players.map(p => [p.x, p.y, p.temperature]), [[2, 2, 2]]);
  run.advance(); assert.equal(run.accepted, true);
  assert.deepEqual(run.simulation.session.current.players.map(p => [p.x, p.y, p.temperature]), [[1, 2, 0]]);
});

test('9-15 exchanges the retentive housing temperature before resetting and restoring its final load', { skip: !data }, () => {
  const run = new SolutionReplay(data!, savedSolutions.find(solution => solution.label === '9-15')!);
  run.seek(87);
  assert.deepEqual(run.simulation.session.current.cells.filter(c => c.key === 31).map(c => [c.x, c.y, c.temperature]), [[10, 4, 2]]);
  assert.equal(run.advance()?.command, 'R'); assert.equal(run.accepted, true);
  const exchanged = run.simulation.session.current;
  assert.deepEqual(exchanged.players.map(p => [p.x, p.y, p.temperature]), [[9, 4, 2]]);
  assert.deepEqual(exchanged.cells.filter(c => c.key === 31).map(c => [c.x, c.y, c.temperature]), [[10, 4, 0]]);
  assert.ok(exchanged.turnFrames!.some(frame => frame.pistons.some(p => p.baseKey === 31 && !p.expanded) && frame.cells.some(c => c.key === 31 && c.temperature === 1)));
  assert.equal(run.advance()?.command, 'RESET'); assert.equal(run.accepted, true);
  assert.deepEqual(run.simulation.session.current.cells.filter(c => c.key === 31).map(c => [c.x, c.y, c.temperature]), [[5, 2, 1]]);
  run.seek(run.operations.length - 2);
  assert.deepEqual(run.simulation.session.current.cells.filter(c => c.key === 28).map(c => [c.x, c.y]), [[10, 3]]);
  run.advance(); run.advance(); assert.equal(run.passed, true);
  assert.deepEqual(run.simulation.session.current.cells.filter(c => c.key === 28).map(c => [c.x, c.y]), [[10, 5]]);
});

test('9-22 carries its transparent goal block with the absent lower face of the cold load', { skip: !data }, () => {
  const run = new SolutionReplay(data!, savedSolutions.find(solution => solution.label === '9-22')!);
  run.seek(211);
  assert.deepEqual(run.simulation.session.current.cells.filter(c => [24, 41].includes(c.key)).map(c => [c.key, c.x, c.y]), [[24, 4, 5], [41, 4, 6]]);
  assert.equal(run.advance()?.command, 'U'); assert.equal(run.accepted, true);
  assert.deepEqual(run.simulation.session.current.cells.filter(c => [24, 41].includes(c.key)).map(c => [c.key, c.x, c.y]), [[24, 4, 4], [41, 4, 5]]);
  run.seek(run.operations.length - 1);
  assert.equal(run.advance()?.command, 'D'); assert.equal(run.passed, true);
  assert.deepEqual(run.simulation.session.current.cells.filter(c => c.key === 29).map(c => [c.x, c.y, c.temperature]), [[4, 6, 2]]);
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

test('9-24 preserves carried inventories through the final chain of thermal actions', { skip: !data }, () => {
  const run = new SolutionReplay(data!, savedSolutions.find(solution => solution.label === '9-24')!);
  assert.equal(run.solution.source, 'https://www.bilibili.com/video/BV1mRtQzyEK4/');
  run.seek(run.operations.length - 1);
  assert.deepEqual(run.simulation.session.current.players.map(p => [p.x, p.y]), [[8, 6]]);
  assert.equal(run.advance()?.command, 'R'); assert.equal(run.accepted, true); assert.equal(run.passed, true);
  const state = run.simulation.session.current;
  assert.deepEqual(state.players.map(p => [p.x, p.y]), [[9, 6]]);
  assert.deepEqual(state.cells.filter(c => [92, 93].includes(c.key)).map(c => [c.x, c.y, c.container]), [[20, 5, undefined], [20, 5, 92]]);
  assert.equal(state.pistons!.find(p => p.baseKey === 92)!.expanded, false);
  assert.deepEqual(state.cells.filter(c => c.key === 118).map(c => [c.x, c.y]), [[23, 5]]);
  assert.ok(state.turnFrames!.length >= 20);
  for (const frame of state.turnFrames!) {
    assert.deepEqual(frame.players.map(p => [p.x, p.y]), [[9, 6]]);
    assert.equal(new Set(frame.cells.map(address)).size, frame.cells.length);
    for (const cell of frame.cells.filter(c => c.container !== undefined)) {
      const parent = frame.cells.find(c => c.key === cell.container)!;
      assert.deepEqual([cell.x, cell.y], [parent.x, parent.y]);
      assert.equal(frame.pistons.find(p => p.baseKey === parent.key)!.expanded, false);
    }
  }
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
