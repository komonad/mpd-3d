import fs from 'node:fs';
import { savedSolutions, SolutionReplay, type SavedSolution } from '../src/solutions.ts';
import type { Dataset } from '../src/types.ts';

try {
  const data: Dataset = JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8'));
  const input = process.argv[2];
  const solutions: SavedSolution[] = input ? JSON.parse(fs.readFileSync(input, 'utf8')).solutions : savedSolutions;
  if (!Array.isArray(solutions) || !solutions.length) throw new Error('解法目录为空。');
  let failures = 0;
  for (const solution of solutions) {
    const replay = new SolutionReplay(data, solution); let blocked = false;
    while (!replay.finished) { replay.advance(); if (!replay.accepted) blocked = true; }
    const passed = !blocked && replay.passed; if (!passed) failures++;
    console.log(`${passed ? 'PASS' : 'FAIL'} ${solution.label} · ${replay.cursor} operations · ${replay.simulation.session.current.moves} moves · ${replay.simulation.session.current.pushes} pushes`);
  }
  console.log(`${solutions.length - failures}/${solutions.length} solutions passed`);
  if (failures) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
}
