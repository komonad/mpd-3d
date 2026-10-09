import './style.css';
import { GameScene } from './scene';
import { laboratory } from './laboratory';
import { availablePortals, bodies, cloneState, directions, initialState, move } from './engine';
import type { Dataset, Direction, Level, State, Temperature } from './types';

const icons: Record<string, string> = {
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>', chevron: '<path d="m9 5 7 7-7 7"/>',
  undo: '<path d="m9 5-5 5 5 5M4 10h9a6 6 0 0 1 0 12"/>', redo: '<path d="m15 5 5 5-5 5M20 10h-9a6 6 0 0 0 0 12"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/>', camera: '<path d="M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 16v.5"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>', check: '<path d="m5 12 4 4L19 6"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>',
  sound: '<path d="m11 5-6 4H2v6h3l6 4zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 5-6 4H2v6h3l6 4zM16 9l5 6M21 9l-5 6"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  left: '<path d="m14 6-6 6 6 6"/>', right: '<path d="m10 6 6 6-6 6"/>', up: '<path d="m6 14 6-6 6 6"/>', down: '<path d="m6 10 6 6 6-6"/>',
  enter: '<path d="M20 4v8H4m6-6-6 6 6 6"/>', pin: '<path d="m8 3 8 0-2 6 4 4H6l4-4zM12 13v8"/>'
};
const icon = (name: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? ''}</svg>`;
const names = ['初次推动', '冷热相遇', '保持冷静', '热量的流向', '平衡的分量', '传导之间', '连成一体', '冷静的路线', '隔热边界', '另一面', '向内探索', '局部隔热', '热量的路径', '边缘的温度', '巧妙排列', '静止的力量', '固定与自由', '有限与无限', '温度守恒', '最后的平衡'];
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const app = $('#app');

app.innerHTML = `
  <header class="app-header">
    <button class="icon-button mobile-menu" id="menu-button" aria-label="显示关卡列表">${icon('menu')}</button>
    <a class="brand" href="#" aria-label="Maxwell 3D 首页"><span class="brand-mark"><i></i><b>••</b></span><span>MAXWELL’S<small>PUZZLING DEMON</small></span><em>3D</em></a>
    <div class="header-center"><span class="status-dot"></span> A STUDY IN TEMPERATURE <span class="header-line"></span> 温度的世界</div>
    <div class="header-actions"><button class="icon-button" id="sound-button" aria-label="关闭音效" title="音效">${icon('sound')}</button><button class="icon-button" id="help-button" aria-label="玩法说明" title="玩法说明">${icon('help')}</button><button class="icon-button" id="settings-button" aria-label="画面设置" title="画面设置">${icon('settings')}</button></div>
  </header>
  <main class="workspace">
    <aside class="sidebar" aria-label="关卡选择">
      <div class="chapter-eyebrow">THE FIRST WORLD <span>01 / 10</span></div>
      <h1>温度的世界<span>冷与热之间，寻找平衡。</span></h1>
      <button class="world-button" id="world-button"><span>${icon('map')}探索世界地图</span>${icon('arrow')}</button>
      <div class="progress-label"><span>探索进度</span><b id="progress-number">0 / 27</b></div><div class="progress-track"><i id="progress-fill"></i></div>
      <div class="level-tabs" role="tablist" aria-label="关卡分类"><button id="main-tab" role="tab" aria-selected="true">主线 <small>20</small></button><button id="extra-tab" role="tab" aria-selected="false">额外 <small>7</small></button><button id="lab-tab" role="tab" aria-selected="false">实验室 <small>6</small></button></div>
      <div id="level-list" class="level-list" role="tabpanel"></div>
      <div class="sidebar-bottom"><span class="save-dot"></span><span id="save-status">进度自动保存在本机</span><span class="small-star">✦</span></div>
    </aside>
    <section class="play-area" aria-label="游戏区域">
      <div class="stage-heading"><div><div class="breadcrumbs"><button id="breadcrumb-world">世界 01</button><span>/</span><span id="breadcrumb-level">关卡 01</span></div><h2 id="level-title">初次推动</h2><p id="level-description">将方块推到发光的终点。</p></div><div class="level-badge" id="level-badge">1—01</div></div>
      <div class="stage-stats"><div><span>MOVES</span><b id="move-count">000</b><small>步数</small></div><div><span>PUSHES</span><b id="push-count">000</b><small>推动</small></div></div>
      <div class="demon-status" id="demon-status" role="status"><i></i><span>小妖 · 常温</span></div>
      <div id="scene-host" class="scene-host"></div>
      <div class="scene-tag"><span class="status-dot"></span> ORTHOGRAPHIC VIEW <span id="tilt-label">32°</span></div>
      <div class="legend"><span><i class="legend-neutral"></i>常温</span><span><i class="legend-hot"></i>高温</span><span><i class="legend-cold"></i>低温</span><span><i class="legend-glass"></i>透明</span><span><i class="legend-sticky"></i>粘边</span><span class="legend-goal">◎ 终点</span></div>
      <div id="hover-info" class="hover-info" hidden></div>
      <div class="context-action" id="context-action" hidden><button id="enter-button">${icon('enter')}进入 <span id="portal-label"></span><kbd>E</kbd></button></div>
      <div class="dpad" aria-label="触屏方向键"><button data-dir="3" aria-label="向上">${icon('up')}</button><button data-dir="0" aria-label="向左">${icon('left')}</button><i>✦</i><button data-dir="2" aria-label="向右">${icon('right')}</button><button data-dir="1" aria-label="向下">${icon('down')}</button></div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
      <div class="state-message" id="state-message" hidden></div>
      <div class="stage-toolbar"><div class="history-controls"><button id="undo-button" title="撤销 Z / U" aria-label="撤销">${icon('undo')}<span>撤销</span><kbd>Z</kbd></button><button id="redo-button" title="重做 Y" aria-label="重做">${icon('redo')}<span>重做</span><kbd>Y</kbd></button><i></i><button id="reset-button" title="重置 R" aria-label="重置关卡">${icon('reset')}<span>重置</span><kbd>R</kbd></button></div><button id="camera-button" class="camera-button" title="重置镜头">${icon('camera')}<span>重置镜头</span></button></div>
      <footer class="play-footer"><span class="keyboard-guide"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> / <b>W A S D</b> 移动</span><span class="camera-guide">右键旋转 · Shift 平移 · 滚轮缩放</span><button id="hint-button">提示 ${icon('arrow')}</button></footer>
    </section>
  </main>
  <dialog id="help-dialog"><div class="dialog-heading"><span class="eyebrow">HOW TO PLAY</span><button class="icon-button" data-close aria-label="关闭">${icon('close')}</button></div><h2>每一次推动，<br>都会改变温度。</h2><p class="dialog-intro">把储存热量的方块推到终点，并让小妖保持常温或低温。</p><div class="rule-row"><span class="rule-icon">↑</span><div><h3>热量会传递</h3><p>相邻且没有隔热边的方块交换热量。高温数量更多，整组变热；低温更多，整组变冷；数量相等，变为常温。</p></div></div><div class="rule-row"><span class="rule-icon demon-icon">••</span><div><h3>小妖也是导体</h3><p>小妖能连接两边的方块，但自身不储存热量。高温时进入假死姿态；一轮活塞结算结束后仍高温，才会停止移动。按 Z 可撤销整轮。</p></div></div><div class="rule-row"><span class="rule-icon">═</span><div><h3>观察每一条边</h3><p>米白色侧面隔热，绿色胶质侧面会粘住方块；金属钉表示固定。连接块没有内部缝隙，作为一个刚体移动。</p></div></div><div class="dialog-keyboard"><span><kbd>E</kbd>进入关卡</span><span><kbd>Q</kbd>返回世界</span><span><kbd>H</kbd>提示关卡</span></div><p class="scope-note">当前可玩范围：第一世界，20 个主线关卡、7 个额外关卡及提示场景。世界地图中的入口会在对应关卡完成后改变状态。实验室包含 6 个材质与机制场景。</p><button class="primary-button" data-close>开始探索 ${icon('right')}</button></dialog>
  <dialog id="settings-dialog"><div class="dialog-heading"><span class="eyebrow">MAKE IT YOURS</span><button class="icon-button" data-close aria-label="关闭">${icon('close')}</button></div><h2>光与视角</h2><p class="dialog-intro">找到看得清，也看得舒服的角度。</p><label class="setting-row" for="tilt-input"><span><b>镜头倾斜</b><small>从正俯视方向向下倾斜</small></span><output id="tilt-output">32°</output></label><input id="tilt-input" type="range" min="0" max="50" value="32" step="1"/><label class="setting-row" for="light-input"><span><b>曝光</b><small>材质与灯光的明亮程度</small></span><output id="light-output">1.05</output></label><input id="light-input" type="range" min="0.65" max="1.65" value="1.05" step="0.01"/><label class="setting-row toggle-row"><span><b>精细光影</b><small>高分辨率抗锯齿与环境遮蔽</small></span><input type="checkbox" id="quality-input" checked/></label><label class="setting-row toggle-row"><span><b>辅助网格</b><small>清晰显示格子边界</small></span><input type="checkbox" id="grid-input"/></label><button class="primary-button" id="settings-reset">恢复默认画面 ${icon('reset')}</button><p class="scope-note">Three.js · PBR 材质 · 正交镜头<br>关卡由本机游戏安装目录导入。</p></dialog>
  <dialog id="hint-dialog"><div class="dialog-heading"><span class="eyebrow">A LITTLE GUIDANCE</span><button class="icon-button" data-close aria-label="关闭">${icon('close')}</button></div><h2>慢一点，看清热量。</h2><p class="dialog-intro" id="hint-text"></p><div class="hint-art"><span class="hint-cube hot">↑</span><span>＋</span><span class="hint-cube cold">↓</span><span>→</span><span class="hint-cube neutral">·</span></div><p>在提示关卡中实验，按 Q 返回。提示场景的完成状态不计入探索进度。</p><button class="primary-button" id="start-hint-button">进入原版提示关卡 ${icon('right')}</button></dialog>
