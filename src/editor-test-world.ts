import { blankLevel } from './editor-model';
import { editorPresets } from './editor-presets';
import type { Dataset, Level } from './types';

export const editorTestWorldId = 'editor-test-world';
export const isEditorTestLevel = (level: Level): boolean => level.worldId === editorTestWorldId;

export function withEditorTestWorld(source: Dataset): Dataset {
  const rooms = editorPresets().levels.map((level, index) => ({ ...level, worldId: editorTestWorldId, order: index + 1, displayName: `T-${index + 1}`, localName: String(index + 1), parentId: level.parentId ?? editorTestWorldId }));
  const world = blankLevel(editorTestWorldId, 13, 11);
  world.category = 'world'; world.worldId = world.id; world.label = 'TEST'; world.title = '编辑器测试关卡';
  world.description = '从左侧选择机制场景，或靠近入口按 E 进入。点击「编辑此关卡」修改场景并测试。';
  world.players = [{ x: 6, y: 5 }];
  const before = { fixed: true, storesHeat: true, temperature: 0 as const, edges: 0xaa };
  rooms.forEach((room, index) => world.cells.push({ x: 2 + index % 5 * 2, y: 2 + Math.floor(index / 5) * 2, ...before,
    portal: { target: room.id, shortcut: room.parentId !== world.id, before: { ...before }, after: { ...before } } }));
  const ids = new Set([world.id, ...rooms.map(l => l.id)]);
  const worlds = source.worlds ?? [{ id: source.world, index: 1, title: '温度的世界', description: '冷与热之间，寻找平衡。', supported: true }];
  return { ...source, levels: [...source.levels.filter(l => !ids.has(l.id)), world, ...rooms], worlds: [...worlds.filter(w => w.id !== world.id),
    { id: world.id, index: 'TEST', title: world.title, description: '独立的机制场景，可游玩与编辑。', supported: true }] };
}
