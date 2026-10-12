import './editor.css';
import { checkState, blankLevel, observableState, parseCommands, parseOperations, parseProject, projectDataset, removeCell, Simulation, validateChecks, validateLevel, type Checkpoint, type CheckResult, type Command, type EditorProject, type InitialProgress, type ReplayRow, type Scenario } from './editor-model';
import { arrangeEditor, createChild, projectRooms, removeRoom, setParent } from './editor-workspace';
import { editorDemon } from './editor-demon';
import { addMechanismPresets, editorPresets } from './editor-presets';
import { addReferenceReplays } from './reference-replays';
import { levelIdentifier, levelLabels } from './level-labels';
import type { GameScene } from './scene';
import type { BlockProperties, Dataset, Level, Point, State, Temperature } from './types';

const draftKey = 'maxwell3d-editor-v1';
const names: Record<Command, string> = { L: '←', D: '↓', R: '→', U: '↑', RESET: '重置', UNDO: '撤销', REDO: '重做', ENTER: '进入', EXIT: '退出', HINT: '提示' };
const temperatureName = (temperature: number) => temperature === 1 ? '高温' : temperature === -1 ? '低温' : temperature === 2 ? '第4温度' : '常温';
const option = (value: string | number, text: string) => { const o = document.createElement('option'); o.value = String(value); o.textContent = text; return o; };

export class LevelEditor {
  active = false;
  playing = false;
  private project: EditorProject = editorPresets();
  private panel = document.createElement('aside');
  private previewToolbar = document.createElement('div');
  private simulation?: Simulation;
  private selected?: Point;
  private selectedObject = '';
  private layer?: number;
  private editHistory: EditorProject[] = [];
  private rows: ReplayRow[] = [];
  private currentStep = 0;
  private generation = 0;
  private ready = false;
  private shownId?: string;
  private runStartId = '';
  private runProgress: InitialProgress = {};
  private initialChecks: CheckResult[] = [];
  get hasBoundaryPistons(): boolean { return !!this.simulation?.session.current.pistons?.some(p => p.model === 'boundary'); }
  get discoveredLevels(): string[] { return this.simulation?.session.visited ?? [...this.project.progress?.visited ?? [], this.draft.id]; }
  get labels(): Map<string, string> { return new Map(this.data.levels.map(l => [l.id, l.title ?? l.displayName ?? l.label])); }

