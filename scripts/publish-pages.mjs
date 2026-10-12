import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const git = (args, cwd = process.cwd()) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const build = 'output/pages-dist';
const index = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
if (!index.includes('/mpd-3d/assets/')) throw new Error('Run npm run build:pages before publishing.');
if (!fs.existsSync(path.join(build, 'levels.local.json'))) throw new Error('The deployment requires imported level data.');
const catalogue = JSON.parse(fs.readFileSync(path.join(build, 'levels.local.json'), 'utf8'));
const allowed = new Set(catalogue.worlds?.filter(world => world.index === 1 || world.index === 2).map(world => world.id));
if (catalogue.edition !== 'preview' || allowed.size !== 2 || catalogue.levels.some(level => level.id !== 'preview-hub' && !allowed.has(level.worldId)) || Object.keys(catalogue.hints).length) throw new Error('Publishing requires the restricted public catalogue.');
const source = git(['rev-parse', 'HEAD']);
const remote = git(['remote', 'get-url', 'origin']);
fs.mkdirSync('output', { recursive: true });
const directory = fs.mkdtempSync(path.resolve('output/pages-'));
fs.cpSync(build, directory, { recursive: true });
fs.writeFileSync(path.join(directory, '.nojekyll'), '');
fs.writeFileSync(path.join(directory, 'version.json'), JSON.stringify({ revision: source }));
git(['init', '--initial-branch=gh-pages'], directory);
git(['config', 'user.name', git(['config', 'user.name'])], directory);
git(['config', 'user.email', git(['config', 'user.email'])], directory);
git(['remote', 'add', 'origin', remote], directory);
if (git(['ls-remote', '--heads', 'origin', 'gh-pages'], directory)) {
  git(['fetch', '--depth=1', 'origin', 'gh-pages'], directory);
  git(['reset', '--soft', 'FETCH_HEAD'], directory);
}
git(['add', '--all'], directory);
if (!git(['diff', '--cached', '--name-only'], directory)) {
  console.log('The published build is current.');
} else {
  git(['commit', '-m', `Publish web build ${source.slice(0, 7)}`], directory);
  console.log(git(['push', 'origin', 'HEAD:gh-pages'], directory));
}
console.log(`Source revision: ${source}`);
