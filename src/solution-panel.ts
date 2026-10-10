import { operationLabel, parseSolutionFile, savedSolutions, solutionFile, solutionStartId, SolutionRecording, SolutionReplay, type SavedSolution } from './solutions';
import type { Operation, SimulationCheckpoint } from './editor-model';
import type { Dataset } from './types';
import type { Session } from './session';
import './solutions.css';

interface ReplayHooks {
  begin(): void;
  show(session: Session, snap: boolean): Promise<void>;
  end(): void;
  cancelMotion(): void;
  capture(): SimulationCheckpoint;
  notify(message: string): void;
}

export class SolutionPanel {
  private replay?: SolutionReplay;
  private generation = 0;
  private playing = false;
  private busy = false;
  private speed = 1;
  private dialog = document.createElement('dialog');
  private bar = document.createElement('section');
  private personal: SavedSolution[] = [];
  private recording?: SolutionRecording;
  private readonly storageKey = 'maxwell3d-solutions-v2';

  get active(): boolean { return !!this.replay; }
  get isRecording(): boolean { return !!this.recording; }

  constructor(readonly data: Dataset, private hooks: ReplayHooks) {
    this.dialog.id = 'solutions-dialog'; this.dialog.className = 'solutions-dialog';
    this.dialog.setAttribute('aria-label', '已保存的解法');
    this.dialog.innerHTML = `<div class="solution-heading"><h2>已保存的解法</h2><button id="solutions-close" aria-label="关闭解法列表">×</button></div><div class="solution-library-actions"><button id="solution-record">从当前场景开始录制</button><button id="solution-import">导入回放</button><input id="solution-file" type="file" accept="application/json,.json" hidden/></div><p id="solution-recording" role="status"></p><p id="solutions-count"></p><div id="solutions-list"></div><p class="solution-note">关内路线从关卡初始布局开始。跨场景路线保留起点存档及入口准备过程。录制期间每次通关自动保存；回放独立运行，退出后恢复游玩进度。</p>`;
    this.bar.id = 'solution-controls'; this.bar.className = 'solution-controls'; this.bar.hidden = true;
    this.bar.setAttribute('aria-label', '解法回放');
    this.bar.innerHTML = `<div class="solution-status"><strong id="solution-title"></strong><span id="solution-position" role="status"></span></div><div class="solution-buttons"><button id="solution-restart">从头</button><button id="solution-previous">上一步</button><button id="solution-play">播放</button><button id="solution-next">下一步</button><label>速度<select id="solution-speed" aria-label="回放速度"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label><a id="solution-source" target="_blank" rel="noopener noreferrer" hidden>视频来源</a><button id="solution-export">导出解法</button><button id="solution-exit">退出回放</button></div><input id="solution-progress" type="range" min="0" value="0" aria-label="回放进度"/><div id="solution-actions" class="solution-actions" aria-label="解法操作序列"></div>`;
    document.querySelector('.play-area')!.append(this.dialog);
    document.querySelector('.scene-host')!.before(this.bar);
    this.el('solutions-close').onclick = () => this.dialog.close();
    this.el('solution-play').onclick = () => this.playing ? this.pause() : void this.play();
    this.el('solution-next').onclick = () => { this.pause(); if (!this.busy) void this.advance(); };
    this.el('solution-previous').onclick = () => { this.pause(); if (!this.busy) void this.seek(Math.max(0, this.replay!.cursor - 1)); };
    this.el('solution-restart').onclick = () => { this.pause(); if (!this.busy) void this.seek(0); };
    this.el('solution-exit').onclick = () => this.close();
    this.el('solution-export').onclick = () => this.export();
    this.el('solution-record').onclick = () => { this.recording ? this.recording = undefined : this.beginRecording(); this.renderRecording(); this.dialog.close(); };
    this.el('solution-import').onclick = () => this.el<HTMLInputElement>('solution-file').click();
    this.el<HTMLInputElement>('solution-file').onchange = () => void this.import();
    this.el<HTMLSelectElement>('solution-speed').onchange = event => { this.speed = Number((event.target as HTMLSelectElement).value); };
    this.el<HTMLInputElement>('solution-progress').onchange = event => {
      const step = Number((event.target as HTMLInputElement).value);
      this.pause(); if (!this.busy) void this.seek(step);
    };
    try { const stored = localStorage.getItem(this.storageKey); if (stored) this.personal = parseSolutionFile(stored, data); } catch { this.personal = []; }
  }

