import fs from 'node:fs';
import path from 'node:path';
import { decodeMxw } from './mxw.mjs';

const directory = process.argv[2] ?? "C:/Program Files (x86)/Steam/steamapps/common/Maxwell's puzzling demon";
const worldPath = path.join(directory, 'world');
const structure = JSON.parse(fs.readFileSync(path.join(worldPath, 'structure.json'), 'utf8').replace(/^\uFEFF/, ''));
const worldNodes = structure.root.normalSublevels[0].normalSublevels.filter(n => n.world);
const titles = ['温度的世界', '粘连与透明', '层级与入口', '热与活塞', '多重小妖', '活塞内部', '第4温度', '机关顺序', '层级与重置'];
const descriptions = ['冷与热之间，寻找平衡。', '连接边界，观察透明导体。', '在关卡之间保存与重置状态。', '以热量驱动机关。', '同时行动，各自传导。', '容纳、取出与嵌套。', '保留温度，改变重置。', '稳定性决定伸缩顺序。', '在不同深度恢复物体。'];
const worlds = worldNodes.map((node, i) => ({ id: node.id, index: i + 1, title: titles[i], description: descriptions[i], supported: true }));
const levels = [];
const subscript = number => String(number).replace(/\d/g, digit => '₀₁₂₃₄₅₆₇₈₉'[Number(digit)]);
function visit(node, label, category, worldId, parentId, displayName = label, localName = displayName) {
  const level = decodeMxw(fs.readFileSync(path.join(worldPath, node.id + '.mxw')), node.id);
  levels.push({ ...level, label, displayName, localName, category, worldId, parentId, hintId: node.hintSublevels?.[0]?.id });
  const prefix = category === 'world' ? String(worlds.find(w => w.id === worldId).index) : label;
  const fullName = local => category === 'world' ? `${prefix}-${local}` : `${displayName}:${local}`;
  node.normalSublevels?.forEach((child, i) => visit(child, `${prefix}-${String(i + 1).padStart(2, '0')}`, category === 'hint' ? 'hint' : 'main', worldId, node.id, fullName(String(i + 1)), String(i + 1)));
  node.extraSublevels?.forEach((child, i) => { const local = String.fromCharCode(65 + i); visit(child, `${prefix}-${local}`, category === 'hint' ? 'hint' : 'extra', worldId, node.id, fullName(local), local); });
  node.hintSublevels?.forEach((child, i) => { const local = `?${i ? subscript(i) : ''}`; visit(child, `${label}?${i ? i + 1 : ''}`, 'hint', worldId, node.id, fullName(local), local); });
}
worldNodes.forEach((world, i) => { if (worlds[i].supported) visit(world, `w${i + 1}`, 'world', world.id); });
const language = JSON.parse(fs.readFileSync(path.join(directory, 'languages/zh-CN.json'), 'utf8').replace(/^\uFEFF/, ''));
const labels = new Map(levels.map(l => [l.id, l.displayName]));
for (const level of levels) for (const note of level.notes) {
  const text = note.text.split('/').reduce((value, key) => value?.[key], language.hint);
  if (typeof text !== 'string') throw new Error(`Missing localization: ${note.text}`);
  note.text = text.replace(/\{#([^}]+)\}/g, (_, id) => labels.get(id) ?? id);
}
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/levels.local.json', JSON.stringify({ version: 2, world: worlds[0].id, worlds, levels, hints: language.hint }));
console.log(`Imported ${levels.length} scenes from ${worlds.filter(w => w.supported).length} worlds: ${levels.filter(l => l.category === 'main').length} main puzzles, ${levels.filter(l => l.category === 'extra').length} extras, and ${levels.filter(l => l.category === 'hint').length} hints.`);
