import fs from 'node:fs';
import path from 'node:path';
import { importLevelDataset } from './level-dataset.mjs';

const directory = process.argv[2] ?? "C:/Program Files (x86)/Steam/steamapps/common/Maxwell's puzzling demon";
const data = await importLevelDataset(async (name, optional) => {
  const file = path.join(directory, name);
  if (optional && !fs.existsSync(file)) return undefined;
  return fs.readFileSync(file);
});
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/levels.local.json', JSON.stringify(data));
console.log(`Imported ${data.levels.length} scenes from ${data.worlds.length} worlds.`);
