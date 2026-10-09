import { blankLevel, type EditorProject } from './editor-model';
import { laboratory } from './laboratory';

export function editorPresets(): EditorProject {
  const glass = blankLevel('editor-glass-sticky'); glass.title = '透明粘边'; glass.players = [{ x: 2, y: 4 }];
  glass.cells.push({ x: 3, y: 4, fixed: false, storesHeat: false, temperature: 0, edges: 0x75 }, { x: 5, y: 4, fixed: false, storesHeat: false, temperature: 0, edges: 0x55 });
  const piston = blankLevel('editor-empty-piston'); piston.title = '空活塞与外墙'; piston.players = [{ x: 6, y: 4 }];
  piston.cells.push({ x: 7, y: 4, fixed: false, storesHeat: true, temperature: 2, edges: 0x65 });
  piston.pistons = [{ model: 'boundary', baseKey: 32, headKey: -10032, direction: 2, expanded: false, order: 0,
    head: { fixed: false, storesHeat: true, temperature: 2, edges: 0x65 } }];
  const retained = blankLevel('editor-retained'); retained.title = '第4温度重置'; retained.players = [{ x: 2, y: 4 }];
  retained.cells.push({ x: 3, y: 4, fixed: false, storesHeat: true, temperature: 2, edges: 0x55 });
  const transient = structuredClone(laboratory[4]); transient.id = 'editor-transient'; transient.title = '假死与活塞恢复';
  return { version: 1, levels: [glass, piston, retained, transient], currentId: glass.id, scenarios: [
    { name: '透明粘边连接与整体推动', levelId: glass.id, actions: 'R D R U', checks: [
      { step: 1, path: 'cells.32.x', equals: 4 }, { step: 4, path: 'cells.32.y', equals: 3 }, { step: 4, path: 'cells.33.y', equals: 3 }, { step: 4, path: 'accepted', equals: true },
    ] },
    { name: '压缩空活塞不能收纳外墙', levelId: piston.id, actions: 'R', checks: [{ step: 1, path: 'accepted', equals: false }, { step: 1, path: 'cells.32.x', equals: 7 }, { step: 1, path: 'cells.32.container', equals: null }] },
    { name: '第4温度方块保留位移', levelId: retained.id, actions: 'R RESET', checks: [{ step: 2, path: 'cells.32.x', equals: 4 }, { step: 2, path: 'cells.32.temperature', equals: 2 }, { step: 2, path: 'players.0.x', equals: 3 }] },
    { name: '瞬时假死在结算后恢复', levelId: transient.id, actions: 'L', checks: [{ step: 1, path: 'frozen', equals: false }, { step: 1, path: 'players.0.temperature', equals: 0 }] },
  ] };
}
