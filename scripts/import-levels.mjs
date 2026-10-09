import fs from 'node:fs';
import path from 'node:path';
import { decodeMxw } from './mxw.mjs';
import { nativeLevelNames } from './level-names.mjs';

const directory = process.argv[2] ?? "C:/Program Files (x86)/Steam/steamapps/common/Maxwell's puzzling demon";
const worldPath = path.join(directory, 'world');
const structure = JSON.parse(fs.readFileSync(path.join(worldPath, 'structure.json'), 'utf8').replace(/^\uFEFF/, ''));
const hub = structure.root.normalSublevels[0];
const worldNodes = hub.normalSublevels.filter(n => n.world);
const titles = ['温度的世界', '粘连与透明', '层级与入口', '热与活塞', '多重小妖', '活塞内部', '第4温度', '机关顺序', '层级与重置'];
const descriptions = ['冷与热之间，寻找平衡。', '连接边界，观察透明导体。', '在关卡之间保存与重置状态。', '以热量驱动机关。', '同时行动，各自传导。', '容纳、取出与嵌套。', '保留温度，改变重置。', '稳定性决定伸缩顺序。', '在不同深度恢复物体。'];
const worlds = [
  { id: hub.id, index: 0, title: '大世界', description: '连接各个世界与关卡的外层地图。', supported: true },
  ...worldNodes.map((node, i) => ({ id: node.id, index: i + 1, title: titles[i], description: descriptions[i], supported: true })),
  ...hub.extraSublevels.filter(n => n.world).map((node, i) => ({ id: node.id, index: String.fromCharCode(65 + i), title: `世界 ${String.fromCharCode(65 + i)}`, description: '额外世界与多层关卡。', supported: true })),
];
const worldById = new Map(worlds.map(world => [world.id, world]));
const levels = [];
const names = nativeLevelNames(structure.root);
function visit(node, label, category, worldId, parentId) {
  if (worldById.has(node.id)) {
    const world = worldById.get(node.id); label = `w${world.index}`;
    category = 'world'; worldId = node.id;
  }
  const level = decodeMxw(fs.readFileSync(path.join(worldPath, node.id + '.mxw')), node.id);
  levels.push({ ...level, label, ...names.get(node.id), category, worldId, parentId, hintId: node.hintSublevels?.[0]?.id });
  const prefix = category === 'world' ? String(worldById.get(worldId).index) : label;
  node.normalSublevels?.forEach((child, i) => visit(child, `${prefix}-${String(i + 1).padStart(2, '0')}`, category === 'hint' ? 'hint' : 'main', worldId, node.id));
  node.extraSublevels?.forEach((child, i) => visit(child, `${prefix}-${String.fromCharCode(65 + i)}`, category === 'hint' ? 'hint' : 'extra', worldId, node.id));
  node.metaSublevels?.forEach((child, i) => visit(child, `${prefix}-${String.fromCharCode(0x3b1 + i)}`, category === 'hint' ? 'hint' : 'extra', worldId, node.id));
  node.hintSublevels?.forEach((child, i) => visit(child, `${label}?${i ? i + 1 : ''}`, 'hint', worldId, node.id));
}
visit(structure.root, '起点', 'world', hub.id);
levels.find(level => level.id === structure.root.id).title = '入口大厅';
const language = JSON.parse(fs.readFileSync(path.join(directory, 'languages/zh-CN.json'), 'utf8').replace(/^\uFEFF/, ''));
const labels = new Map(levels.map(l => [l.id, l.displayName]));
for (const level of levels) for (const note of level.notes) {
  const localized = note.text.split('/').reduce((value, key) => value?.[key], language.hint);
  const text = typeof localized === 'object' ? localized?.on : localized;
  if (typeof text !== 'string') throw new Error(`Missing localization: ${note.text}`);
  note.text = text.replace(/\{#([^}]+)\}/g, (_, id) => labels.get(id) ?? id);
}
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/levels.local.json', JSON.stringify({ version: 2, world: worldNodes[0].id, hub: hub.id, root: structure.root.id, worlds, levels, hints: language.hint }));
console.log(`Imported ${levels.length} scenes from ${worlds.filter(w => w.supported).length} worlds: ${levels.filter(l => l.category === 'main').length} main puzzles, ${levels.filter(l => l.category === 'extra').length} extras, and ${levels.filter(l => l.category === 'hint').length} hints.`);
