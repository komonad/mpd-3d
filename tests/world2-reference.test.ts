import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bodies, edge } from '../src/engine';
import { savedSolutions, SolutionReplay } from '../src/solutions';
import type { Dataset } from '../src/types';

const data: Dataset | undefined = fs.existsSync('public/levels.local.json') ? JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) : undefined;
const source = 'https://www.bilibili.com/video/BV14ahxzLEsA/';
const replay = (label: string) => new SolutionReplay(data!, savedSolutions.find(s => s.label === label)!);

test('2-1 matches the adhesive bar and cold welded finish in the original route', { skip: !data }, () => {
  const run = replay('2-1'); assert.equal(run.solution.source, source);
  run.seek(run.solution.entryStep!);
  const bar = run.simulation.session.current.cells.filter(c => c.key === 15 || c.key === 16);
  assert.ok(bar.every(c => edge(c, 1) === 3));
  run.seek(run.solution.entryStep! + 2);
  assert.deepEqual(run.simulation.session.current.players.map(p => [p.x, p.y, p.temperature]), [[4, 2, -1]]);
  run.seek(run.operations.length);
  const state = run.simulation.session.current;
  assert.deepEqual(state.players.map(p => [p.x, p.y, p.temperature]), [[8, 2, -1]]);
  assert.deepEqual(state.cells.filter(c => [12, 15, 16, 19].includes(c.key)).map(c => [c.x, c.y, c.temperature]), [[2, 1, -1], [8, 1, -1], [9, 1, -1], [9, 2, -1]]);
  assert.ok(bodies(state.cells).some(group => [15, 16, 19].every(key => group.some(c => c.key === key))));
  assert.equal(run.passed, true);
});

test('2-8 retains the separate transparent conductor below its neutral finish', { skip: !data }, () => {
  const run = replay('2-8'); assert.equal(run.solution.source, source); run.seek(run.operations.length);
  const state = run.simulation.session.current;
  assert.deepEqual(state.players.map(p => [p.x, p.y, p.temperature]), [[5, 4, 0]]);
  const glass = state.cells.find(c => c.key === 27)!;
  assert.deepEqual([glass.x, glass.y, glass.temperature, glass.storesHeat], [6, 5, 0, false]);
  assert.deepEqual(state.cells.filter(c => c.x === 4 && c.y === 4).map(c => [c.storesHeat, c.temperature]), [[true, 0]]);
  assert.equal(run.passed, true);
});

test('2-12 matches the updated two-slot layout and neutral final columns', { skip: !data }, () => {
  const run = replay('2-12'); assert.equal(run.solution.source, 'https://www.bilibili.com/video/BV1paxCzrE4M/'); run.seek(run.operations.length);
  const state = run.simulation.session.current;
  assert.deepEqual(state.players.map(p => [p.x, p.y, p.temperature]), [[6, 3, 0]]);
  assert.deepEqual(state.cells.filter(c => [16, 19, 20, 26, 34].includes(c.key)).map(c => [c.x, c.y, c.temperature]), [[3, 1, 0], [3, 2, 0], [6, 4, 0], [6, 5, 0], [6, 6, 0]]);
  assert.equal(run.passed, true);
});

test('2-14 finishes by positioning its transparent ring around the isolated hot goal block', { skip: !data }, () => {
  const run = replay('2-14'); assert.equal(run.solution.source, source); run.seek(run.operations.length);
  const state = run.simulation.session.current;
  assert.deepEqual(state.players.map(p => [p.x, p.y, p.temperature]), [[6, 6, 0]]);
  assert.deepEqual(state.cells.filter(c => c.key === 63).map(c => [c.x, c.y, c.temperature, c.storesHeat]), [[10, 10, 1, true]]);
  assert.ok(bodies(state.cells).some(group => group.length === 40 && group.every(c => !c.storesHeat)));
  assert.equal(run.passed, true);
});
