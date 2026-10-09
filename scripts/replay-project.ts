import fs from 'node:fs';
import { parseProject, projectDataset, replayScenario } from '../src/editor-model.ts';
import { editorPresets } from '../src/editor-presets.ts';
import { addReferenceReplays } from '../src/reference-replays.ts';
import type { Dataset } from '../src/types.ts';

try {
  const base: Dataset = fs.existsSync('public/levels.local.json') ? JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')) : { version: 1, world: '', levels: [], hints: {} };
  const project = process.argv[2] ? parseProject(fs.readFileSync(process.argv[2], 'utf8')) : editorPresets();
  if (!process.argv[2]) addReferenceReplays(base, project);
  const data = projectDataset(base, project), results = project.scenarios.map(scenario => {
    const result = replayScenario(data, scenario);
    return { name: scenario.name, levelId: scenario.levelId, passed: result.passed, steps: result.rows.length, checks: result.checks.length,
      failures: result.checks.filter(c => !c.passed).map(({ step, path, equals, actual }) => ({ step, path, expected: equals, actual: actual ?? null })) };
  });
  console.log(JSON.stringify({ passed: results.length > 0 && results.every(r => r.passed), cases: results }, null, 2));
  if (!results.length || results.some(r => !r.passed)) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
}
