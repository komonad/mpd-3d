import { operationLabel, savedSolutions, SolutionReplay, type SavedSolution } from './solutions';
import type { Dataset } from './types';
import type { Session } from './session';
import './solutions.css';

interface ReplayHooks {
  begin(): void;
  show(session: Session, snap: boolean): Promise<void>;
  end(): void;
  cancelMotion(): void;
}

export class SolutionPanel {
  private replay?: SolutionReplay;
  private generation = 0;
  private playing = false;
  private busy = false;
  private speed = 1;
  private dialog = document.createElement('dialog');
  private bar = document.createElement('section');

  get active(): boolean { return !!this.replay; }

  constructor(readonly data: Dataset, private hooks: ReplayHooks) {
    this.dialog.id = 'solutions-dialog'; this.dialog.className = 'solutions-dialog';
    this.dialog.setAttribute('aria-label', '已保存的解法');
    this.dialog.innerHTML = `<div class="solution-heading"><h2>已保存的解法</h2><button id="solutions-close" aria-label="关闭解法列表">×</button></div><p id="solutions-count"></p><div id="solutions-list"></div><p class="solution-note">回放独立运行，退出后恢复当前游玩进度。</p>`;
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
    this.el<HTMLSelectElement>('solution-speed').onchange = event => { this.speed = Number((event.target as HTMLSelectElement).value); };
    this.el<HTMLInputElement>('solution-progress').onchange = event => {
      const step = Number((event.target as HTMLInputElement).value);
      this.pause(); if (!this.busy) void this.seek(step);
    };
  }

  private el<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id)! as T; }

  open(currentId: string): void {
    if (this.active) this.pause();
    const list = this.el('solutions-list'); list.replaceChildren();
    const available = savedSolutions.filter(s => this.data.levels.some(l => l.id === s.levelId));
    this.el('solutions-count').textContent = `${available.length} 个已验证通关的解法`;
    let world = '';
    for (const solution of available) {
      const key = solution.label.split('-')[0];
      if (world !== key) { world = key; const title = document.createElement('h3'); title.textContent = `世界 ${key}`; list.append(title); }
      const button = document.createElement('button'); button.className = 'solution-entry'; button.dataset.solution = solution.levelId;
      button.setAttribute('aria-current', String(solution.levelId === currentId));
      const label = document.createElement('strong'); label.textContent = solution.label;
      const detail = document.createElement('span'); detail.textContent = `${solution.expected.moves} 步 · ${solution.expected.pushes} 次推动 · ${solution.origin === 'video' ? '视频路线' : '求解路线'}`;
      button.append(label, detail); button.onclick = () => { this.dialog.close(); void this.start(solution); }; list.append(button);
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
    this.el('solution-title').textContent = `${replay.solution.label} · 解法回放`;
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
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, solutions: [this.replay.solution] }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `maxwell-solution-${this.replay.solution.label}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