  constructor(private base: Dataset, private scene: GameScene, private onClose: () => void) {
    this.panel.className = 'editor-panel'; this.panel.hidden = true; this.panel.setAttribute('aria-label', '关卡编辑器');
    this.panel.innerHTML = `
      <div class="editor-heading"><div><small>LEVEL WORKBENCH</small><h1>关卡实验台</h1></div><button id="editor-close">返回游戏</button></div>
      <p class="editor-intro">编辑布局与机制，逐步回放并检查状态。</p>
      <div class="editor-row"><button id="editor-new">新建关卡</button><button id="editor-copy">复制当前游戏关卡</button></div>
      <label>编辑中的关卡<select id="editor-room"></select></label><button id="editor-remove-room">移除编辑关卡</button>
      <details><summary>载入原版关卡</summary><label>原版关卡<select id="editor-library"></select></label><button id="editor-load-native">复制到实验台</button></details>
      <div class="editor-mode"><button id="editor-edit" aria-pressed="true">编辑布局</button><button id="editor-play" aria-pressed="false">开始试玩</button></div>
      <div id="editor-layout">
        <label>关卡名称<input id="editor-title" maxlength="80"/></label>
        <div class="editor-row"><label>宽<input id="editor-width" type="number" min="1" max="128"/></label><label>高<input id="editor-height" type="number" min="1" max="128"/></label><button id="editor-resize">调整尺寸</button></div>
        <label>编辑层<select id="editor-layer"></select></label>
        <div class="editor-tools" role="group" aria-label="绘制工具">
          <button data-tool="select" aria-pressed="true">选择</button><button data-tool="block">方块</button><button data-tool="glass">透明块</button><button data-tool="fixed">固定块</button><button data-tool="demon">麦妖</button><button data-tool="goal">终点</button><button data-tool="piston">活塞</button><button data-tool="portal">入口</button><button data-tool="erase">擦除</button>
        </div>
        <div class="editor-grid-scroll"><div id="editor-grid" role="group" aria-label="二维编辑棋盘"></div></div>
        <p class="editor-caption" id="editor-selection">点击格子选择物品。坐标从左上角的 0,0 开始。</p>
        <label>选中物品<select id="editor-object"></select></label>
        <div class="editor-properties">
          <div class="editor-row"><label>温度<select id="editor-temperature"><option value="0">常温</option><option value="1">高温</option><option value="-1">低温</option><option value="2">第4温度</option></select></label><label>热容量<input id="editor-capacity" type="number" min="1" max="100000" value="1"/></label></div>
          <div class="editor-row"><label class="editor-check"><input id="editor-fixed" type="checkbox"/>固定</label><label class="editor-check"><input id="editor-glass" type="checkbox"/>透明／不储热</label></div>
          <div class="editor-edges">${['左', '下', '右', '上'].map((name, i) => `<label>${name}边<select id="editor-edge-${i}"><option value="1">普通</option><option value="0">连接／无边</option><option value="2">隔热</option><option value="3">粘边</option></select></label>`).join('')}</div>
          <details open><summary>活塞与入口</summary><div class="editor-row"><label>活塞朝向<select id="editor-direction"><option value="0">左</option><option value="1">下</option><option value="2" selected>右</option><option value="3">上</option></select></label><label>顺序<input id="editor-order" type="number" min="0" value="0"/></label></div><label class="editor-check"><input id="editor-expanded" type="checkbox"/>活塞已展开</label><label>入口目标<select id="editor-target"></select></label><label class="editor-check"><input id="editor-shortcut" type="checkbox"/>副入口／快捷入口</label></details>
          <button id="editor-apply">应用到选中物品</button>
        </div>
        <button id="editor-edit-undo">撤销编辑</button>
      </div>
      <div id="editor-play-controls" hidden><p class="editor-caption">方向键试玩；E 进入，Q 退出，H 提示，R 重置，Z / Y 撤销重做。每次操作保留完整结算帧。</p><label class="editor-check"><input id="editor-record" type="checkbox" checked/>自动记录试玩操作</label><div class="editor-row"><button data-command="ENTER">进入</button><button data-command="EXIT">退出</button><button data-command="HINT">提示</button><button id="editor-restart">从初始布局重新开始</button></div></div>
      <details class="editor-tests" open><summary>行为测试</summary>
        <label>保存的用例<select id="editor-case"></select></label>
        <label>用例名称<input id="editor-case-name" value="新测试" maxlength="120"/></label>
        <a id="editor-source" hidden target="_blank" rel="noopener noreferrer">查看解法来源</a><button id="editor-add-references">添加原作通关回放</button><button id="editor-add-mechanisms">添加机制测试</button>
        <label>操作序列<textarea id="editor-actions" rows="2" spellcheck="false" placeholder="R D R U RESET"></textarea></label>
        <p class="editor-caption">U D L R / ↑ ↓ ← →；R3 表示向右三次。RESET、E、Q、H、Z、Y 对应重置、进入、退出、提示、撤销、重做。E(关卡ID) 指定入口。</p>
        <label>检查点 JSON<textarea id="editor-checks" rows="4" spellcheck="false">[]</textarea></label>
        <p class="editor-caption">例如 {"step":1,"path":"players.0.temperature","equals":0}。accepted 可检查某一步是否被阻挡；cells 按 key、pistons 按 baseKey 排序。</p>
        <div class="editor-row"><button id="editor-capture">记录当前整轮结果为预期</button><button id="editor-save-case">保存用例</button><button id="editor-delete-case">删除用例</button></div>
        <div class="editor-row"><button id="editor-run">从头回放检查</button><button id="editor-next">执行下一步</button><button id="editor-stop">停止</button><button id="editor-run-all">检查全部用例</button></div>
        <p id="editor-report" role="status"></p><div id="editor-results"></div>
      </details>
      <details><summary>操作与热量时间线</summary><div id="editor-timeline"></div><label>当前状态 JSON<textarea id="editor-state" rows="6" readonly spellcheck="false"></textarea></label><button id="editor-export-trace">导出状态轨迹</button></details>
      <details><summary>项目 JSON · 关卡与测试</summary><p class="editor-caption">包含全部编辑关卡、活塞内容物和检查点。也可导入单个 Level JSON；原版关卡文件不受编辑影响。</p><label>项目内容<textarea id="editor-json" rows="8" spellcheck="false"></textarea></label><div class="editor-row"><button id="editor-refresh-json">读取项目 JSON</button><button id="editor-import">应用 JSON</button><button id="editor-export">导出项目</button><label class="editor-file">导入文件<input id="editor-file" type="file" accept=".json,application/json"/></label></div></details>
      <p id="editor-errors" role="alert"></p><p class="editor-caption" id="editor-save-status">草稿独立保存在本机。</p>`;
    arrangeEditor(this.panel);
    this.previewToolbar.className = 'editor-preview-toolbar'; this.previewToolbar.hidden = true;
    this.previewToolbar.innerHTML = '<span id="editor-preview-mode">场景预览</span><button id="editor-preview-play">▶ 测试</button><button id="editor-preview-stop">■ 停止</button><button id="editor-preview-restore">↺ 复位测试</button>';
    document.querySelector('.play-area')!.prepend(this.previewToolbar);
    document.querySelector('.workspace')!.prepend(this.panel);
    this.bind();
  }

  private el<T extends HTMLElement = HTMLElement>(id: string): T { return (this.panel.querySelector<T>(`#${id}`) ?? this.previewToolbar.querySelector<T>(`#${id}`))!; }
  private value(id: string): string { return this.el<HTMLInputElement>(id).value; }
  private get draft(): Level { return this.project.levels.find(l => l.id === this.project.currentId)!; }
  private get data(): Dataset { return projectDataset(this.base, this.project); }
  private get tool(): string { return this.panel.querySelector<HTMLElement>('[data-tool][aria-pressed="true"]')?.dataset.tool ?? 'select'; }
  private guard(action: () => void): void { try { action(); } catch (error) { this.el('editor-errors').textContent = error instanceof Error ? error.message : String(error); } }
  private remember(): void { this.editHistory.push(structuredClone(this.project)); if (this.editHistory.length > 100) this.editHistory.shift(); }
  private stop(): void { this.generation++; }

