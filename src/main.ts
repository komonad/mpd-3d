import './style.css';
import { GameScene } from './scene';
import { laboratory } from './laboratory';
import { cloneState, initialState, move, syncExteriorTemperature } from './engine';
import { inspectCell } from './inspection';
import { levelLabels } from './level-labels';
import { createSession, enterHint, enterPortal, exitLevel, portalCandidates, recordState, resetSession, selectSession, unlockedWorlds, type Session } from './session';
import type { Dataset, Direction, Level, State, Temperature, World } from './types';

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
    <div class="header-center"><span class="status-dot"></span> A STUDY IN TEMPERATURE <span class="header-line"></span><span id="header-world">温度的世界</span></div>
    <div class="header-actions"><button class="icon-button" id="sound-button" aria-label="关闭音效" title="音效">${icon('sound')}</button><button class="icon-button" id="help-button" aria-label="玩法说明" title="玩法说明">${icon('help')}</button><button class="icon-button" id="settings-button" aria-label="画面设置" title="画面设置">${icon('settings')}</button></div>
  </header>
  <main class="workspace">
    <aside class="sidebar" aria-label="关卡选择">
      <label class="world-picker-label" for="world-picker">选择世界</label><select id="world-picker" aria-label="选择世界"></select>
      <div class="chapter-eyebrow" id="chapter-eyebrow"></div>
      <h1 id="world-title"></h1>
      <button class="world-button" id="world-button"><span>${icon('map')}探索世界地图</span>${icon('arrow')}</button>
      <div class="progress-label"><span>探索进度</span><b id="progress-number">0 / 27</b></div><div class="progress-track"><i id="progress-fill"></i></div>
      <div class="level-tabs" role="tablist" aria-label="关卡分类"><button id="main-tab" role="tab" aria-selected="true">主线 <small>20</small></button><button id="extra-tab" role="tab" aria-selected="false">额外 <small>7</small></button><button id="lab-tab" role="tab" aria-selected="false">实验室 <small>8</small></button></div>
      <div id="level-list" class="level-list" role="tabpanel"></div>
      <div class="sidebar-bottom"><span class="save-dot"></span><span id="save-status">进度自动保存在本机</span><span class="small-star">✦</span></div>
    </aside>
    <section class="play-area" aria-label="游戏区域">
      <div class="stage-header">
      <div class="stage-heading"><div><div class="breadcrumbs"><button id="breadcrumb-world">世界 01</button><span>/</span><span id="breadcrumb-level">关卡 01</span></div><h2 id="level-title">初次推动</h2><p id="level-description">将方块推到蓝色六边形终点。</p></div><div class="level-badge" id="level-badge">1—01</div></div>
      <div class="stage-stats"><div><span>MOVES</span><b id="move-count">000</b><small>步数</small></div><div><span>PUSHES</span><b id="push-count">000</b><small>推动</small></div></div>
      <div class="demon-status" id="demon-status" role="status"><i></i><span>小妖 · 常温</span></div>
      </div>
      <div id="scene-host" class="scene-host"><div id="hover-info" class="hover-info" role="tooltip" hidden></div></div>
      <div class="scene-meta">
      <div class="scene-tag"><span class="status-dot"></span> ORTHOGRAPHIC VIEW <span id="tilt-label">32°</span></div>
      <div class="legend"><span><i class="legend-neutral"></i>常温</span><span><i class="legend-hot"></i>高温</span><span><i class="legend-cold"></i>低温</span><span><i class="legend-glass"></i>透明</span><span><i class="legend-sticky"></i>粘边</span><span class="legend-goal"><svg viewBox="0 0 16 16" aria-hidden="true"><polygon points="14,8 11,13.2 5,13.2 2,8 5,2.8 11,2.8" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>终点</span></div>
      </div>
      <div class="context-action" id="context-action" hidden><button id="enter-button">${icon('enter')}进入 <span id="portal-label"></span><kbd>E</kbd></button></div>
      <div class="dpad" aria-label="触屏方向键"><button data-dir="3" aria-label="向上">${icon('up')}</button><button data-dir="0" aria-label="向左">${icon('left')}</button><i>✦</i><button data-dir="2" aria-label="向右">${icon('right')}</button><button data-dir="1" aria-label="向下">${icon('down')}</button></div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
      <div class="state-message" id="state-message" hidden></div>
      <div class="stage-toolbar"><div class="history-controls"><button id="undo-button" title="撤销 Z / U" aria-label="撤销">${icon('undo')}<span>撤销</span><kbd>Z</kbd></button><button id="redo-button" title="重做 Y" aria-label="重做">${icon('redo')}<span>重做</span><kbd>Y</kbd></button><i></i><button id="reset-button" title="重置 R" aria-label="重置关卡">${icon('reset')}<span>重置</span><kbd>R</kbd></button></div><div class="camera-controls"><button id="free-view-button" class="camera-button" title="切换自由视角 F" aria-label="自由视角" aria-pressed="false">${icon('map')}<span>自由视角</span><kbd>F</kbd></button><button id="camera-button" class="camera-button" title="重置镜头">${icon('camera')}<span>重置镜头</span></button></div></div>
      <footer class="play-footer"><span class="keyboard-guide"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> / <b>W A S D</b> 移动</span><span class="camera-guide" id="camera-guide">角色跟随 · 右键旋转 · 滚轮缩放 · F 自由视角</span><button id="piston-number-button" aria-pressed="false" hidden>编号 <kbd>Tab</kbd></button><button id="hint-button">提示 ${icon('arrow')}</button></footer>
    </section>
  </main>
  <dialog id="help-dialog"><div class="dialog-heading"><span class="eyebrow">HOW TO PLAY</span><button class="icon-button" data-close aria-label="关闭">${icon('close')}</button></div><h2>每一次推动，<br>都会改变温度。</h2><p class="dialog-intro">把储存热量的方块推到终点，并让小妖保持常温或低温。</p><div class="rule-row"><span class="rule-icon">↑</span><div><h3>热量会传递</h3><p>相邻且没有隔热边的方块交换热量。高温数量更多，整组变热；低温更多，整组变冷；数量相等，变为常温。</p></div></div><div class="rule-row"><span class="rule-icon demon-icon">••</span><div><h3>小妖也是导体</h3><p>小妖能连接两边的方块，但自身不储存热量。高温时进入假死姿态；一轮活塞结算结束后仍高温，才会停止移动。按 Z 可撤销整轮。</p></div></div><div class="rule-row"><span class="rule-icon">═</span><div><h3>观察每一条边</h3><p>白色侧面隔热，深浅棋盘格侧面会粘住方块；金属钉表示固定。连接块没有内部缝隙，作为一个刚体移动。</p></div></div><div class="dialog-keyboard"><span><kbd>E</kbd>进入关卡</span><span><kbd>Q</kbd>返回世界</span><span><kbd>H</kbd>提示关卡</span></div><p class="scope-note">可直接选择世界 1–9。入口与出口不立即结算热量，快捷入口在抵达目标关卡后解锁。按 Z 可撤销移动、重置和关卡切换。</p><button class="primary-button" data-close>开始探索 ${icon('right')}</button></dialog>
  <dialog id="settings-dialog"><div class="dialog-heading"><span class="eyebrow">MAKE IT YOURS</span><button class="icon-button" data-close aria-label="关闭">${icon('close')}</button></div><h2>光与视角</h2><p class="dialog-intro">找到看得清，也看得舒服的角度。</p><label class="setting-row" for="tilt-input"><span><b>镜头倾斜</b><small>从正俯视方向向下倾斜</small></span><output id="tilt-output">32°</output></label><input id="tilt-input" type="range" min="0" max="50" value="32" step="1"/><label class="setting-row" for="light-input"><span><b>曝光</b><small>材质与灯光的明亮程度</small></span><output id="light-output">1.05</output></label><input id="light-input" type="range" min="0.65" max="1.65" value="1.05" step="0.01"/><label class="setting-row toggle-row"><span><b>精细光影</b><small>高分辨率抗锯齿与环境遮蔽</small></span><input type="checkbox" id="quality-input" checked/></label><label class="setting-row toggle-row"><span><b>辅助网格</b><small>清晰显示格子边界</small></span><input type="checkbox" id="grid-input"/></label><label class="setting-row toggle-row"><span><b>自由视角</b><small>右键旋转、中键平移，关闭后跟随小妖</small></span><input type="checkbox" id="free-view-input"/></label><button class="primary-button" id="settings-reset">恢复默认画面 ${icon('reset')}</button><p class="scope-note">Three.js · PBR 材质 · 正交镜头<br>关卡由本机游戏安装目录导入。</p></dialog>
  <dialog id="hint-dialog"><div class="dialog-heading"><span class="eyebrow">A LITTLE GUIDANCE</span><button class="icon-button" data-close aria-label="关闭">${icon('close')}</button></div><h2>慢一点，看清热量。</h2><p class="dialog-intro" id="hint-text"></p><div class="hint-art"><span class="hint-cube hot">↑</span><span>＋</span><span class="hint-cube cold">↓</span><span>→</span><span class="hint-cube neutral">·</span></div><p>在提示关卡中实验，按 Q 返回。提示场景的完成状态不计入探索进度。</p><button class="primary-button" id="start-hint-button">进入原版提示关卡 ${icon('right')}</button></dialog>
