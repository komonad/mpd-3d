import { blankLevel, parseProject, type EditorProject } from './editor-model';
import type { Level, Point } from './types';

export function projectRooms(project: EditorProject): { level: Level; depth: number }[] {
  const ids = new Set(project.levels.map(l => l.id)), rows: { level: Level; depth: number }[] = [];
  const visit = (level: Level, depth: number) => { rows.push({ level, depth }); project.levels.filter(l => l.parentId === level.id).forEach(l => visit(l, depth + 1)); };
  project.levels.filter(l => !l.parentId || !ids.has(l.parentId)).forEach(l => visit(l, 0));
  return rows;
}

export function createChild(project: EditorProject, point?: Point): Level {
  if (project.levels.length >= 128) throw new Error('项目最多包含 128 个关卡。');
  const parent = project.levels.find(l => l.id === project.currentId)!;
  const free = (p: Point) => p.x > 0 && p.y > 0 && p.x < parent.width - 1 && p.y < parent.height - 1 && ![...parent.cells, ...parent.players].some(c => c.container === undefined && c.x === p.x && c.y === p.y);
  let entrance = point && free(point) ? point : undefined;
  for (let y = 1; !entrance && y < parent.height - 1; y++) for (let x = 1; !entrance && x < parent.width - 1; x++) if (free({ x, y })) entrance = { x, y };
  if (!entrance) throw new Error('父关卡没有放置入口的空格。');
  let index = 1; while (project.levels.some(l => l.id === `${parent.id}-room-${index}`)) index++;
  const child = blankLevel(`${parent.id}-room-${index}`); child.title = `子关卡 ${index}`; child.label = String(index); child.parentId = parent.id;
  const before = { fixed: true, storesHeat: true, temperature: 0 as const, edges: 0xaa };
  parent.cells.push({ ...entrance, ...before, portal: { target: child.id, shortcut: false, before: { ...before }, after: { ...before, fixed: false, edges: 0x55 } } });
  project.levels.push(child); project.rootId ??= parent.id; project.currentId = child.id;
  return child;
}

export function setParent(project: EditorProject, id: string, parentId?: string): void {
  const copy = structuredClone(project), level = copy.levels.find(l => l.id === id)!;
  level.parentId = parentId; parseProject(JSON.stringify(copy));
  project.levels.find(l => l.id === id)!.parentId = parentId;
}

export function removeRoom(project: EditorProject, id: string): void {
  project.levels = project.levels.filter(l => l.id !== id);
  for (const room of project.levels) {
    if (room.parentId === id) delete room.parentId;
    if (room.hintId === id) delete room.hintId;
    for (const cell of room.cells) if (cell.portal?.target === id) delete cell.portal;
  }
  project.scenarios = project.scenarios.filter(s => s.levelId !== id);
  for (const progress of [project.progress, ...project.scenarios.map(s => s.progress)]) if (progress) {
    progress.solved = progress.solved?.filter(v => v !== id); progress.visited = progress.visited?.filter(v => v !== id);
  }
  if (!project.levels.length) project.levels.push(blankLevel());
  project.currentId = project.levels[0].id;
  if (project.rootId === id) project.rootId = project.currentId;
}

export function arrangeEditor(panel: HTMLElement): void {
  const elements = new Map(Array.from(panel.querySelectorAll<HTMLElement>('[id]')).map(e => [e.id, e]));
  const element = (id: string) => elements.get(id)!;
  const properties = panel.querySelector<HTMLElement>('.editor-properties')!;
  const sections = ['project', 'scene', 'tests', 'data'];
  const tabs = document.createElement('nav'); tabs.className = 'editor-tabs'; tabs.setAttribute('aria-label', '编辑器工作区');
  tabs.innerHTML = sections.map((id, i) => `<button data-editor-tab="${id}" aria-pressed="${i === 1}">${['项目', '场景', '测试', '数据'][i]}</button>`).join('');
  const panes = new Map(sections.map(id => { const pane = document.createElement('section'); pane.dataset.editorPane = id; pane.hidden = id !== 'scene'; return [id, pane]; }));
  const project = panes.get('project')!;
  project.append(element('editor-new').parentElement!, element('editor-room').parentElement!, element('editor-remove-room'), element('editor-library').closest('details')!);
  project.insertAdjacentHTML('afterbegin', '<h2>关卡层级</h2><p class="editor-caption">子关卡拥有独立布局。主入口连接父关卡；副入口可以指向任意场景。</p><div id="editor-tree"></div><div class="editor-row"><button id="editor-child">新建子关卡与入口</button><button id="editor-root-play">从项目起点测试</button></div>');
  project.insertAdjacentHTML('beforeend', '<label>项目测试起点<select id="editor-root"></select></label><label>所属父关卡<select id="editor-parent"></select></label><label>提示关卡<select id="editor-hint"></select></label><h2>初始进度</h2><p class="editor-caption">每行一个关卡 ID。已通关控制入口完成后的属性，已抵达控制副入口是否可进入。保存用例时同时保存这组进度。</p><div class="editor-row"><label>已通关<textarea id="editor-solved" rows="4" spellcheck="false"></textarea></label><label>已抵达<textarea id="editor-visited" rows="4" spellcheck="false"></textarea></label></div><button id="editor-progress-apply">应用初始进度</button>');
  const scene = panes.get('scene')!;
  scene.append(element('editor-layout'), element('editor-play-controls'));
  const layout = element('editor-layout'), inspector = document.createElement('div'); inspector.className = 'editor-inspector';
  inspector.append(element('editor-selection'), element('editor-object').parentElement!, properties, element('editor-edit-undo'));
  const canvas = document.createElement('div'); canvas.className = 'editor-canvas';
  while (layout.firstChild) canvas.append(layout.firstChild);
  layout.append(canvas, inspector);
  properties.insertAdjacentHTML('afterbegin', '<label>属性阶段<select id="editor-property-phase"><option value="before">初始／解锁前</option><option value="after">目标关卡完成后</option><option value="head">活塞伸出部分</option></select></label><p class="editor-caption" id="editor-property-caption">选择入口可分别配置完成前后的材质、温度与边。</p><button id="editor-copy-before">将初始属性复制到完成后</button>');
  element('editor-direction').parentElement!.parentElement!.insertAdjacentHTML('beforebegin', '<label class="editor-check"><input id="editor-is-piston" type="checkbox"/>包含活塞</label><label class="editor-check"><input id="editor-is-portal" type="checkbox"/>关卡入口</label>');
  const tests = panes.get('tests')!; tests.append(panel.querySelector('.editor-tests')!);
  tests.insertAdjacentHTML('afterbegin', '<h2>独立机制场景</h2><p class="editor-caption">测试场景与游戏进度相互独立。加载用例后，可以编辑、单步执行或检查全部用例。</p>');
  const data = panes.get('data')!; data.append(element('editor-timeline').closest('details')!, element('editor-json').closest('details')!);
  data.querySelectorAll('details').forEach(d => d.open = true);
  panel.querySelector('.editor-intro')!.remove();
  element('editor-edit').textContent = '停止测试 · 编辑';
  panel.querySelector('.editor-heading')!.after(panel.querySelector('.editor-mode')!, tabs);
  for (const pane of panes.values()) panel.insertBefore(pane, element('editor-errors'));
  const chrome = document.createElement('div'); chrome.className = 'editor-chrome';
  chrome.append(panel.querySelector('.editor-heading')!, panel.querySelector('.editor-mode')!, tabs); panel.prepend(chrome);
  tabs.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.onclick = () => {
    tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    panes.forEach((pane, id) => pane.hidden = id !== button.dataset.editorTab);
  });
}