  beginRecording(): void { this.recording = new SolutionRecording(this.hooks.capture()); }
  record(operation: Operation, session: Session): void {
    if (this.active || !this.recording) return;
    this.recording.append(operation);
    if (!session.current.solved || session.hints.length || operation.command === 'UNDO' || operation.command === 'REDO') return;
    const level = this.data.levels.find(l => l.id === session.current.levelId)!;
    if (level.category === 'lab' || level.category === 'hint') return;
    const solution = this.recording.solution(level.id, level.displayName ?? level.label, session);
    solution.id = `play-${Date.now()}-${level.id}`;
    this.personal.push(solution); this.persist(); this.hooks.notify(`${solution.label} 的回放已保存，包含本次录制的入口准备过程。`);
  }
  private persist(): void {
    try { localStorage.setItem(this.storageKey, JSON.stringify(solutionFile(this.personal))); }
    catch { this.hooks.notify('浏览器存储空间不足；当前回放仍可从解法列表导出。'); }
  }
  private renderRecording(): void {
    this.el('solution-record').textContent = this.recording ? '结束录制' : '从当前场景开始录制';
    this.el('solution-recording').textContent = this.recording ? `正在录制 · ${this.recording.operations.length} 次操作 · 通关时自动保存` : '录制起点包含当前场景、房间缓存和撤销历史。';
    this.el<HTMLButtonElement>('solution-record').disabled = this.active;
  }
  private async import(): Promise<void> {
    const input = this.el<HTMLInputElement>('solution-file'), file = input.files?.[0]; input.value = ''; if (!file) return;
    try {
      const solutions = parseSolutionFile(await file.text(), this.data);
      for (const solution of solutions) { const replay = new SolutionReplay(this.data, solution); while (!replay.finished) { replay.advance(); if (!replay.accepted) throw new Error(`${solution.label} 有操作被阻挡。`); } if (!replay.passed) throw new Error(`${solution.label} 未达到保存的通关结果。`); }
      this.personal.push(...solutions.map((s, i) => ({ ...s, id: `import-${Date.now()}-${i}` }))); this.persist(); this.dialog.close(); this.open(solutions[0].levelId);
      this.hooks.notify(`已导入 ${solutions.length} 个验证通过的回放。`);
    } catch (error) { this.hooks.notify(error instanceof Error ? error.message : '回放导入失败。'); }
  }

