import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { savedSolutions, SolutionReplay } from '../src/solutions';
import type { Dataset, State, TurnFrame } from '../src/types';

const data: Dataset | undefined = fs.existsSync('public/levels.local.json') ? JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) : undefined;
const source = 'https://www.bilibili.com/video/BV1Znt3z1EwU/';
const replay = (label: string) => new SolutionReplay(data!, savedSolutions.find(solution => solution.label === label)!);
const cell = (state: State | TurnFrame, key: number) => {
  const value = state.cells.find(part => part.key === key)!;
  return [value.x, value.y, value.temperature, value.container];
};

test('4-10 cold compression advances the housing around a supported L-shaped load', { skip: !data }, () => {
  const run = replay('4-10'); assert.equal(run.solution.source, source); run.seek(48);
  const state = run.simulation.session.current;
  assert.deepEqual(state.players.map(p => [p.x, p.y, p.temperature]), [[6, 5, -1]]);
  assert.deepEqual(cell(state, 72), [5, 4, 0, undefined]);
  assert.deepEqual(cell(state, 54), [4, 3, 0, undefined]);
  assert.deepEqual(cell(state, 55), [5, 3, 0, undefined]);
  assert.deepEqual(cell(state, 64), [5, 4, 0, 72]);
  assert.equal(state.pistons![0].expanded, false);
});

test('4-12 moves a concave transparent frame into the demon’s vacated address', { skip: !data }, () => {
  const run = replay('4-12'); assert.equal(run.solution.source, 'https://www.bilibili.com/video/BV1YtnuzmEuG/'); run.seek(57);
  assert.deepEqual(run.simulation.session.current.players.map(p => [p.x, p.y]), [[4, 7]]);
  assert.equal(run.advance()?.command, 'R'); assert.equal(run.accepted, true);
  const state = run.simulation.session.current;
  assert.deepEqual(state.players.map(p => [p.x, p.y, p.temperature]), [[5, 7, 0]]);
  assert.deepEqual([69, 70, 73, 74, 75, 80].map(key => cell(state, key)), [
    [4, 7, 0, undefined], [6, 7, 0, undefined], [4, 8, 0, undefined],
    [5, 8, 0, undefined], [6, 8, 0, undefined], [5, 9, 0, undefined],
  ]);
  assert.deepEqual(cell(state, 83), [5, 10, 0, undefined]); assert.equal(state.pistons![0].expanded, true);
});

test('4-15 translates the loaded housing together with its concave body', { skip: !data }, () => {
  const run = replay('4-15'); assert.equal(run.solution.source, source); run.seek(53);
  const state = run.simulation.session.current;
  assert.deepEqual(state.players.map(p => [p.x, p.y, p.temperature]), [[7, 3, 0]]);
  assert.deepEqual(cell(state, 64), [8, 3, -1, undefined]);
  assert.deepEqual(cell(state, 65), [8, 3, 0, 64]);
  assert.deepEqual([52, 53, 54].map(key => cell(state, key)), [[6, 2, 0, undefined], [7, 2, 0, undefined], [8, 2, 0, undefined]]);
  assert.deepEqual([63, 72, 73, 74].map(key => cell(state, key)), [[6, 3, -1, undefined], [6, 4, -1, undefined], [7, 4, -1, undefined], [8, 4, -1, undefined]]);
  assert.equal(state.pistons![0].expanded, false);
});

test('4-16 exposes the supported inventory before the cold housing retracts', { skip: !data }, () => {
  const run = replay('4-16'); assert.equal(run.solution.source, source); run.seek(22);
  const state = run.simulation.session.current;
  const exposed = state.turnFrames!.find(frame => frame.phase === 'heat' && frame.pistons[0].expanded && frame.cells.find(c => c.key === 48)?.x === 4)!;
  assert.ok(exposed);
  assert.deepEqual(cell(exposed, 48), [4, 6, -1, undefined]);
  assert.deepEqual(cell(exposed, 49), [3, 6, 0, undefined]);
  assert.deepEqual(exposed.players.map(p => [p.x, p.y, p.temperature]), [[4, 5, -1]]);
  assert.deepEqual(cell(state, 48), [3, 6, -1, undefined]);
  assert.deepEqual(cell(state, 49), [3, 6, 0, 48]); assert.equal(state.pistons![0].expanded, false);
});

test('4-17 cold compression stores the load without translating a free housing', { skip: !data }, () => {
  const run = replay('4-17'); assert.equal(run.solution.source, source); run.seek(41);
  const state = run.simulation.session.current;
  assert.deepEqual(state.players.map(p => [p.x, p.y, p.temperature]), [[2, 3, -1]]);
  assert.deepEqual(cell(state, 36), [3, 3, -1, undefined]);
  assert.deepEqual(cell(state, 37), [3, 3, 0, 36]);
  assert.deepEqual(cell(state, 30), [3, 2, 0, undefined]); assert.equal(state.pistons![0].expanded, false);
});
