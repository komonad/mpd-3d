import { decodeMxw } from './mxw.mjs';
import { nativeLevelNames } from './level-names.mjs';

export async function importLevelDataset(readFile) {
  const readJson = async (name, optional = false) => {
    const bytes = await readFile(name, optional);
    return bytes ? JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/, '')) : undefined;
  };
  const structure = await readJson('world/structure.json');
  const hub = structure.root.normalSublevels[0];
  const worldNodes = (hub.normalSublevels ?? []).filter(n => n.world);
  const titles = ['温度的世界', '粘连与透明', '层级与入口', '热与活塞', '多重小妖', '活塞内部', '第4温度', '机关顺序', '层级与重置'];
  const descriptions = ['冷与热之间，寻找平衡。', '连接边界，观察透明导体。', '在关卡之间保存与重置状态。', '以热量驱动机关。', '同时行动，各自传导。', '容纳、取出与嵌套。', '保留温度，改变重置。', '稳定性决定伸缩顺序。', '在不同深度恢复物体。'];
  const worlds = [
    { id: hub.id, index: 0, title: '大世界', description: '连接各个世界与关卡的外层地图。', supported: true },
    ...worldNodes.map((node, i) => ({ id: node.id, index: i + 1, title: titles[i], description: descriptions[i], supported: true })),
    ...(hub.extraSublevels ?? []).filter(n => n.world).map((node, i) => ({ id: node.id, index: String.fromCharCode(65 + i), title: `世界 ${String.fromCharCode(65 + i)}`, description: '额外世界与多层关卡。', supported: true })),
  ];
  const worldById = new Map(worlds.map(world => [world.id, world]));
  const levels = [];
  const names = nativeLevelNames(structure.root);
  async function visit(node, label, category, worldId, parentId) {
    if (worldById.has(node.id)) {
      const world = worldById.get(node.id); label = `w${world.index}`;
      category = 'world'; worldId = node.id;
    }
    const level = decodeMxw(await readFile('world/' + node.id + '.mxw'), node.id);
    levels.push({ ...level, label, ...names.get(node.id), category, worldId, parentId, hintId: node.hintSublevels?.[0]?.id });
    const prefix = category === 'world' ? String(worldById.get(worldId).index) : label;
    for (const [i, child] of (node.normalSublevels ?? []).entries()) await visit(child, `${prefix}-${String(i + 1).padStart(2, '0')}`, category === 'hint' ? 'hint' : 'main', worldId, node.id);
    for (const [i, child] of (node.extraSublevels ?? []).entries()) await visit(child, `${prefix}-${String.fromCharCode(65 + i)}`, category === 'hint' ? 'hint' : 'extra', worldId, node.id);
    for (const [i, child] of (node.metaSublevels ?? []).entries()) await visit(child, `${prefix}-${String.fromCharCode(0x3b1 + i)}`, category === 'hint' ? 'hint' : 'extra', worldId, node.id);
    for (const [i, child] of (node.hintSublevels ?? []).entries()) await visit(child, `${label}?${i ? i + 1 : ''}`, 'hint', worldId, node.id);
  }
  await visit(structure.root, '起点', 'world', hub.id);
  levels.find(level => level.id === structure.root.id).title = '入口大厅';
  const language = await readJson('languages/zh-CN.json', true) ?? await readJson('languages/en.json', true) ?? { hint: {} };
  const labels = new Map(levels.map(l => [l.id, l.displayName]));
  for (const level of levels) for (const note of level.notes) {
    const localized = note.text.split('/').reduce((value, key) => value?.[key], language.hint);
    const text = typeof localized === 'object' ? localized?.on : localized;
    if (typeof text !== 'string') { note.text = ''; continue; }
    note.text = text.replace(/\{#([^}]+)\}/g, (_, id) => labels.get(id) ?? id);
  }
  return { version: 2, world: worldNodes[0].id, hub: hub.id, root: structure.root.id, worlds, levels, hints: language.hint };

}
