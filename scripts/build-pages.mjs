import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import { publicDataset, publicSolutions } from './public-content.mjs';

const catalogue = publicDataset(JSON.parse(fs.readFileSync('public/levels.local.json', 'utf8')));
const directory = path.resolve('output/public-content');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'levels.local.json'), JSON.stringify(catalogue));
fs.writeFileSync(path.join(directory, 'solutions.json'), JSON.stringify(publicSolutions(JSON.parse(fs.readFileSync('src/solutions.json', 'utf8')), catalogue)));
await build({
  base: '/mpd-3d/', publicDir: false,
  plugins: [{ name: 'public-level-catalogue', generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'levels.local.json', source: JSON.stringify(catalogue) });
  } }],
  resolve: { alias: [{ find: './solutions.json', replacement: path.join(directory, 'solutions.json') }] },
  build: { outDir: 'output/pages-dist', emptyOutDir: true },
});
console.log(`Public catalogue: ${catalogue.levels.length} scenes; worlds 1–2 and an independent entrance.`);