  private el<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id)! as T; }

  open(currentId: string): void {
    if (this.active) this.pause();
    const list = this.el('solutions-list'); list.replaceChildren();
    this.renderRecording();
    const available = [...this.personal, ...savedSolutions].filter(s => this.data.levels.some(l => l.id === s.levelId));
    this.el('solutions-count').textContent = `${available.length} 个已验证通关的解法`;
    let world = '';
    for (const solution of available) {
      const key = solution.label.split('-')[0];
      if (world !== key) { world = key; const title = document.createElement('h3'); title.textContent = `世界 ${key}`; list.append(title); }
      const button = document.createElement('button'); button.className = 'solution-entry'; button.dataset.solution = solution.levelId;
      button.setAttribute('aria-current', String(solution.levelId === currentId));
      const label = document.createElement('strong'); label.textContent = solution.label;
      const detail = document.createElement('span'); detail.textContent = `${solution.expected.moves} 步 · ${solution.expected.pushes} 次推动 · ${solutionStartId(solution) !== solution.levelId ? '跨场景路线' : solution.start ? '含起点存档' : '关内路线'}`;
      button.append(label, detail); button.onclick = () => { this.dialog.close(); void this.start(solution); };
      const row = document.createElement('div'); row.className = 'solution-library-row'; row.append(button); list.append(row);
      if (this.personal.includes(solution)) {
        const remove = document.createElement('button'); remove.textContent = '×'; remove.className = 'solution-remove'; remove.setAttribute('aria-label', `删除回放 ${solution.label}`);
        remove.onclick = () => { this.personal = this.personal.filter(s => s !== solution); this.persist(); this.dialog.close(); this.open(currentId); }; row.append(remove);
      }
    }
    this.dialog.showModal();
    list.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'center' });
  }

  private async start(solution: SavedSolution): Promise<void> {
    if (this.active) this.close();
    const replay = new SolutionReplay(this.data, solution); this.replay = replay; this.hooks.begin();
    this.bar.hidden = false; this.render();
    await this.show(true);
    if (this.replay === replay) void this.play();
  }

  private render(): void {
    const replay = this.replay; if (!replay) return;
    this.el('solution-title').textContent = `${replay.solution.label} · ${replay.solution.entryStep && replay.cursor < replay.solution.entryStep ? '入口准备' : '解法回放'}`;
    const operation = replay.operations[replay.cursor - 1];
    this.el('solution-position').textContent = `${replay.cursor} / ${replay.operations.length}${this.busy ? ' · 结算中' : replay.finished ? replay.passed ? ' · 已通关' : ' · 验证失败' : operation ? ` · ${operationLabel(operation)}${replay.accepted ? '' : ' · 被阻挡'}` : ' · 初始状态'}`;
    const source = this.el<HTMLAnchorElement>('solution-source'); source.hidden = !replay.solution.source; if (replay.solution.source) source.href = replay.solution.source;
    this.el('solution-play').textContent = this.playing ? '暂停' : replay.finished ? '重播' : '播放';
    this.el('solution-play').setAttribute('aria-pressed', String(this.playing));
    for (const id of ['solution-restart', 'solution-previous']) this.el<HTMLButtonElement>(id).disabled = this.busy || replay.cursor === 0;
    this.el<HTMLButtonElement>('solution-next').disabled = this.busy || replay.finished;
    const progress = this.el<HTMLInputElement>('solution-progress'); progress.max = String(replay.operations.length); progress.value = String(replay.cursor); progress.disabled = this.busy;
    const sequence = this.el('solution-actions'); sequence.replaceChildren();
    replay.operations.forEach((action, i) => {
      const step = document.createElement('button'); step.textContent = operationLabel(action); step.title = `第 ${i + 1} 次操作${action.target ? ` · ${action.target}` : ''}`;
      step.setAttribute('aria-label', step.title); step.setAttribute('aria-current', String(i === replay.cursor - 1)); step.disabled = this.busy;
      step.onclick = () => { this.pause(); void this.seek(i + 1); }; sequence.append(step);
    });
    sequence.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  private pause(): void { this.playing = false; this.generation++; this.render(); }

  private async show(snap: boolean): Promise<void> {
    const replay = this.replay; if (!replay) return;
    this.busy = true; this.render();
    try { await this.hooks.show(replay.simulation.session, snap); }
    finally { if (this.replay === replay) { this.busy = false; this.render(); } }
  }

  private async advance(): Promise<void> { if (this.replay?.advance()) await this.show(false); }
  private async seek(step: number): Promise<void> { this.replay?.seek(step); await this.show(true); }

  private async play(): Promise<void> {
    if (!this.replay || this.busy) return;
    if (this.replay.finished) await this.seek(0);
    if (!this.replay) return;
    this.playing = true; const token = ++this.generation; this.render();
    while (token === this.generation && this.replay && !this.replay.finished) {
      await this.advance();
      if (token !== this.generation || !this.replay) return;
      if (!this.replay.accepted || this.replay.finished) { this.pause(); return; }
      await new Promise(resolve => setTimeout(resolve, 220 / this.speed));
    }
  }

  close(): void {
    if (!this.active) return;
    this.pause(); this.hooks.cancelMotion(); this.replay = undefined; this.busy = false;
    this.bar.hidden = true; this.hooks.end();
  }

  private export(): void {
    if (!this.replay) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(solutionFile([this.replay.solution]), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `maxwell-solution-${this.replay.solution.label}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