`;

type Snapshot = Session;
interface Preferences { tilt: number; light: number; quality: boolean; grid: boolean; sound: boolean; freeView: boolean }
const storageKey = 'maxwell3d-save-v2';
const preferencesKey = 'maxwell3d-preferences-v1';
let data: Dataset, level: Level, state: State, scene: GameScene;
let session: Session, solved = new Set<string>(), undoHistory: Snapshot[] = [], redoHistory: Snapshot[] = [];
let selectedWorld: string;
let category: 'main' | 'extra' | 'lab' = 'main';
let preferences: Preferences = { tilt: 32, light: 1.05, quality: true, grid: false, sound: true, freeView: false };
let levelsById: Map<string, Level>, labels: Map<string, string>;
let toastTimer: ReturnType<typeof setTimeout>, audio: AudioContext | undefined;
let inputTime = 0;
let resolving = false, playback = 0;

function levelName(l: Level): string {
  if (l.title) return l.title;
  if (l.category === 'world') return data.worlds?.find(w => w.id === l.id)?.title ?? '温度的世界';
  if (l.worldId && l.worldId !== data.world) return l.category === 'hint' ? '提示实验' : `关卡 ${l.label}`;
  if (l.category === 'extra') return ['热量的回路', '边界实验', '长廊之外', '封闭的平衡', '冷暖之间', '外界的温度', '分离与连接'][parseInt(l.label.slice(-1), 36) - 10] ?? '额外实验';
  if (l.category === 'hint') return '提示实验';
  return names[Number(l.label.split('-')[1]) - 1] ?? '温度实验';
}
function snapshot(): Snapshot { recordState(session, state, level); return structuredClone(session); }
function canExit(): boolean { return session.hints.length > 0 || !!session.entries[state.levelId]; }
function currentWorld(): World { return data.worlds?.find(w => w.id === selectedWorld) ?? { id: data.world, index: 1, title: '温度的世界', description: '冷与热之间，寻找平衡。', supported: true }; }
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
  const world = currentWorld(), available = new Set(unlockedWorlds(data, solved).map(w => w.id));
  const list = data.levels.filter(l => l.category === category && (category === 'lab' || (l.worldId ?? data.world) === selectedWorld));
  $('#world-picker').innerHTML = (data.worlds ?? [world]).map(w => `<option value="${w.id}" ${w.id === selectedWorld ? 'selected' : ''} ${available.has(w.id) ? '' : 'disabled'}>世界 ${w.index} · ${w.title}${w.supported ? available.has(w.id) ? '' : ' · 未解锁' : ' · 尚未开放'}</option>`).join('');
  $('#chapter-eyebrow').textContent = `WORLD ${String(world.index).padStart(2, '0')} / ${(data.worlds ?? [world]).length}`;
  $('#header-world').textContent = world.title;
  $('#world-title').textContent = world.title; const subtitle = document.createElement('span'); subtitle.textContent = world.description; $('#world-title').append(subtitle);
  for (const key of ['main', 'extra', 'lab'] as const) $(`#${key}-tab small`).textContent = String(data.levels.filter(l => l.category === key && (key === 'lab' || (l.worldId ?? data.world) === selectedWorld)).length);
  $('#level-list').innerHTML = list.map(l => {
    const done = solved.has(l.id), selected = l.id === level.id;
    const number = l.label.split('-')[1]; const hot = l.cells.some(c => c.temperature === 1), cold = l.cells.some(c => c.temperature === -1);
    return `<button class="level-item ${selected ? 'selected' : ''} ${done ? 'completed' : ''}" data-level="${l.id}" aria-current="${selected ? 'true' : 'false'}"><span class="level-number">${done ? icon('check') : number}</span><span class="level-text"><b>${levelName(l)}</b><small>${l.label} ${done ? '· 已完成' : '· ' + l.width + ' × ' + l.height}</small></span><span class="level-thermals">${hot ? '<i class="hot"></i>' : ''}${cold ? '<i class="cold"></i>' : ''}</span>${selected ? icon('chevron') : ''}</button>`;
  }).join('');
  $('#main-tab').setAttribute('aria-selected', String(category === 'main')); $('#extra-tab').setAttribute('aria-selected', String(category === 'extra'));
  $('#lab-tab').setAttribute('aria-selected', String(category === 'lab'));
  const puzzles = data.levels.filter(l => (l.worldId ?? data.world) === selectedWorld && (l.category === 'main' || l.category === 'extra'));
  const count = puzzles.filter(l => solved.has(l.id)).length;
  $('#progress-number').textContent = `${count} / ${puzzles.length}`; $('#progress-fill').style.width = `${count / Math.max(1, puzzles.length) * 100}%`;
  $('#world-button').classList.toggle('active', level.category === 'world');
}
function renderHud(): void {
  $('.play-area').setAttribute('aria-busy', String(resolving));
  $('#breadcrumb-world').textContent = `世界 ${String(currentWorld().index).padStart(2, '0')}`;
  $('#move-count').textContent = String(state.moves).padStart(3, '0'); $('#push-count').textContent = String(state.pushes).padStart(3, '0');
  $('#level-title').textContent = levelName(level); $('#level-badge').textContent = level.label.replace('-', '—');
  $('#breadcrumb-level').textContent = level.category === 'world' ? '世界地图' : level.category === 'hint' ? `${level.label} 提示` : level.category === 'lab' ? '机制实验室' : `关卡 ${level.label.split('-')[1]}`;
  $('#level-description').textContent = level.description ?? (level.category === 'world' ? '靠近入口按 E 进入；完成的关卡入口可以推动。' : level.category === 'hint' ? '在这里自由实验。按 Q 返回关卡。' : '将方块推到蓝色六边形终点，保持小妖冷静。');
  $('#undo-button').toggleAttribute('disabled', !undoHistory.length); $('#redo-button').toggleAttribute('disabled', !redoHistory.length);
  $('#piston-number-button').hidden = !state.pistons?.some(p => p.model === 'boundary');
  const portals = portalCandidates(data, session);
  $('#context-action').hidden = !portals.length || state.frozen || state.solved || state.phase === 'cycling';
  $('#portal-label').textContent = portals.length ? labels.get(portals[0].portal!.target) ?? '未知关卡' : '';
  const message = $('#state-message'); message.hidden = resolving || (!state.solved && state.phase !== 'cycling');
  message.className = 'state-message ' + (state.solved ? 'success' : 'frozen');
  if (state.solved) message.innerHTML = `<span class="message-symbol">${icon('check')}</span><small>EQUILIBRIUM REACHED</small><h3>找到平衡。</h3><p>${state.moves} 步 · ${state.pushes} 次推动</p><div>${canExit() ? '<button id="finish-return" class="primary-button">返回 ' + (session.hints.length ? '关卡' : '上层场景') + icon('right') + '</button>' : '<button id="next-level" class="primary-button">下一关' + icon('right') + '</button><button id="finish-map" class="secondary-button">世界地图</button>'}</div>`;
  else if (state.phase === 'cycling') message.innerHTML = `<h3>循环结算中</h3><p>活塞进入循环，按 Z 撤销或 R 重置。</p><button id="frozen-undo" class="primary-button">撤销一步 <kbd>Z</kbd></button>`;
}
function display(snap = false, activity: 'idle' | 'walking' | 'pushing' = 'idle'): void { recordState(session, state, level); solved = new Set(session.solved); scene.setThinking(session.hints.length > 0); scene.update(state, snap, activity); scene.setGrid(preferences.grid); renderHud(); renderLevels(); save(); }
function cancelPlayback(): void { playback++; resolving = false; scene.cancelMotionWaits(); }
function load(id: string, outside: Temperature = 0, existing?: State, preserveCamera = false): void {
  const found = levelsById.get(id); if (!found) { notify('这个入口通向当前版本范围之外的场景。'); return; }
  cancelPlayback(); level = found; state = existing ? cloneState(existing) : initialState(level, solved, outside);
  syncExteriorTemperature(level, state);
  if (level.worldId) selectedWorld = level.worldId;
  if (level.category === 'extra') category = 'extra'; else if (level.category === 'main' || level.category === 'world') category = 'main'; else if (level.category === 'lab') category = 'lab';
  scene.load(level, state, levelLabels(data.levels), preserveCamera); display(true); $('#hover-info').hidden = true;
  document.body.classList.remove('sidebar-open');
}
function selectLevel(id: string): void {
  const found = levelsById.get(id); if (!found) return;
  if (found.worldId && !unlockedWorlds(data, solved).some(w => w.id === found.worldId)) { notify('这个世界的关卡数据尚未导入。'); return; }
  remember(); session = selectSession(data, found, [...solved], session.visited); load(id, 0, session.current);
}
async function step(direction: Direction): Promise<void> {
  if (resolving || performance.now() - inputTime < 95) return; inputTime = performance.now();
  const next = move(level, state, direction); if (!next) return;
  remember(); const pushing = next.pushes > state.pushes; state = next;
  recordState(session, state, level); solved = new Set(session.solved);
  playTone(state.solved ? 'solve' : pushing ? 'push' : 'move');
  const token = ++playback;
  resolving = state.solved;
  if (next.pistons?.length && next.turnFrames && next.turnFrames.length > 2) {
    resolving = true; renderHud(); renderLevels(); save();
    const frames = next.turnFrames;
    for (const frame of frames) {
      if (token !== playback) return;
      scene.update({ ...next, ...frame, phase: 'ready', solved: false }, false, 'resolving');
      await new Promise(resolve => setTimeout(resolve, frame.phase === 'heat' ? 380 : 200));
    }
    if (token !== playback) return; resolving = state.solved;
  }
  display(false, pushing ? 'pushing' : 'walking');
  if (state.solved) {
    const settled = await scene.whenSettled();
    if (!settled || token !== playback) return;
    resolving = false;
    renderHud();
  }
  if (state.solved && canExit()) { const next = exitLevel(data, session); if (next) { remember(); session = next; load(next.current.levelId, next.current.outside, next.current); notify('关卡完成，已返回上层场景。'); } }
}
function restore(s: Snapshot): void { const sameLevel = level.id === s.current.levelId; session = structuredClone(s); solved = new Set(session.solved); load(session.current.levelId, session.current.outside, session.current, sameLevel); }
function undo(): void { const previous = undoHistory.pop(); if (!previous) return; redoHistory.push(snapshot()); restore(previous); playTone('undo'); }
function redo(): void { const next = redoHistory.pop(); if (!next) return; undoHistory.push(snapshot()); restore(next); playTone('move'); }
function reset(): void { if (state.solved) return; remember(); session = resetSession(session); load(session.current.levelId, session.current.outside, session.current, true); notify('关卡已重置，按 Z 可以撤销。'); }
function enter(targetId?: string): void {
  if (resolving) return;
  const next = enterPortal(data, session, targetId);
  if (!next) {
    if (targetId) { const shortcut = state.cells.find(c => c.portal?.target === targetId)?.portal?.shortcut; notify(!levelsById.has(targetId) ? '这个入口尚未开放。' : shortcut && !session.visited.includes(targetId) ? '快捷入口需要先抵达目标关卡。' : '先走到入口旁边，再按 E 进入。'); }
    return;
  }
  remember(); session = next; load(next.current.levelId, next.current.outside, next.current);
}
function exit(): void {
  if (resolving && state.solved) return;
  if (resolving) cancelPlayback();
  const next = exitLevel(data, session);
  if (!next) return;
  remember(); session = next; load(next.current.levelId, next.current.outside, next.current);
}
function nextLevel(): void {
  const main = data.levels.filter(l => l.category === category && (category === 'lab' || l.worldId === selectedWorld)), index = main.findIndex(l => l.id === level.id);
  selectLevel(main[index + 1]?.id ?? selectedWorld);
}
function openHint(): void {
  const descriptions = level.description ?? (level.notes?.length ? level.notes.map(n => n.text).join('\n\n') : level.category === 'world' ? '世界本身也是一道谜题。尝试完成附近的关卡，再利用入口变成的可移动方块继续探索。' : Number(level.label.split('-')[1]) <= 3 ? '先规划方块到达终点的路线，再寻找你能站立的位置。热与冷接触时会重新结算温度。' : '观察方块的数量、相邻关系和米白色隔热侧面。小妖也可以成为两块之间的导热桥梁。');
  $('#hint-text').textContent = descriptions; $('#start-hint-button').toggleAttribute('disabled', !level.hintId); $<HTMLDialogElement>('#hint-dialog').showModal();
}
function startHint(): void {
  if (resolving || !level.hintId) return; const next = enterHint(data, session, level.hintId); if (!next) return;
  $<HTMLDialogElement>('#hint-dialog').close(); remember(); session = next; load(next.current.levelId, next.current.outside, next.current);
}
function requestHint(): void { if (!resolving) level.hintId ? startHint() : openHint(); }
function applyPreferences(): void {
  scene.setTilt(preferences.tilt); scene.setExposure(preferences.light); scene.setQuality(preferences.quality); scene.setGrid(preferences.grid); scene.setFreeView(preferences.freeView);
  $('#tilt-label').textContent = `${preferences.tilt}°`; $('#tilt-output').textContent = `${preferences.tilt}°`; $('#light-output').textContent = preferences.light.toFixed(2);
  $<HTMLInputElement>('#tilt-input').value = String(preferences.tilt); $<HTMLInputElement>('#light-input').value = String(preferences.light);
  $<HTMLInputElement>('#quality-input').checked = preferences.quality; $<HTMLInputElement>('#grid-input').checked = preferences.grid;
  $<HTMLInputElement>('#free-view-input').checked = preferences.freeView;
  $('#free-view-button').setAttribute('aria-pressed', String(preferences.freeView));
  $('#free-view-button span').textContent = `自由视角 · ${preferences.freeView ? '开' : '关'}`;
  $('#free-view-button').title = `自由视角已${preferences.freeView ? '开启' : '关闭'} · F 切换`;
  $('#camera-guide').textContent = preferences.freeView ? '自由视角 · 右键旋转 · 中键平移 · 滚轮缩放' : '角色跟随 · 右键旋转 · 滚轮缩放 · F 自由视角';
  $('#sound-button').innerHTML = icon(preferences.sound ? 'sound' : 'mute'); $('#sound-button').setAttribute('aria-label', preferences.sound ? '关闭音效' : '开启音效');
  try { localStorage.setItem(preferencesKey, JSON.stringify(preferences)); } catch { /* Preferences can remain in memory. */ }
}
function toggleFreeView(): void { preferences.freeView = !preferences.freeView; applyPreferences(); }
function bind(): void {
  $('#level-list').addEventListener('click', e => { const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-level]'); if (button) selectLevel(button.dataset.level!); });
  $('#main-tab').onclick = () => { category = 'main'; renderLevels(); }; $('#extra-tab').onclick = () => { category = 'extra'; renderLevels(); };
  $('#lab-tab').onclick = () => { category = 'lab'; renderLevels(); };
  $('#world-button').onclick = $('#breadcrumb-world').onclick = () => selectLevel(selectedWorld);
  $('#world-picker').onchange = () => selectLevel($<HTMLSelectElement>('#world-picker').value);
  $('.brand').onclick = e => { e.preventDefault(); selectLevel(data.levels.find(l => l.category === 'main')!.id); };
  $('#undo-button').onclick = undo; $('#redo-button').onclick = redo; $('#reset-button').onclick = reset;
  $('#camera-button').onclick = () => { scene.resetCamera(); notify('镜头已回到默认位置。'); };
  $('#free-view-button').onclick = toggleFreeView;
  $('#help-button').onclick = () => $<HTMLDialogElement>('#help-dialog').showModal(); $('#settings-button').onclick = () => $<HTMLDialogElement>('#settings-dialog').showModal();
  $('#sound-button').onclick = () => { preferences.sound = !preferences.sound; applyPreferences(); };
  $('#hint-button').onclick = requestHint; $('#start-hint-button').onclick = startHint; $('#enter-button').onclick = () => enter();
  $('#piston-number-button').onclick = () => $('#piston-number-button').setAttribute('aria-pressed', String(scene.togglePistonNumbers()));
  $('#menu-button').onclick = () => document.body.classList.toggle('sidebar-open');
  $('#state-message').addEventListener('click', e => {
    const id = (e.target as HTMLElement).closest('button')?.id;
    if (id === 'finish-return') exit(); if (id === 'next-level') nextLevel(); if (id === 'finish-map') selectLevel(selectedWorld); if (id === 'frozen-undo') undo();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-dir]').forEach(b => { b.onclick = () => step(Number(b.dataset.dir) as Direction); });
  document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(b => { b.onclick = () => b.closest('dialog')!.close(); });
  document.querySelectorAll<HTMLDialogElement>('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) { const rect = d.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) d.close(); } }));
  $('#tilt-input').oninput = () => { preferences.tilt = Number($<HTMLInputElement>('#tilt-input').value); applyPreferences(); };
  $('#light-input').oninput = () => { preferences.light = Number($<HTMLInputElement>('#light-input').value); applyPreferences(); };
  $('#quality-input').onchange = () => { preferences.quality = $<HTMLInputElement>('#quality-input').checked; applyPreferences(); };
  $('#grid-input').onchange = () => { preferences.grid = $<HTMLInputElement>('#grid-input').checked; applyPreferences(); };
  $('#free-view-input').onchange = () => { preferences.freeView = $<HTMLInputElement>('#free-view-input').checked; applyPreferences(); };
  $('#settings-reset').onclick = () => { preferences = { ...preferences, tilt: 32, light: 1.05, quality: true, grid: false, freeView: false }; applyPreferences(); scene.resetCamera(); };
  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]') || e.ctrlKey || e.altKey || e.metaKey || (e.target as HTMLElement).matches('input, select')) return;
    const key = e.key.toLowerCase(); const keys: Record<string, Direction> = { arrowleft: 0, a: 0, arrowdown: 1, s: 1, arrowright: 2, d: 2, arrowup: 3, w: 3 };
    if (key in keys) { e.preventDefault(); step(keys[key]); }
    else if (key === 'tab' && state.pistons?.some(p => p.model === 'boundary') && (e.target === document.body || (e.target as HTMLElement).matches('canvas'))) { e.preventDefault(); $('#piston-number-button').click(); }
    else if (key === 'z' || key === 'u') { e.preventDefault(); undo(); }
    else if (key === 'y') redo(); else if (key === 'r') reset(); else if (key === 'f') toggleFreeView(); else if (key === 'e' || key === 'enter' || key === ' ') { e.preventDefault(); if (!resolving) { if (state.solved) canExit() ? exit() : nextLevel(); else enter(); } }
    else if (key === 'q' || key === 'backspace') { e.preventDefault(); exit(); } else if (key === 'h') requestHint();
  });
  scene.onPortalClick = target => enter(target);
  scene.onStatus = (temperature, status) => {
    const element = $('#demon-status'); element.dataset.temperature = String(temperature);
    $('#demon-status span').textContent = `小妖 · ${temperature === 1 ? '高温' : temperature === -1 ? '低温' : temperature === 2 ? '第4温度' : '常温'} · ${status}${status.startsWith('假死') ? ' · Z 撤销 / R 重置' : ''}`;
  };
  scene.onNoteClick = text => { $('#hint-text').textContent = text; $('#start-hint-button').toggleAttribute('disabled', !level.hintId); $<HTMLDialogElement>('#hint-dialog').showModal(); };
  scene.onHover = (key, shown) => {
    const info = $('#hover-info'), model = key === null || !shown ? undefined : inspectCell(shown, key, labels);
    if (!model) { info.hidden = true; return; }
    info.hidden = false; info.replaceChildren();
    const heading = document.createElement('strong'); heading.textContent = model.title; info.append(heading);
    if (model.piston) {
      const badge = document.createElement('span'); badge.className = 'piston-state'; badge.dataset.expanded = String(model.piston.expanded);
      badge.textContent = `${model.piston.state} · ${model.piston.direction}`; info.append(badge);
    }
    const details = document.createElement('p'); details.textContent = model.details; info.append(details);
    if (model.piston) {
      const caption = document.createElement('div'); caption.className = 'inventory-caption'; caption.textContent = '内部物品'; info.append(caption);
      if (!model.contents.length) { const empty = document.createElement('p'); empty.textContent = model.piston.expanded ? '无内部物品' : '空腔'; info.append(empty); }
      for (const item of model.contents) {
        const row = document.createElement('div'); row.className = 'inventory-item'; row.style.marginLeft = `${Math.min(item.depth, 5) * 12}px`;
        const glyph = document.createElement('i'); glyph.className = `inventory-glyph ${item.kind}`; glyph.dataset.temperature = String(item.temperature);
        const text = document.createElement('div'), name = document.createElement('b'), properties = document.createElement('small');
        name.textContent = item.title; properties.textContent = item.details; text.append(name, properties); row.append(glyph, text); info.append(row);
      }
    }
  };
}

