import type { Dataset } from './types';
import type { EditorProject, Scenario } from './editor-model';

export const referenceReplays: Scenario[] = [
  { name: '原作视频 · 1-1 通关', levelId: '79c615b0', actions: 'D R5 U L2 D L U3', source: 'https://www.youtube.com/watch?v=gKuCMkj5w04', checks: [
    { step: 6, path: 'players.0.x', equals: 7 }, { step: 6, path: 'players.0.y', equals: 5 },
    { step: 8, path: 'cells.28.x', equals: 5 }, { step: 14, path: 'cells.28.x', equals: 4 }, { step: 14, path: 'cells.28.y', equals: 1 },
    { step: 14, path: 'players.0.x', equals: 4 }, { step: 14, path: 'players.0.y', equals: 2 }, { step: 14, path: 'solved', equals: true },
  ] },
  { name: '原作视频 · 1-2 假死、重置与通关', levelId: 'a742df19', actions: 'U3 R7 D L4 RESET U3 R7 D3 L U R U L6', source: 'https://www.youtube.com/watch?v=u9gbDcNc3Qw', checks: [
    { step: 15, path: 'frozen', equals: true }, { step: 15, path: 'players.0.temperature', equals: 1 },
    { step: 15, path: 'cells.14.x', equals: 4 }, { step: 15, path: 'cells.17.temperature', equals: 1 },
    { step: 16, path: 'moves', equals: 0 }, { step: 16, path: 'players.0.temperature', equals: 0 },
    { step: 39, path: 'cells.14.x', equals: 2 }, { step: 39, path: 'cells.14.y', equals: 1 },
    { step: 39, path: 'cells.17.y', equals: 2 }, { step: 39, path: 'cells.17.temperature', equals: 0 },
    { step: 39, path: 'solved', equals: true }, { step: 39, path: 'moves', equals: 23 }, { step: 39, path: 'pushes', equals: 7 },
  ] },
];

export function addReferenceReplays(data: Dataset, project: EditorProject): number {
  let added = 0;
  for (const scenario of referenceReplays) {
    const level = data.levels.find(l => l.id === scenario.levelId); if (!level) continue;
    if (!project.levels.some(l => l.id === level.id)) { if (project.levels.length >= 128) continue; project.levels.push(structuredClone(level)); }
    if (!project.scenarios.some(s => s.name === scenario.name && s.levelId === scenario.levelId)) { project.scenarios.push(structuredClone(scenario)); added++; }
  }
  return added;
}