`;

interface Frame { levelId: string; parent: State; portalKey?: number; direction?: Direction; hint: boolean }
interface Snapshot { state: State; solved: string[]; stack: Frame[] }
interface Preferences { tilt: number; light: number; quality: boolean; grid: boolean; sound: boolean }
const storageKey = 'maxwell3d-save-v1';
const preferencesKey = 'maxwell3d-preferences-v1';
let data: Dataset, level: Level, state: State, scene: GameScene;
let solved = new Set<string>(), stack: Frame[] = [], undoHistory: Snapshot[] = [], redoHistory: Snapshot[] = [];
let category: 'main' | 'extra' | 'lab' = 'main';
let preferences: Preferences = { tilt: 32, light: 1.05, quality: true, grid: false, sound: true };
let levelsById: Map<string, Level>, labels: Map<string, string>;
let toastTimer: ReturnType<typeof setTimeout>, audio: AudioContext | undefined;
let inputTime = 0;
let resolving = false, playback = 0;

function levelName(l: Level): string {
  if (l.title) return l.title;
  if (l.category === 'world') return '温度的世界';
  if (l.category === 'extra') return ['热量的回路', '边界实验', '长廊之外', '封闭的平衡', '冷暖之间', '外界的温度', '分离与连接'][parseInt(l.label.slice(-1), 36) - 10] ?? '额外实验';
  if (l.category === 'hint') return '提示实验';
  return names[Number(l.label.split('-')[1]) - 1] ?? '温度实验';
}
function snapshot(): Snapshot { return { state: cloneState(state), solved: [...solved], stack: structuredClone(stack) }; }
function remember(): void { undoHistory.push(snapshot()); if (undoHistory.length > 512) undoHistory.shift(); redoHistory = []; }
function notify(message: string): void { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible'); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2600); }
function playTone(kind: 'move' | 'push' | 'solve' | 'undo'): void {
  if (!preferences.sound) return;
  try {
    audio ??= new AudioContext(); void audio.resume();
    const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.connect(gain); gain.connect(audio.destination);
    const time = audio.currentTime; oscillator.type = kind === 'solve' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(kind === 'push' ? 150 : kind === 'solve' ? 480 : kind === 'undo' ? 230 : 340, time);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'solve' ? 720 : 100, time + 0.12);
    gain.gain.setValueAtTime(0.0001, time); gain.gain.exponentialRampToValueAtTime(0.025, time + 0.007); gain.gain.exponentialRampToValueAtTime(0.0001, time + (kind === 'solve' ? 0.4 : 0.12));
    oscillator.start(time); oscillator.stop(time + 0.45);
  } catch { /* Audio support is optional for movement. */ }
}
function save(): void {
  try { localStorage.setItem(storageKey, JSON.stringify(snapshot())); $('#save-status').textContent = '进度自动保存在本机'; }
  catch { $('#save-status').textContent = '当前浏览器无法保存进度'; }
}
function renderLevels(): void {
  const list = data.levels.filter(l => l.category === category);
  $('#level-list').innerHTML = list.map(l => {
    const done = solved.has(l.id), selected = l.id === level.id;
    const number = l.label.split('-')[1]; const hot = l.cells.some(c => c.temperature === 1), cold = l.cells.some(c => c.temperature === -1);
    return `<button class="level-item ${selected ? 'selected' : ''} ${done ? 'completed' : ''}" data-level="${l.id}" aria-current="${selected ? 'true' : 'false'}"><span class="level-number">${done ? icon('check') : number}</span><span class="level-text"><b>${levelName(l)}</b><small>${l.label} ${done ? '· 已完成' : '· ' + l.width + ' × ' + l.height}</small></span><span class="level-thermals">${hot ? '<i class="hot"></i>' : ''}${cold ? '<i class="cold"></i>' : ''}</span>${selected ? icon('chevron') : ''}</button>`;
  }).join('');
  $('#main-tab').setAttribute('aria-selected', String(category === 'main')); $('#extra-tab').setAttribute('aria-selected', String(category === 'extra'));
  $('#lab-tab').setAttribute('aria-selected', String(category === 'lab'));
  const count = data.levels.filter(l => (l.category === 'main' || l.category === 'extra') && solved.has(l.id)).length;
  $('#progress-number').textContent = `${count} / 27`; $('#progress-fill').style.width = `${count / 27 * 100}%`;
  $('#world-button').classList.toggle('active', level.category === 'world');
}
function renderHud(): void {
  $('#move-count').textContent = String(state.moves).padStart(3, '0'); $('#push-count').textContent = String(state.pushes).padStart(3, '0');
  $('#level-title').textContent = levelName(level); $('#level-badge').textContent = level.label.replace('-', '—');
  $('#breadcrumb-level').textContent = level.category === 'world' ? '世界地图' : level.category === 'hint' ? `${level.label} 提示` : level.category === 'lab' ? '机制实验室' : `关卡 ${level.label.split('-')[1]}`;
  $('#level-description').textContent = level.description ?? (level.category === 'world' ? '靠近入口按 E 进入；完成的关卡入口可以推动。' : level.category === 'hint' ? '在这里自由实验。按 Q 返回关卡。' : '将方块推到发光的终点，保持小妖冷静。');
  $('#undo-button').toggleAttribute('disabled', !undoHistory.length); $('#redo-button').toggleAttribute('disabled', !redoHistory.length);
  const portals = availablePortals(state).sort((a, b) => (labels.get(a.portal!.target) ?? '').localeCompare(labels.get(b.portal!.target) ?? '', undefined, { numeric: true }));
  $('#context-action').hidden = !portals.length || state.frozen || state.solved;
  $('#portal-label').textContent = portals.length ? labels.get(portals[0].portal!.target) ?? '未知关卡' : '';
  const message = $('#state-message'); message.hidden = resolving || (!state.solved && !state.frozen && state.phase !== 'cycling');
  message.className = 'state-message ' + (state.solved ? 'success' : 'frozen');
  if (state.solved) message.innerHTML = `<span class="message-symbol">${icon('check')}</span><small>EQUILIBRIUM REACHED</small><h3>找到平衡。</h3><p>${state.moves} 步 · ${state.pushes} 次推动</p><div>${stack.length ? '<button id="finish-return" class="primary-button">返回 ' + (stack.at(-1)?.hint ? '关卡' : '世界地图') + icon('right') + '</button>' : '<button id="next-level" class="primary-button">下一关' + icon('right') + '</button><button id="finish-map" class="secondary-button">世界地图</button>'}</div>`;
  else if (state.phase === 'cycling') message.innerHTML = `<h3>循环结算中</h3><p>活塞进入循环，按 Z 撤销或 R 重置。</p><button id="frozen-undo" class="primary-button">撤销一步 <kbd>Z</kbd></button>`;
  else if (state.frozen) message.innerHTML = `<h3>小妖处于假死状态</h3><p>高温使小妖暂时无法移动。</p><button id="frozen-undo" class="primary-button">撤销一步 <kbd>Z</kbd></button>`;
}
function display(snap = false, activity: 'idle' | 'walking' | 'pushing' = 'idle'): void { scene.update(state, snap, activity); scene.setGrid(preferences.grid); renderHud(); renderLevels(); save(); }
function cancelPlayback(): void { playback++; resolving = false; }
function load(id: string, outside: Temperature = 0, existing?: State): void {
  const found = levelsById.get(id); if (!found) { notify('这个入口通向当前版本范围之外的场景。'); return; }
  cancelPlayback(); level = found; state = existing ? cloneState(existing) : initialState(level, solved, outside);
  if (level.category === 'extra') category = 'extra'; else if (level.category === 'main') category = 'main'; else if (level.category === 'lab') category = 'lab';
  scene.load(level, state, labels); display(true); $('#hover-info').hidden = true;
  document.body.classList.remove('sidebar-open');
}
function selectLevel(id: string): void { remember(); stack = []; load(id); }
async function step(direction: Direction): Promise<void> {
  if (resolving || performance.now() - inputTime < 95) return; inputTime = performance.now();
  const next = move(level, state, direction); if (!next) return;
  remember(); const pushing = next.pushes > state.pushes; state = next;
  if (state.solved && level.category !== 'hint' && level.category !== 'lab') solved.add(level.id);
  playTone(state.solved ? 'solve' : pushing ? 'push' : 'move');
  if (next.pistons?.length && next.turnFrames && next.turnFrames.length > 2) {
    resolving = true; const token = ++playback; renderHud(); renderLevels(); save();
    const frames = next.turnFrames.slice(0, 16);
    for (const frame of frames) {
      if (token !== playback) return;
      scene.update({ ...next, ...frame, phase: 'ready', solved: false }, false, 'resolving');
      await new Promise(resolve => setTimeout(resolve, frame.phase === 'heat' ? 380 : 200));
    }
    if (token !== playback) return; resolving = false;
  }
  display(false, pushing ? 'pushing' : 'walking');
}
function restore(s: Snapshot): void { solved = new Set(s.solved); stack = structuredClone(s.stack); load(s.state.levelId, s.state.outside, s.state); }
function undo(): void { const previous = undoHistory.pop(); if (!previous) return; redoHistory.push(snapshot()); restore(previous); playTone('undo'); }
function redo(): void { const next = redoHistory.pop(); if (!next) return; undoHistory.push(snapshot()); restore(next); playTone('move'); }
function reset(): void { remember(); cancelPlayback(); state = initialState(level, solved, state.outside); scene.load(level, state, labels); display(true); notify('关卡已重置，按 Z 可以撤销。'); }
function enter(targetId?: string): void {
  if (resolving) return;
  const candidates = availablePortals(state).filter(c => levelsById.has(c.portal!.target)).sort((a, b) => (labels.get(a.portal!.target) ?? '').localeCompare(labels.get(b.portal!.target) ?? '', undefined, { numeric: true }));
  const portal = targetId ? candidates.find(c => c.portal!.target === targetId) : candidates[0];
  if (!portal || state.frozen || state.solved) { if (targetId) notify('先走到关卡入口旁边，再按 E 进入。'); return; }
  const player = state.players.find(p => Math.abs(p.x - portal.x) + Math.abs(p.y - portal.y) === 1)!;
  const dir = directions.findIndex(d => d.x === portal.x - player.x && d.y === portal.y - player.y) as Direction;
  remember(); stack.push({ levelId: level.id, parent: cloneState(state), portalKey: portal.key, direction: dir, hint: false }); load(portal.portal!.target, portal.temperature);
}
function exit(): void {
  if (!stack.length) { if (level.category !== 'world') selectLevel(data.world); return; }
  remember(); const frame = stack.pop()!;
  const parentLevel = levelsById.get(frame.levelId)!;
  if (frame.hint) { load(frame.levelId, frame.parent.outside, frame.parent); return; }
  const parent = initialState(parentLevel, solved, 0), portal = parent.cells.find(c => c.key === frame.portalKey)!;
  const d = directions[frame.direction!]; const x = portal.x + d.x, y = portal.y + d.y;
  parent.players = [{ x, y, temperature: 0 }]; parent.cells = parent.cells.filter(c => c.x !== x || c.y !== y);
  load(frame.levelId, 0, parent);
}
function nextLevel(): void {
  const main = data.levels.filter(l => l.category === category), index = main.findIndex(l => l.id === level.id);
  selectLevel(main[index + 1]?.id ?? data.world);
}
function openHint(): void {
  const descriptions = level.description ?? (level.notes?.length ? level.notes.map(n => n.text).join('\n\n') : level.category === 'world' ? '世界本身也是一道谜题。尝试完成附近的关卡，再利用入口变成的可移动方块继续探索。' : Number(level.label.split('-')[1]) <= 3 ? '先规划方块到达终点的路线，再寻找你能站立的位置。热与冷接触时会重新结算温度。' : '观察方块的数量、相邻关系和米白色隔热侧面。小妖也可以成为两块之间的导热桥梁。');
  $('#hint-text').textContent = descriptions; $('#start-hint-button').toggleAttribute('disabled', !level.hintId); $<HTMLDialogElement>('#hint-dialog').showModal();
}
function startHint(): void {
  if (!level.hintId) return; $<HTMLDialogElement>('#hint-dialog').close(); remember(); stack.push({ levelId: level.id, parent: cloneState(state), hint: true }); load(level.hintId, state.outside);
}
function applyPreferences(): void {
  scene.setTilt(preferences.tilt); scene.setExposure(preferences.light); scene.setQuality(preferences.quality); scene.setGrid(preferences.grid);
  $('#tilt-label').textContent = `${preferences.tilt}°`; $('#tilt-output').textContent = `${preferences.tilt}°`; $('#light-output').textContent = preferences.light.toFixed(2);
  $<HTMLInputElement>('#tilt-input').value = String(preferences.tilt); $<HTMLInputElement>('#light-input').value = String(preferences.light);
  $<HTMLInputElement>('#quality-input').checked = preferences.quality; $<HTMLInputElement>('#grid-input').checked = preferences.grid;
  $('#sound-button').innerHTML = icon(preferences.sound ? 'sound' : 'mute'); $('#sound-button').setAttribute('aria-label', preferences.sound ? '关闭音效' : '开启音效');
  try { localStorage.setItem(preferencesKey, JSON.stringify(preferences)); } catch { /* Preferences can remain in memory. */ }
}
function bind(): void {
  $('#level-list').addEventListener('click', e => { const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-level]'); if (button) selectLevel(button.dataset.level!); });
  $('#main-tab').onclick = () => { category = 'main'; renderLevels(); }; $('#extra-tab').onclick = () => { category = 'extra'; renderLevels(); };
  $('#lab-tab').onclick = () => { category = 'lab'; renderLevels(); };
  $('#world-button').onclick = $('#breadcrumb-world').onclick = () => selectLevel(data.world);
  $('.brand').onclick = e => { e.preventDefault(); selectLevel(data.levels.find(l => l.category === 'main')!.id); };
  $('#undo-button').onclick = undo; $('#redo-button').onclick = redo; $('#reset-button').onclick = reset;
  $('#camera-button').onclick = () => { scene.resetCamera(); notify('镜头已回到默认位置。'); };
  $('#help-button').onclick = () => $<HTMLDialogElement>('#help-dialog').showModal(); $('#settings-button').onclick = () => $<HTMLDialogElement>('#settings-dialog').showModal();
  $('#sound-button').onclick = () => { preferences.sound = !preferences.sound; applyPreferences(); };
  $('#hint-button').onclick = openHint; $('#start-hint-button').onclick = startHint; $('#enter-button').onclick = () => enter();
  $('#menu-button').onclick = () => document.body.classList.toggle('sidebar-open');
  $('#state-message').addEventListener('click', e => {
    const id = (e.target as HTMLElement).closest('button')?.id;
    if (id === 'finish-return') exit(); if (id === 'next-level') nextLevel(); if (id === 'finish-map') selectLevel(data.world); if (id === 'frozen-undo') undo();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-dir]').forEach(b => { b.onclick = () => step(Number(b.dataset.dir) as Direction); });
  document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(b => { b.onclick = () => b.closest('dialog')!.close(); });
  document.querySelectorAll<HTMLDialogElement>('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) { const rect = d.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) d.close(); } }));
  $('#tilt-input').oninput = () => { preferences.tilt = Number($<HTMLInputElement>('#tilt-input').value); applyPreferences(); };
  $('#light-input').oninput = () => { preferences.light = Number($<HTMLInputElement>('#light-input').value); applyPreferences(); };
  $('#quality-input').onchange = () => { preferences.quality = $<HTMLInputElement>('#quality-input').checked; applyPreferences(); };
  $('#grid-input').onchange = () => { preferences.grid = $<HTMLInputElement>('#grid-input').checked; applyPreferences(); };
  $('#settings-reset').onclick = () => { preferences = { ...preferences, tilt: 32, light: 1.05, quality: true, grid: false }; applyPreferences(); };
  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]') || e.ctrlKey || e.altKey || e.metaKey || (e.target as HTMLElement).matches('input')) return;
    const key = e.key.toLowerCase(); const keys: Record<string, Direction> = { arrowleft: 0, a: 0, arrowdown: 1, s: 1, arrowright: 2, d: 2, arrowup: 3, w: 3 };
    if (key in keys) { e.preventDefault(); step(keys[key]); }
    else if (key === 'z' || key === 'u') { e.preventDefault(); undo(); }
    else if (key === 'y') redo(); else if (key === 'r') reset(); else if (key === 'e' || key === 'enter' || key === ' ') { e.preventDefault(); if (state.solved) stack.length ? exit() : nextLevel(); else enter(); }
    else if (key === 'q' || key === 'backspace') { e.preventDefault(); exit(); } else if (key === 'h') openHint();
  });
  scene.onPortalClick = target => enter(target);
  scene.onStatus = (temperature, status) => {
    const element = $('#demon-status'); element.dataset.temperature = String(temperature);
    $('#demon-status span').textContent = `小妖 · ${temperature === 1 ? '高温' : temperature === -1 ? '低温' : '常温'} · ${status}`;
  };
  scene.onNoteClick = text => { $('#hint-text').textContent = text; $('#start-hint-button').toggleAttribute('disabled', !level.hintId); $<HTMLDialogElement>('#hint-dialog').showModal(); };
  scene.onHover = key => {
    const info = $('#hover-info'), cell = state.cells.find(c => c.key === key); if (!cell) { info.hidden = true; return; }
    info.hidden = false;
    const fixed = bodies(state.cells).some(b => b.some(c => c.fixed) && b.some(c => c.key === cell.key));
    const piston = state.pistons?.find(p => p.baseKey === cell.key || p.headKey === cell.key);
    info.textContent = `${cell.portal ? '关卡 ' + (labels.get(cell.portal.target) ?? '入口') + ' · ' : ''}${piston ? '活塞 · ' : ''}${cell.temperature === 1 ? '高温' : cell.temperature === -1 ? '低温' : '常温'} · ${fixed ? '固定' : '可推动'}${cell.storesHeat ? '' : ' · 透明导体 · 不储热'}${[0, 1, 2, 3].some(d => ((cell.edges >> (d * 2)) & 3) === 3) ? ' · 粘边' : ''}`;
  };
}

async function start(): Promise<void> {
  try {
    const response = await fetch('/levels.local.json'); if (!response.ok) throw new Error('关卡数据尚未导入。请在项目目录运行 npm run import:levels。');
    data = await response.json(); data.levels.push(...laboratory); levelsById = new Map(data.levels.map(l => [l.id, l])); labels = new Map(data.levels.map(l => [l.id, l.label]));
    scene = new GameScene($('#scene-host'));
    try { const saved = JSON.parse(localStorage.getItem(preferencesKey) ?? 'null'); if (saved) preferences = { ...preferences, ...saved }; } catch { /* Defaults remain valid when a browser save is unreadable. */ }
    applyPreferences();
    let saved: Snapshot | undefined;
    try { const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null'); if (value && levelsById.has(value.state?.levelId) && Array.isArray(value.solved) && Array.isArray(value.stack) && Array.isArray(value.state?.cells)) saved = value; } catch { /* A new session starts when an older save cannot be read. */ }
    if (saved) { solved = new Set(saved.solved); stack = saved.stack; load(saved.state.levelId, saved.state.outside, saved.state); }
    else load(data.levels.find(l => l.category === 'main')!.id);
    bind();
  } catch (error) {
    $('#state-message').hidden = false; $('#state-message').innerHTML = '<h3>暂时无法启动</h3><p></p>';
    $('#state-message p').textContent = error instanceof Error ? error.message : String(error); console.error(error);
  }
}
void start();