  open(current: Level): void {
    if (!this.ready) {
      try { const stored = localStorage.getItem(draftKey); if (stored) this.project = parseProject(stored); } catch { this.project = editorPresets(); }
      addMechanismPresets(this.project);
      this.ready = true;
    }
    this.active = true; this.panel.hidden = false; document.querySelector('.workspace')!.classList.add('editor-open'); document.body.classList.add('editor-active');
    this.previewToolbar.hidden = false;
    document.body.classList.remove('sidebar-open'); this.switchToEdit();
  }
  close(): void { this.stop(); this.active = false; this.panel.hidden = true; this.previewToolbar.hidden = true; document.querySelector('.workspace')!.classList.remove('editor-open'); document.body.classList.remove('editor-active'); this.onClose(); }
  private copyLevel(level: Level): void {
    const copy = structuredClone(level), index = this.project.levels.findIndex(l => l.id === copy.id);
    if (index < 0 && this.project.levels.length >= 128) throw new Error('项目最多包含 128 个关卡。');
    if (index >= 0) this.project.levels[index] = copy; else this.project.levels.push(copy);
    this.project.currentId = copy.id;
  }
  private persist(): void {
    try { localStorage.setItem(draftKey, JSON.stringify(this.project)); this.el('editor-save-status').textContent = '草稿独立保存在本机。'; }
    catch { this.el('editor-save-status').textContent = '草稿未能保存，请导出项目 JSON。'; }
  }
  private controls(): void {
    this.el('editor-layout').hidden = this.playing; this.el('editor-play-controls').hidden = !this.playing;
    this.el('editor-edit').setAttribute('aria-pressed', String(!this.playing)); this.el('editor-play').setAttribute('aria-pressed', String(this.playing));
    this.el('editor-play').textContent = this.playing ? '试玩中' : '开始试玩';
    this.el('editor-preview-mode').textContent = this.playing ? '测试运行中' : '场景预览';
    this.el<HTMLButtonElement>('editor-preview-stop').disabled = !this.playing;
    this.el<HTMLButtonElement>('editor-preview-play').disabled = this.playing;
    for (const id of ['editor-child', 'editor-new', 'editor-copy', 'editor-remove-room', 'editor-load-native', 'editor-parent', 'editor-hint', 'editor-root', 'editor-solved', 'editor-visited', 'editor-progress-apply']) this.el<HTMLInputElement>(id).disabled = this.playing;
  }
  private switchToEdit(): void {
    this.stop(); this.playing = false; this.simulation = undefined; this.currentStep = 0; this.rows = []; this.layer = undefined; this.selected = undefined; this.selectedObject = '';
    this.el<HTMLSelectElement>('editor-property-phase').value = 'before';
    this.initialChecks = []; this.el('editor-timeline').replaceChildren(); this.el('editor-results').replaceChildren(); this.el('editor-report').textContent = '';
    this.refresh(); this.controls(); this.preview(true);
  }
  private refresh(): void {
    const rooms = projectRooms(this.project);
    this.el<HTMLSelectElement>('editor-room').replaceChildren(...rooms.map(({ level: l, depth }) => option(l.id, `${'　'.repeat(depth)}${depth ? '└ ' : ''}${l.title ?? levelIdentifier(l)}`)));
    const tree = this.el('editor-tree'); tree.replaceChildren();
    for (const { level, depth } of rooms) { const button = document.createElement('button'); button.textContent = `${level.title ?? level.label} · ${level.id}`; button.style.paddingLeft = `${12 + depth * 18}px`; button.setAttribute('aria-pressed', String(level.id === this.draft.id)); button.onclick = () => { this.project.currentId = level.id; this.switchToEdit(); }; tree.append(button); }
    for (const id of ['editor-parent', 'editor-hint', 'editor-root']) { const select = this.el<HTMLSelectElement>(id); select.replaceChildren(option('', id === 'editor-root' ? '当前编辑场景' : '无'), ...(id === 'editor-root' ? this.project.levels : this.data.levels).filter(l => id !== 'editor-parent' || l.id !== this.draft.id).map(l => option(l.id, `${l.title ?? levelIdentifier(l)} · ${l.id}`))); select.value = id === 'editor-root' ? this.project.rootId ?? '' : id === 'editor-parent' ? this.draft.parentId ?? '' : this.draft.hintId ?? ''; }
    this.el<HTMLTextAreaElement>('editor-solved').value = this.project.progress?.solved?.join('\n') ?? '';
    this.el<HTMLTextAreaElement>('editor-visited').value = this.project.progress?.visited?.join('\n') ?? '';
    this.el<HTMLSelectElement>('editor-room').value = this.project.currentId;
    this.el<HTMLInputElement>('editor-title').value = this.draft.title ?? this.draft.label;
    this.el<HTMLInputElement>('editor-width').value = String(this.draft.width); this.el<HTMLInputElement>('editor-height').value = String(this.draft.height);
    this.el<HTMLSelectElement>('editor-library').replaceChildren(...this.base.levels.map(l => option(l.id, `${levelIdentifier(l)} · ${l.title ?? `${l.width} × ${l.height}`}`)));
    const target = this.value('editor-target');
    this.el<HTMLSelectElement>('editor-target').replaceChildren(...this.data.levels.map(l => option(l.id, `${l.title ?? levelIdentifier(l)} · ${l.id}`)));
    this.el<HTMLSelectElement>('editor-target').value = this.data.levels.some(l => l.id === target) ? target : this.draft.id;
    this.el<HTMLSelectElement>('editor-layer').replaceChildren(option('', '地面'), ...(this.draft.pistons ?? []).map(p => option(p.baseKey, `活塞 #${p.order + 1} 内部${p.expanded ? ' · 已展开' : ''}`)));
    this.el<HTMLSelectElement>('editor-layer').value = this.layer === undefined ? '' : String(this.layer);
    this.refreshCases(); this.renderGrid(); this.persist();
  }
  private refreshCases(): void {
    const previous = this.value('editor-case');
    this.el<HTMLSelectElement>('editor-case').replaceChildren(option('', '选择用例'), ...this.project.scenarios.map((s, i) => option(i, s.name)));
    if (previous !== '' && this.project.scenarios[Number(previous)]?.levelId === this.draft.id) this.el<HTMLSelectElement>('editor-case').value = previous;
    else if (previous !== '') this.clearCase();
  }
  private clearCase(): void {
    this.el<HTMLSelectElement>('editor-case').value = ''; this.el<HTMLInputElement>('editor-case-name').value = '新测试';
    this.el<HTMLTextAreaElement>('editor-actions').value = ''; this.el<HTMLTextAreaElement>('editor-checks').value = '[]'; this.el('editor-source').hidden = true;
  }
  private renderGrid(): void {
    const level = this.draft, grid = this.el('editor-grid'); grid.replaceChildren(); grid.style.gridTemplateColumns = `repeat(${level.width}, 32px)`;
    const parent = this.layer === undefined ? undefined : level.cells[this.layer];
    for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.x = String(x); button.dataset.y = String(y);
      const cellIndex = level.cells.findIndex(c => c.x === x && c.y === y && c.container === this.layer), cell = level.cells[cellIndex];
      const player = level.players.find(p => p.x === x && p.y === y && p.container === this.layer), goal = this.layer === undefined && level.goals.some(g => g.x === x && g.y === y);
      button.className = `editor-square${cell ? ' occupied' : ''}${cell && !cell.storesHeat ? ' glass' : ''}${goal ? ' goal' : ''}`;
      button.dataset.temperature = String(cell?.temperature ?? player?.temperature ?? 0); button.setAttribute('aria-pressed', String(this.selected?.x === x && this.selected.y === y));
      button.disabled = !!parent && (parent.x !== x || parent.y !== y);
      button.textContent = player ? '' : level.pistons?.some(p => p.baseKey === cellIndex) ? '⇥' : cell?.portal ? '↪' : cell?.fixed ? '⌖' : cell ? String(cellIndex) : goal ? '⬡' : '';
      if (player) { button.classList.add('demon'); button.append(editorDemon(player.temperature)); }
      const edges = cell ? ['左', '下', '右', '上'].filter((_, d) => (cell.edges >> (d * 2) & 3) === 3).join('、') : '';
      button.setAttribute('aria-label', `格 ${x},${y}${cell ? ` · #${cellIndex} ${!cell.storesHeat ? '透明块' : '方块'} ${temperatureName(cell.temperature)}` : ''}${player ? ' · 麦妖' : ''}${goal ? ' · 终点' : ''}${edges ? ` · ${edges}粘边` : ''}`);
      button.title = button.getAttribute('aria-label')!;
      if (cell) for (let d = 0; d < 4; d++) { const edge = document.createElement('i'); edge.className = `editor-edge side-${d} kind-${cell.edges >> (d * 2) & 3}`; button.append(edge); }
      grid.append(button);
    }
    this.inspect();
  }
  private inspect(): void {
    const objects = this.el<HTMLSelectElement>('editor-object'); objects.replaceChildren(option('', '未选择'));
    if (!this.selected) { this.selectedObject = ''; this.el<HTMLButtonElement>('editor-apply').disabled = true; return; }
    const { x, y } = this.selected, cells = this.draft.cells, players = this.draft.players;
    cells.forEach((c, i) => { if (c.x === x && c.y === y && c.container === this.layer) objects.append(option(`c${i}`, `方块 #${i}`)); });
    players.forEach((p, i) => { if (p.x === x && p.y === y && p.container === this.layer) objects.append(option(`p${i}`, `麦妖 ${i + 1}`)); });
    if (!Array.from(objects.options).some(o => o.value === this.selectedObject) || !this.selectedObject) this.selectedObject = objects.options[1]?.value ?? '';
    objects.value = this.selectedObject;
    this.el<HTMLButtonElement>('editor-apply').disabled = !this.selectedObject;
    this.el('editor-selection').textContent = `选中 ${x},${y}${this.layer === undefined ? ' · 地面' : ` · 活塞 #${this.layer} 内部`}`;
    this.readProperties();
  }
  private readProperties(): void {
    const index = Number(this.selectedObject.slice(1));
    if (this.selectedObject.startsWith('p')) { this.el<HTMLSelectElement>('editor-temperature').value = String(this.draft.players[index].temperature ?? 0); return; }
    const cell = this.selectedObject.startsWith('c') ? this.draft.cells[index] : undefined; if (!cell) return;
    const piston = this.draft.pistons?.find(p => p.baseKey === index);
    const phase = this.el<HTMLSelectElement>('editor-property-phase');
    phase.options[1].disabled = !cell.portal; phase.options[2].disabled = !piston;
    if (phase.selectedOptions[0]?.disabled) phase.value = 'before';
    const properties = phase.value === 'after' ? cell.portal!.after : phase.value === 'head' ? piston!.head : cell.portal?.before ?? cell;
    this.el<HTMLInputElement>('editor-is-piston').checked = !!piston; this.el<HTMLInputElement>('editor-is-portal').checked = !!cell.portal;
    this.el<HTMLButtonElement>('editor-copy-before').disabled = !cell.portal;
    this.el('editor-property-caption').textContent = `${phase.value === 'after' ? '目标关卡完成后' : phase.value === 'head' ? '活塞伸出部分' : '初始方块'} · #${index}`;
    this.el<HTMLSelectElement>('editor-temperature').value = String(properties.temperature); this.el<HTMLInputElement>('editor-capacity').value = String(properties.heatCapacity ?? 1);
    this.el<HTMLInputElement>('editor-fixed').checked = properties.fixed; this.el<HTMLInputElement>('editor-glass').checked = !properties.storesHeat;
    for (let d = 0; d < 4; d++) this.el<HTMLSelectElement>(`editor-edge-${d}`).value = String(properties.edges >> (d * 2) & 3);
    if (piston) { this.el<HTMLSelectElement>('editor-direction').value = String(piston.direction); this.el<HTMLInputElement>('editor-expanded').checked = piston.expanded; this.el<HTMLInputElement>('editor-order').value = String(piston.order); }
    if (cell.portal) { this.el<HTMLSelectElement>('editor-target').value = cell.portal.target; this.el<HTMLInputElement>('editor-shortcut').checked = cell.portal.shortcut; }
  }
  private properties(): BlockProperties {
    return { fixed: this.el<HTMLInputElement>('editor-fixed').checked, storesHeat: !this.el<HTMLInputElement>('editor-glass').checked,
      temperature: Number(this.value('editor-temperature')) as Temperature, heatCapacity: Number(this.value('editor-capacity')), edges: [0, 1, 2, 3].reduce((v, d) => v | Number(this.value(`editor-edge-${d}`)) << (d * 2), 0) };
  }
  private piston(index: number): void {
    const direction = Number(this.value('editor-direction')) as 0 | 1 | 2 | 3, expanded = this.el<HTMLInputElement>('editor-expanded').checked, order = Number(this.value('editor-order'));
    const existing = this.draft.pistons?.find(p => p.baseKey === index);
    if (existing) Object.assign(existing, { direction, expanded, order });
    else (this.draft.pistons ??= []).push({ model: 'boundary', baseKey: index, headKey: -10000 - index, direction, expanded, order, head: { ...this.properties() } });
  }
  private paint(x: number, y: number): void {
    if (this.playing) return;
    this.selected = { x, y }; this.selectedObject = '';
    if (this.tool === 'select') { this.renderGrid(); return; }
    this.remember(); const level = this.draft, index = level.cells.findIndex(c => c.x === x && c.y === y && c.container === this.layer);
    if (this.tool === 'erase') {
      if (index >= 0) removeCell(level, index);
      level.players = level.players.filter(p => p.x !== x || p.y !== y || p.container !== this.layer);
      if (this.layer === undefined) level.goals = level.goals.filter(p => p.x !== x || p.y !== y);
    } else if (this.tool === 'goal') {
      if (this.layer === undefined) level.goals.some(g => g.x === x && g.y === y) ? level.goals = level.goals.filter(g => g.x !== x || g.y !== y) : level.goals.push({ x, y });
    } else if (this.tool === 'demon') {
      if (!level.players.some(p => p.x === x && p.y === y && p.container === this.layer)) level.players.push({ x, y, temperature: Number(this.value('editor-temperature')) as Temperature, ...(this.layer === undefined ? {} : { container: this.layer }) });
    } else {
      const properties = this.properties(); if (this.tool === 'glass') properties.storesHeat = false; if (this.tool === 'fixed') properties.fixed = true;
      const cell = { x, y, ...properties, ...(this.layer === undefined ? {} : { container: this.layer }) };
      const key = index >= 0 ? index : level.cells.length;
      if (index >= 0) Object.assign(level.cells[index], cell); else level.cells.push(cell);
      if (this.tool === 'piston') this.piston(key);
      if (this.tool === 'portal') level.cells[key].portal = { target: this.value('editor-target'), shortcut: this.el<HTMLInputElement>('editor-shortcut').checked, before: { ...properties }, after: { ...properties, fixed: false } };
      this.selectedObject = `c${key}`;
    }
    this.refresh(); this.preview(true);
  }
  private preview(snap: boolean, shown?: State, shownLevel?: Level): void {
    const errors = validateLevel(this.draft); this.el('editor-errors').textContent = errors.join('\n');
    if (errors.length && !this.playing) return;
    const level = shownLevel ?? this.simulation?.level ?? this.draft;
    const state = shown ?? this.simulation?.session.current ?? new Simulation(this.data, level, undefined, this.project.progress).session.current;
    this.scene.setDiscoveredLevels(this.discoveredLevels);
    if (snap) this.scene.load(level, state, levelLabels(this.data.levels), this.shownId === level.id); else this.scene.update(state, false, 'walking');
    this.shownId = level.id;
    document.querySelector('#level-title')!.textContent = level.title ?? levelIdentifier(level);
    document.querySelector('#level-description')!.textContent = this.playing ? `试玩 · 第 ${this.currentStep} 次操作 · ${state.solved ? '已通关' : state.frozen ? '假死' : state.phase === 'cycling' ? '循环结算' : '可行动'}` : `编辑预览 · ${level.width} × ${level.height} · ${level.players.length} 只麦妖`;
    document.querySelector('#breadcrumb-level')!.textContent = this.playing ? '试玩与回放' : '关卡编辑'; document.querySelector('#breadcrumb-world')!.textContent = '实验台';
    document.querySelector('#level-badge')!.textContent = 'EDITOR'; document.querySelector('#move-count')!.textContent = String(state.moves).padStart(3, '0'); document.querySelector('#push-count')!.textContent = String(state.pushes).padStart(3, '0');
    (document.querySelector('#state-message') as HTMLElement).hidden = true; (document.querySelector('#context-action') as HTMLElement).hidden = true;
    (document.querySelector('#undo-button') as HTMLButtonElement).disabled = !this.playing || !this.simulation?.canUndo;
    (document.querySelector('#redo-button') as HTMLButtonElement).disabled = !this.playing || !this.simulation?.canRedo;
    (document.querySelector('#piston-number-button') as HTMLButtonElement).hidden = !state.pistons?.some(p => p.model === 'boundary');
    this.el<HTMLTextAreaElement>('editor-state').value = JSON.stringify(observableState(state), null, 2);
    this.controls();
  }
  private startPlay(checks = this.checks(), level = this.draft, progress = this.project.progress ?? {}): void {
    parseProject(JSON.stringify(this.project));
    this.stop(); this.playing = true; this.runStartId = level.id; this.runProgress = structuredClone(progress); this.simulation = new Simulation(this.data, level, undefined, this.runProgress); this.rows = []; this.currentStep = 0; this.preview(true); this.renderTimeline();
    this.initialChecks = checkState(this.simulation.session.current, checks, 0); this.reportCurrent();
  }
  command(command: Command, target?: string, record = true): void {
    this.guard(() => {
      if (!this.playing || !this.simulation) return;
      this.stop(); this.execute(command, this.checks(), target);
      if (record && this.el<HTMLInputElement>('editor-record').checked) this.el<HTMLTextAreaElement>('editor-actions').value = this.rows.filter(r => r.step <= this.currentStep).map(r => r.target ? `E(${r.target})` : r.command).join(' ');
    });
  }
  private execute(command: Command, checks: Checkpoint[], target?: string, report = true): void {
    const previousId = this.simulation!.level.id, accepted = this.simulation!.apply(command, target), state = structuredClone(this.simulation!.session.current);
    this.currentStep++; this.rows = this.rows.filter(r => r.step < this.currentStep);
    this.rows.push({ step: this.currentStep, command, ...(target ? { target } : {}), accepted, state, checks: checkState(state, checks, this.currentStep, accepted) });
    this.preview(previousId !== state.levelId || command === 'RESET' || command === 'UNDO' || command === 'REDO'); this.renderTimeline();
    if (report) this.reportCurrent();
  }
  private reportCurrent(): void {
    const results = [...this.initialChecks, ...this.rows.filter(r => r.step <= this.currentStep).flatMap(r => r.checks)];
    this.el('editor-report').textContent = `第 ${this.currentStep} 次操作 · ${results.filter(r => r.passed).length}/${results.length} 项检查通过${results.length ? '' : ' · 尚无检查点'}`;
    this.el('editor-results').replaceChildren();
    for (const r of results.filter(r => !r.passed)) { const row = document.createElement('pre'); row.textContent = `第 ${r.step} 步 · ${r.path || '完整状态'}\n预期 ${JSON.stringify(r.equals)}\n实际 ${JSON.stringify(r.actual) ?? '不存在'}`; this.el('editor-results').append(row); }
  }
  private checks(): Checkpoint[] { const checks = JSON.parse(this.value('editor-checks')); validateChecks(checks, 10000); return checks; }
  private scenario(): Scenario {
    const actions = this.value('editor-actions'), commands = parseCommands(actions), checks = this.checks(); validateChecks(checks, commands.length);
    const selected = this.value('editor-case'), source = selected === '' ? undefined : this.project.scenarios[Number(selected)]?.source;
    return { name: this.value('editor-case-name').trim() || '新测试', levelId: this.draft.id, actions, checks, progress: structuredClone(this.project.progress ?? {}), ...(source ? { source } : {}) };
  }
  private async run(all = false): Promise<void> {
    const scenarios = all ? structuredClone(this.project.scenarios) : [this.scenario()];
    for (const scenario of scenarios) validateChecks(scenario.checks, parseCommands(scenario.actions).length);
    this.startPlay(all ? [] : scenarios[0].checks); const token = ++this.generation;
    this.el('editor-results').replaceChildren(); let failures = 0, total = 0;
    for (const scenario of scenarios) {
      if (token !== this.generation) return;
      const level = this.data.levels.find(l => l.id === scenario.levelId); if (!level) continue;
      this.runStartId = level.id; this.runProgress = structuredClone(scenario.progress ?? {}); this.simulation = new Simulation(this.data, level, undefined, this.runProgress); this.rows = []; this.currentStep = 0; this.preview(true);
      const results = checkState(this.simulation.session.current, scenario.checks, 0);
      this.initialChecks = [...results];
      for (const { command, target } of parseOperations(scenario.actions)) {
        if (token !== this.generation) return;
        this.execute(command, scenario.checks, target, false); results.push(...this.rows.at(-1)!.checks);
        this.el('editor-report').textContent = `${scenario.name} · 第 ${this.currentStep} 次操作`;
        await new Promise(resolve => setTimeout(resolve, all ? 0 : 90));
      }
      if (token !== this.generation) return;
      const passed = results.length > 0 && results.every(r => r.passed); total++; if (!passed) failures++;
      const heading = document.createElement('p'); heading.className = passed ? 'editor-pass' : 'editor-fail'; heading.textContent = `${passed ? '✓' : '×'} ${scenario.name} · ${results.filter(r => r.passed).length}/${results.length} 项通过${results.length ? '' : ' · 尚无检查点'}`; this.el('editor-results').append(heading);
      for (const result of results.filter(r => !r.passed)) { const row = document.createElement('pre'); row.textContent = `第 ${result.step} 步 · ${result.path || '完整状态'}\n预期 ${JSON.stringify(result.equals)}\n实际 ${JSON.stringify(result.actual) ?? '不存在'}`; this.el('editor-results').append(row); }
      this.el('editor-report').textContent = `${total - failures}/${total} 个用例通过`;
    }
  }
  private renderTimeline(): void {
    const container = this.el('editor-timeline'); container.replaceChildren();
    const start = document.createElement('button'); start.textContent = '0 · 初始状态'; start.onclick = () => this.seek(0); container.append(start);
    for (const row of this.rows) {
      const group = document.createElement('div'); group.className = 'editor-turn';
      const button = document.createElement('button'); button.textContent = `${row.step} · ${names[row.command]} · ${row.accepted ? '执行' : '阻挡'}${row.checks.length ? ` · ${row.checks.every(c => c.passed) ? '✓' : '×'}` : ''}`;
      button.onclick = () => this.seek(row.step); group.append(button);
      row.state.turnFrames?.forEach((frame, i) => {
        const phase = document.createElement('button'); phase.className = 'editor-phase'; phase.textContent = `${i + 1} ${frame.phase === 'heat' ? '热量' : '移动／活塞'}`;
        phase.onclick = () => { this.stop(); this.preview(true, { ...row.state, ...frame, phase: 'ready', solved: false }, this.data.levels.find(l => l.id === row.state.levelId)); document.querySelector('#level-description')!.textContent = `第 ${row.step} 次操作 · 结算帧 ${i + 1}/${row.state.turnFrames!.length} · ${frame.phase === 'heat' ? '热量平衡' : '移动与活塞'}`; }; group.append(phase);
      }); container.append(group);
    }
  }
  private seek(step: number): void {
    this.stop(); this.playing = true; this.simulation = new Simulation(this.data, this.data.levels.find(l => l.id === this.runStartId)!, undefined, this.runProgress);
    for (const row of this.rows.filter(r => r.step <= step)) this.simulation.apply(row.command, row.target);
    this.currentStep = step; this.preview(true); this.reportCurrent();
  }
  private loadCase(index: number): void {
    const scenario = this.project.scenarios[index]; if (!scenario) return;
    this.project.currentId = scenario.levelId; this.project.progress = structuredClone(scenario.progress ?? {}); this.switchToEdit(); this.el<HTMLSelectElement>('editor-case').value = String(index);
    this.el<HTMLInputElement>('editor-case-name').value = scenario.name; this.el<HTMLTextAreaElement>('editor-actions').value = scenario.actions; this.el<HTMLTextAreaElement>('editor-checks').value = JSON.stringify(scenario.checks, null, 2);
    const source = this.el<HTMLAnchorElement>('editor-source'); source.hidden = !scenario.source?.startsWith('https://'); if (!source.hidden) source.href = scenario.source!;
  }
  private download(name: string, content: unknown): void {
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  private bind(): void {
    const click = (id: string, action: () => void) => { this.el(id).onclick = () => this.guard(action); };
    click('editor-close', () => this.close()); click('editor-edit', () => this.switchToEdit()); click('editor-play', () => this.startPlay()); click('editor-restart', () => this.startPlay());
    click('editor-preview-play', () => this.startPlay()); click('editor-preview-stop', () => this.switchToEdit());
    click('editor-preview-restore', () => { const level = this.data.levels.find(l => l.id === this.runStartId) ?? this.draft; this.startPlay([], this.playing ? level : this.draft, this.playing ? this.runProgress : this.project.progress); });
    click('editor-root-play', () => this.startPlay([], this.project.levels.find(l => l.id === this.project.rootId) ?? this.draft));
    click('editor-child', () => { this.remember(); createChild(this.project, this.layer === undefined ? this.selected : undefined); this.switchToEdit(); });
    this.el('editor-parent').onchange = () => this.guard(() => { this.remember(); setParent(this.project, this.draft.id, this.value('editor-parent') || undefined); this.refresh(); });
    this.el('editor-root').onchange = () => this.guard(() => { this.remember(); this.project.rootId = this.value('editor-root') || undefined; this.persist(); });
    this.el('editor-hint').onchange = () => this.guard(() => { this.remember(); this.draft.hintId = this.value('editor-hint') || undefined; this.persist(); });
    click('editor-progress-apply', () => { const ids = (id: string) => [...new Set(this.value(id).split(/[\s,;]+/).filter(Boolean))]; const progress = { solved: ids('editor-solved'), visited: ids('editor-visited') }; for (const id of [...progress.solved, ...progress.visited]) if (!this.data.levels.some(l => l.id === id)) throw new Error(`初始进度中的关卡不存在：${id}`); this.remember(); this.project.progress = progress; this.switchToEdit(); });
    click('editor-new', () => { this.remember(); const level = blankLevel(`editor-${Date.now().toString(36)}`); this.copyLevel(level); this.switchToEdit(); });
    click('editor-remove-room', () => { this.remember(); removeRoom(this.project, this.draft.id); this.switchToEdit(); });
    click('editor-copy', () => { this.remember(); this.copyLevel(this.base.levels.find(l => l.id === document.querySelector('#editor-button')!.getAttribute('data-origin'))!); this.switchToEdit(); });
    click('editor-load-native', () => { this.remember(); this.copyLevel(this.base.levels.find(l => l.id === this.value('editor-library'))!); this.switchToEdit(); });
    this.el('editor-room').onchange = () => { this.project.currentId = this.value('editor-room'); this.switchToEdit(); };
    this.el('editor-title').onchange = () => { this.remember(); this.draft.title = this.value('editor-title'); this.persist(); this.preview(true); };
    click('editor-resize', () => { const width = Number(this.value('editor-width')), height = Number(this.value('editor-height')); if (![width, height].every(n => Number.isInteger(n) && n >= 1 && n <= 128)) throw new Error('宽、高必须是 1–128 的整数。'); this.remember(); this.draft.width = width; this.draft.height = height; this.renderGrid(); this.persist(); this.preview(true); });
    this.el('editor-layer').onchange = () => { this.layer = this.value('editor-layer') === '' ? undefined : Number(this.value('editor-layer')); this.selected = undefined; this.renderGrid(); };
    this.panel.querySelectorAll<HTMLElement>('[data-tool]').forEach(b => { b.onclick = () => { this.panel.querySelectorAll('[data-tool]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }; });
    let last = '';
    const paint = (event: PointerEvent) => { const b = (event.target as HTMLElement).closest<HTMLButtonElement>('#editor-grid button'); if (!b || b.disabled) return; const key = `${b.dataset.x},${b.dataset.y}`; if (event.type === 'pointermove' && (event.buttons !== 1 || this.tool === 'select' || key === last)) return; last = key; this.guard(() => this.paint(Number(b.dataset.x), Number(b.dataset.y))); };
    this.el('editor-grid').addEventListener('pointerdown', paint); this.el('editor-grid').addEventListener('pointermove', paint);
    this.el('editor-object').onchange = () => { this.selectedObject = this.value('editor-object'); this.readProperties(); };
    this.el('editor-property-phase').onchange = () => this.readProperties();
    click('editor-copy-before', () => { const cell = this.draft.cells[Number(this.selectedObject.slice(1))]; if (!this.selectedObject.startsWith('c') || !cell?.portal) return; this.remember(); cell.portal.after = structuredClone(cell.portal.before); this.readProperties(); this.persist(); this.preview(true); });
    click('editor-apply', () => {
      if (!this.selectedObject) return;
      const index = Number(this.selectedObject.slice(1));
      if (this.selectedObject.startsWith('c') && !this.el<HTMLInputElement>('editor-is-piston').checked && this.draft.pistons?.some(p => p.baseKey === index) && (this.draft.cells.some(c => c.container === index) || this.draft.players.some(p => p.container === index))) throw new Error('先移除内部物品，再移除活塞。');
      this.remember();
      if (this.selectedObject.startsWith('p')) this.draft.players[index].temperature = Number(this.value('editor-temperature')) as Temperature;
      else {
        const cell = this.draft.cells[index], phase = this.value('editor-property-phase'), properties = this.properties();
        const piston = this.draft.pistons?.find(p => p.baseKey === index);
        if (phase === 'head' && piston) piston.head = properties;
        else if (phase === 'after' && cell.portal) cell.portal.after = properties;
        else { Object.assign(cell, properties); if (cell.portal) cell.portal.before = { ...properties }; }
        if (this.el<HTMLInputElement>('editor-is-portal').checked) {
          const { fixed, storesHeat, temperature, heatCapacity, edges } = cell;
          cell.portal ??= { target: this.value('editor-target'), shortcut: false, before: { fixed, storesHeat, temperature, heatCapacity, edges }, after: { ...properties, fixed: false } };
          Object.assign(cell.portal, { target: this.value('editor-target'), shortcut: this.el<HTMLInputElement>('editor-shortcut').checked });
        } else delete cell.portal;
        if (this.el<HTMLInputElement>('editor-is-piston').checked) this.piston(index);
        else if (piston) {
          this.draft.pistons = this.draft.pistons?.filter(p => p.baseKey !== index);
        }
      }
      this.renderGrid(); this.persist(); this.preview(true);
    });
    click('editor-edit-undo', () => { const previous = this.editHistory.pop(); if (previous) { this.project = previous; this.switchToEdit(); } });
    this.panel.querySelectorAll<HTMLElement>('[data-command]').forEach(b => { b.onclick = () => this.command(b.dataset.command as Command); });
    this.el('editor-case').onchange = () => { if (this.value('editor-case') !== '') this.loadCase(Number(this.value('editor-case'))); else { this.switchToEdit(); this.clearCase(); } };
    click('editor-capture', () => { const state = this.simulation?.session.current ?? new Simulation(this.data, this.draft).session.current, checks = this.checks().filter(c => c.step !== this.currentStep); for (const [path, equals] of Object.entries(observableState(state))) checks.push({ step: this.currentStep, path, equals }); this.el<HTMLTextAreaElement>('editor-checks').value = JSON.stringify(checks, null, 2); });
    click('editor-save-case', () => { const scenario = this.scenario(), index = this.value('editor-case'); if (index === '') this.project.scenarios.push(scenario); else this.project.scenarios[Number(index)] = scenario; this.refreshCases(); this.el<HTMLSelectElement>('editor-case').value = index === '' ? String(this.project.scenarios.length - 1) : index; this.persist(); });
    click('editor-delete-case', () => { const index = this.value('editor-case'); if (index !== '') { this.project.scenarios.splice(Number(index), 1); this.switchToEdit(); this.clearCase(); this.persist(); } });
    click('editor-add-references', () => { const count = addReferenceReplays(this.base, this.project); this.refresh(); this.el('editor-report').textContent = `已添加 ${count} 个原作通关回放`; });
    click('editor-add-mechanisms', () => { const count = addMechanismPresets(this.project); this.refresh(); this.el('editor-report').textContent = `已添加 ${count} 个机制测试`; });
    click('editor-run', () => { void this.run().catch(e => { this.el('editor-errors').textContent = String(e); }); }); click('editor-run-all', () => { void this.run(true).catch(e => { this.el('editor-errors').textContent = String(e); }); }); click('editor-stop', () => this.stop());
    click('editor-next', () => { const operations = parseOperations(this.value('editor-actions')); if (!this.playing) this.startPlay(); const next = operations[this.currentStep]; if (next) this.command(next.command, next.target, false); });
    click('editor-refresh-json', () => { this.el<HTMLTextAreaElement>('editor-json').value = JSON.stringify(this.project, null, 2); });
    click('editor-import', () => { this.remember(); this.project = parseProject(this.value('editor-json')); this.switchToEdit(); });
    click('editor-export', () => this.download('maxwell-project.json', this.project));
    click('editor-export-trace', () => this.download('maxwell-trace.json', { levelId: this.playing ? this.runStartId : this.draft.id, rows: this.rows, final: this.simulation ? observableState(this.simulation.session.current) : null }));
    this.el<HTMLInputElement>('editor-file').onchange = async () => { const file = this.el<HTMLInputElement>('editor-file').files?.[0]; if (!file) return; const text = await file.text(); this.guard(() => { this.remember(); this.project = parseProject(text); this.switchToEdit(); }); };
  }
}
