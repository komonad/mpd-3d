import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bodies, edge } from '../src/engine';
import { savedSolutions, SolutionReplay } from '../src/solutions';
import type { Dataset } from '../src/types';

const data: Dataset | undefined = fs.existsSync('public/levels.local.json') ? JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) : undefined;
const source = 'https://www.bilibili.com/video/BV1PUhuz8ExK/';
const replay = (label: string) => new SolutionReplay(data!, savedSolutions.find(solution => solution.label === label)!);

test('3-3 enters the updated tutorial without conducting heat on the transition', { skip: !data }, () => {
  const run = replay('3-3'); assert.equal(run.solution.source, 'https://www.bilibili.com/video/BV1GQVb6MEKd/');
  run.seek(7);
  const state = run.simulation.session.current;
  assert.deepEqual(state.players.map(player => [player.x, player.y, player.temperature]), [[4, 2, 0]]);
  assert.equal(state.outside, 1); assert.equal(state.transient, true);
  run.seek(run.operations.length); assert.equal(run.passed, true);
});

test('3-5 self-entry cuts the cold body at the spawn and exposes adhesive edges', { skip: !data }, () => {
  const run = replay('3-5'); assert.equal(run.solution.source, source); run.seek(24);
  const state = run.simulation.session.current;
  assert.deepEqual(state.players.map(player => [player.x, player.y, player.temperature]), [[4, 2, 0]]);
  assert.equal(state.cells.some(cell => cell.x === 4 && cell.y === 2), false);
  const right = state.cells.find(cell => cell.x === 5 && cell.y === 2)!, bottom = state.cells.find(cell => cell.x === 4 && cell.y === 3)!;
  assert.equal(right.temperature, -1); assert.equal(bottom.temperature, -1);
  assert.equal(edge(right, 0), 3); assert.equal(edge(bottom, 3), 3);
  assert.equal(run.simulation.apply('RESET'), true);
  assert.equal(run.simulation.session.current.cells.some(cell => cell.x === 4 && cell.y === 2), false);
});

test('3-8 preserves and pushes the mixed transparent frame surrounding its spawn', { skip: !data }, () => {
  const run = replay('3-8'); assert.equal(run.solution.source, source); run.seek(174);
  const state = run.simulation.session.current;
  assert.deepEqual(state.players.map(player => [player.x, player.y, player.temperature]), [[4, 7, 0]]);
  const frame = bodies(state.cells).find(group => group.length === 8)!;
  assert.deepEqual(frame.map(cell => [cell.x, cell.y, cell.storesHeat]).sort(), [
    [3, 6, false], [3, 7, true], [3, 8, false], [4, 6, true], [4, 8, true], [5, 6, false], [5, 7, true], [5, 8, false],
  ].sort());
  assert.equal(run.advance()?.command, 'D'); assert.equal(run.accepted, true);
  assert.deepEqual(run.simulation.session.current.players.map(player => [player.x, player.y]), [[4, 8]]);
  const moved = bodies(run.simulation.session.current.cells).find(group => group.length === 8)!;
  assert.deepEqual(moved.map(cell => [cell.x, cell.y, cell.storesHeat]).sort(), frame.map(cell => [cell.x, cell.y + 1, cell.storesHeat]).sort());
});

test('3-13 uses the lower world shortcut to return through a fixed wall', { skip: !data }, () => {
  const run = replay('3-13'); assert.equal(run.solution.source, source);
  const wall = bodies(run.simulation.session.current.cells).find(group => group.some(cell => cell.x === 6 && cell.y === 5))!;
  assert.equal(wall.some(cell => cell.fixed), true);
  run.seek(61);
  assert.equal(run.simulation.session.current.levelId, '83e5acbe');
  for (const id of ['9334fa16', '83e5acbe']) assert.deepEqual(run.simulation.session.entries[id].directions, [3]);
  assert.equal(run.advance()?.command, 'EXIT'); assert.equal(run.accepted, true);
  const state = run.simulation.session.current;
  assert.equal(state.levelId, '9334fa16'); assert.equal(state.outside, 0);
  assert.deepEqual(state.players.map(player => [player.x, player.y, player.temperature]), [[6, 5, 0]]);
  assert.equal(state.cells.some(cell => cell.x === 6 && cell.y === 5), false);
  assert.equal(run.simulation.apply('RESET'), true);
  assert.equal(run.simulation.session.current.cells.some(cell => cell.x === 6 && cell.y === 5), false);
});

test('3-19 returns through its parent after discovering the nested world shortcut', { skip: !data }, () => {
  const run = replay('3-19'); assert.equal(run.solution.source, source); run.seek(104);
  for (const id of ['3b787421', 'c2c9af47']) assert.deepEqual(run.simulation.session.entries[id].directions, [2]);
  assert.equal(run.advance()?.command, 'EXIT'); assert.equal(run.accepted, true);
  assert.equal(run.simulation.session.current.levelId, '3b787421');
  assert.deepEqual(run.simulation.session.current.players.map(player => [player.x, player.y, player.temperature]), [[7, 6, 0]]);
  run.seek(run.operations.length);
  const state = run.simulation.session.current;
  assert.deepEqual(state.players.map(player => [player.x, player.y, player.temperature]), [[7, 3, -1]]);
  assert.equal(state.outside, -1);
  assert.deepEqual(state.cells.filter(cell => cell.x === 7 && cell.y === 2).map(cell => [cell.temperature, cell.storesHeat]), [[-1, true]]);
  assert.equal(run.passed, true);
});
