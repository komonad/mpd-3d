import { blankLevel, type EditorProject } from './editor-model';
import { laboratory } from './laboratory';

export function editorPresets(): EditorProject {
  const head = { fixed: false, storesHeat: true, temperature: 0 as const, edges: 0xaa };
  const glass = blankLevel('editor-glass-sticky'); glass.title = '透明粘边'; glass.players = [{ x: 2, y: 4 }];
  glass.cells.push({ x: 3, y: 4, fixed: false, storesHeat: false, temperature: 0, edges: 0x75 }, { x: 5, y: 4, fixed: false, storesHeat: false, temperature: 0, edges: 0x55 });
  const piston = blankLevel('editor-empty-piston'); piston.title = '空活塞与外墙'; piston.players = [{ x: 6, y: 4 }];
  piston.cells.push({ x: 7, y: 4, fixed: false, storesHeat: true, temperature: 2, edges: 0x65 });
  piston.pistons = [{ model: 'boundary', baseKey: 32, headKey: -10032, direction: 2, expanded: false, order: 0,
    head: { fixed: false, storesHeat: true, temperature: 2, edges: 0x65 } }];
  const retained = blankLevel('editor-retained'); retained.title = '第4温度重置'; retained.players = [{ x: 2, y: 4 }];
  retained.cells.push({ x: 3, y: 4, fixed: false, storesHeat: true, temperature: 2, edges: 0x55 });
  const transient = structuredClone(laboratory[4]); transient.id = 'editor-transient'; transient.title = '假死与活塞恢复';
  const priority = blankLevel('editor-piston-entry'); priority.title = '活塞推动与进入'; priority.players = [{ x: 5, y: 4 }];
  priority.cells.push({ x: 4, y: 4, fixed: false, storesHeat: true, temperature: 0, edges: 0xaa });
  priority.pistons = [{ model: 'boundary', baseKey: 32, headKey: -10032, direction: 2, expanded: false, order: 0, head: { ...head } }];
  const advance = blankLevel('editor-piston-advance'); advance.title = '向上推动与收纳'; advance.players = [{ x: 4, y: 5 }];
  advance.cells.push({ x: 4, y: 4, fixed: false, storesHeat: true, temperature: 0, edges: 0x55 },
    { x: 4, y: 3, fixed: false, storesHeat: true, temperature: -1, edges: 0x55 }, { x: 4, y: 2, fixed: true, storesHeat: true, temperature: 0, edges: 0x55 });
  advance.pistons = [{ model: 'boundary', baseKey: 32, headKey: -10032, direction: 3, expanded: true, order: 0, head: { ...head, edges: 0x55 } }];
  const nested = blankLevel('editor-piston-nested-entry'); nested.title = '多层活塞进入'; nested.players = [{ x: 5, y: 4 }];
  nested.cells.push({ x: 4, y: 4, fixed: true, storesHeat: true, temperature: 0, edges: 0xaa },
    { x: 4, y: 4, container: 32, fixed: false, storesHeat: true, temperature: 0, edges: 0xaa });
  nested.pistons = [32, 33].map((baseKey, order) => ({ model: 'boundary', baseKey, headKey: -10000 - baseKey, direction: 2, expanded: false, order, head: { ...head } }));
  return { version: 1, levels: [glass, piston, retained, transient, priority, advance, nested], currentId: glass.id, scenarios: [
    { name: '透明粘边连接与整体推动', levelId: glass.id, actions: 'R D R U', checks: [
      { step: 1, path: 'cells.32.x', equals: 4 }, { step: 4, path: 'cells.32.y', equals: 3 }, { step: 4, path: 'cells.33.y', equals: 3 }, { step: 4, path: 'accepted', equals: true },
    ] },
    { name: '压缩空活塞不能收纳外墙', levelId: piston.id, actions: 'R', checks: [{ step: 1, path: 'accepted', equals: false }, { step: 1, path: 'cells.32.x', equals: 7 }, { step: 1, path: 'cells.32.container', equals: null }] },
    { name: '第4温度方块保留位移', levelId: retained.id, actions: 'R RESET', checks: [{ step: 2, path: 'cells.32.x', equals: 4 }, { step: 2, path: 'cells.32.temperature', equals: 2 }, { step: 2, path: 'players.0.x', equals: 3 }] },
    { name: '瞬时假死在结算后恢复', levelId: transient.id, actions: 'L', checks: [{ step: 1, path: 'frozen', equals: false }, { step: 1, path: 'players.0.temperature', equals: 0 }] },
    { name: '活塞先推动，受阻后进入', levelId: priority.id, actions: 'L4 R', checks: [
      { step: 1, path: 'cells.32.x', equals: 3 }, { step: 1, path: 'players.0.container', equals: null }, { step: 1, path: 'pushes', equals: 1 },
      { step: 3, path: 'cells.32.x', equals: 1 }, { step: 3, path: 'players.0.x', equals: 2 }, { step: 3, path: 'players.0.container', equals: null },
      { step: 4, path: 'cells.32.x', equals: 1 }, { step: 4, path: 'players.0.container', equals: 32 }, { step: 4, path: 'pushes', equals: 3 },
      { step: 5, path: 'players.0.x', equals: 2 }, { step: 5, path: 'players.0.container', equals: null },
    ] },
    { name: '展开活塞向上收纳受阻方块', levelId: advance.id, actions: 'U', checks: [
      { step: 1, path: 'accepted', equals: true }, { step: 1, path: 'cells.32.y', equals: 3 }, { step: 1, path: 'cells.33.container', equals: 32 },
      { step: 1, path: 'pistons.0.expanded', equals: false }, { step: 1, path: 'cells.32.temperature', equals: 0 },
      { step: 1, path: 'frames.0.cells.32.temperature', equals: 1 }, { step: 1, path: 'frames.0.pistons.0.expanded', equals: false },
    ] },
    { name: '沿多层活塞开口进入和退出', levelId: nested.id, actions: 'L U L R', checks: [
      { step: 1, path: 'players.0.container', equals: 33 }, { step: 2, path: 'accepted', equals: false }, { step: 3, path: 'accepted', equals: false },
      { step: 4, path: 'players.0.x', equals: 5 }, { step: 4, path: 'players.0.container', equals: null }, { step: 4, path: 'pushes', equals: 0 },
    ] },
  ] };
}

export function addMechanismPresets(project: EditorProject): number {
  const presets = editorPresets(); let added = 0;
  for (const level of presets.levels) if (!project.levels.some(l => l.id === level.id) && project.levels.length < 128) project.levels.push(structuredClone(level));
  for (const scenario of presets.scenarios) if (project.levels.some(l => l.id === scenario.levelId) && !project.scenarios.some(s => s.name === scenario.name && s.levelId === scenario.levelId)) {
    project.scenarios.push(structuredClone(scenario)); added++;
  }
  return added;
}