async function start(): Promise<void> {
  try {
    const response = await fetch('/levels.local.json'); if (!response.ok) throw new Error('关卡数据尚未导入。请在项目目录运行 npm run import:levels。');
    data = await response.json(); data.levels.push(...laboratory); levelsById = new Map(data.levels.map(l => [l.id, l])); labels = new Map(data.levels.map(l => [l.id, l.displayName ?? l.label]));
    scene = new GameScene($('#scene-host'));
    try { const saved = JSON.parse(localStorage.getItem(preferencesKey) ?? 'null'); if (saved) preferences = { ...preferences, ...saved }; } catch { /* Defaults remain valid when a browser save is unreadable. */ }
    applyPreferences();
    selectedWorld = data.world;
    let saved: Snapshot | undefined;
    try { const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null'); if (value && levelsById.has(value.current?.levelId) && Array.isArray(value.solved) && value.baselines && value.states && Array.isArray(value.current?.cells)) saved = value; } catch { /* Invalid saved data starts a new session. */ }
    if (saved) { session = saved; solved = new Set(saved.solved); load(saved.current.levelId, saved.current.outside, saved.current); }
    else {
      const first = data.levels.find(l => l.category === 'main')!;
      session = selectSession(data, first);
      try {
        const legacy = JSON.parse(localStorage.getItem('maxwell3d-save-v1') ?? 'null');
        if (legacy && levelsById.has(legacy.state?.levelId) && Array.isArray(legacy.solved)) {
          const savedLevel = levelsById.get(legacy.state.levelId)!; session = createSession(savedLevel, legacy.solved);
          session.current = cloneState(legacy.state); session.states[savedLevel.id] = cloneState(session.current);
          for (const [i, frame] of (legacy.stack ?? []).entries()) {
            session.states[frame.levelId] = cloneState(frame.parent); session.baselines[frame.levelId] = initialState(levelsById.get(frame.levelId)!, new Set(session.solved), frame.parent.outside);
            if (frame.hint) session.hints.push({ state: cloneState(frame.parent), levelId: legacy.stack[i + 1]?.levelId ?? legacy.state.levelId });
            else if (frame.portalKey !== undefined && frame.direction !== undefined) {
              const childId = legacy.stack[i + 1]?.levelId ?? legacy.state.levelId;
              session.entries[childId] = { parentId: frame.levelId, portalKey: frame.portalKey, directions: [frame.direction] };
              const entrance = frame.parent.cells.find((c: { key: number }) => c.key === frame.portalKey);
              if (entrance) session.states[frame.levelId].players = frame.parent.players.filter((p: { x: number; y: number }) => Math.abs(p.x - entrance.x) + Math.abs(p.y - entrance.y) !== 1);
            }
          }
        }
      } catch { /* Legacy progress is optional when starting a new session. */ }
      solved = new Set(session.solved); load(session.current.levelId, session.current.outside, session.current);
    }
    bind();
  } catch (error) {
    $('#state-message').hidden = false; $('#state-message').innerHTML = '<h3>暂时无法启动</h3><p></p>';
    $('#state-message p').textContent = error instanceof Error ? error.message : String(error); console.error(error);
  }
}
void start();
