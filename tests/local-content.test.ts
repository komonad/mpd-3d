import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { importLevelDataset } from '../scripts/level-dataset.mjs';
import { publicDataset, publicSolutions } from '../scripts/public-content.mjs';
import { startSession } from '../src/session';
import { SolutionReplay, type SavedSolution } from '../src/solutions';
import type { Dataset } from '../src/types';

const available = fs.existsSync('public/levels.local.json');
const source: Dataset = available ? JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) : undefined;
test('public catalogue contains only worlds 1–2 and an independent entrance', { skip: !available }, () => {
  const data = publicDataset(source), ids = new Set(data.levels.map(level => level.id));
  assert.equal(data.levels.length, source.levels.filter(level => source.worlds!.filter(world => world.index === 1 || world.index === 2).some(world => world.id === level.worldId)).length + 1);
  assert.equal(startSession(data).current.levelId, 'preview-hub');
  assert.deepEqual(data.worlds!.map(world => world.index), [0, 1, 2]);
  assert.deepEqual(data.hints, {});
  for (const level of data.levels) {
    if (level.parentId) assert.ok(ids.has(level.parentId));
    if (level.hintId) assert.ok(ids.has(level.hintId));
    for (const cell of level.cells) if (cell.portal) assert.ok(ids.has(cell.portal.target));
  }
  assert.equal(source.edition, undefined);
});
test('public solutions contain no embedded room snapshots and replay within the public catalogue', { skip: !available }, () => {
  const data = publicDataset(source);
  const catalogue = JSON.parse(fs.readFileSync('src/solutions.json', 'utf8')) as { version: number; solutions: SavedSolution[] };
  const result = publicSolutions(catalogue, data);
  assert.ok(result.solutions.length > 0);
  for (const solution of result.solutions) {
    assert.ok(!solution.start || !('session' in solution.start));
    const replay = new SolutionReplay(data, solution);
    while (!replay.finished) { replay.advance(); assert.equal(replay.accepted, true, `${solution.label} step ${replay.cursor}`); }
    assert.equal(replay.passed, true, solution.label);
  }
});
const installation = "C:/Program Files (x86)/Steam/steamapps/common/Maxwell's puzzling demon";
test('browser byte arrays produce the same catalogue as the local Node importer', { skip: !available || !fs.existsSync(installation) }, async () => {
  const data = await importLevelDataset(async (name, optional) => {
    const file = path.join(installation, name);
    if (optional && !fs.existsSync(file)) return undefined;
    return new Uint8Array(fs.readFileSync(file));
  });
  assert.equal(JSON.stringify(data), JSON.stringify(source));
});
test('missing room data rejects an import before producing a catalogue', { skip: !fs.existsSync(installation) }, async () => {
  await assert.rejects(importLevelDataset(async (name, optional) => {
    if (name.endsWith('.mxw')) throw new Error('Missing room');
    const file = path.join(installation, name);
    return optional && !fs.existsSync(file) ? undefined : new Uint8Array(fs.readFileSync(file));
  }), /Missing room/);
});
