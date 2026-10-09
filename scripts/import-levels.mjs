import fs from 'node:fs';
import path from 'node:path';
import { decodeMxw } from './mxw.mjs';

const directory = process.argv[2] ?? "C:/Program Files (x86)/Steam/steamapps/common/Maxwell's puzzling demon";
const worldPath = path.join(directory, 'world');
const structure = JSON.parse(fs.readFileSync(path.join(worldPath, 'structure.json'), 'utf8').replace(/^\uFEFF/, ''));
const world = structure.root.normalSublevels[0].normalSublevels.find(n => n.id === '9a498c50');
if (!world) throw new Error('World 1 is absent from structure.json');
const levels = [];
function visit(node, label, category) {
  const level = decodeMxw(fs.readFileSync(path.join(worldPath, node.id + '.mxw')), node.id);
  levels.push({ ...level, label, category, hintId: node.hintSublevels?.[0]?.id });
  node.normalSublevels?.forEach((child, i) => visit(child, label === 'w1' ? `1-${String(i + 1).padStart(2, '0')}` : `${label}-${i + 1}`, 'main'));
  node.extraSublevels?.forEach((child, i) => visit(child, label === 'w1' ? `1-${String.fromCharCode(65 + i)}` : `${label}-${String.fromCharCode(65 + i)}`, 'extra'));
  node.hintSublevels?.forEach((child, i) => visit(child, `${label}?${i ? i + 1 : ''}`, 'hint'));
}
visit(world, 'w1', 'world');
const language = JSON.parse(fs.readFileSync(path.join(directory, 'languages/zh-CN.json'), 'utf8').replace(/^\uFEFF/, ''));
const labels = new Map(levels.map(l => [l.id, l.label]));
for (const level of levels) for (const note of level.notes) {
  const text = note.text.split('/').reduce((value, key) => value?.[key], language.hint);
  if (typeof text !== 'string') throw new Error(`Missing localization: ${note.text}`);
  note.text = text.replace(/\{#([^}]+)\}/g, (_, id) => labels.get(id) ?? id);
}
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/levels.local.json', JSON.stringify({ version: 1, world: world.id, levels, hints: language.hint.w1 }));
console.log(`Imported ${levels.length} scenes: ${levels.filter(l => l.category === 'main').length} main puzzles, ${levels.filter(l => l.category === 'extra').length} extras, ${levels.filter(l => l.category === 'hint').length} hints, and one world map.`);
