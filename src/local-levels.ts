import { importLevelDataset } from '../scripts/level-dataset.mjs';
import type { Dataset } from './types';
import './local-levels.css';

const databaseName = 'maxwell3d-local-levels';
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('catalogue');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('浏览器无法打开本机关卡存储。'));
  });
}
async function catalogue(action: 'read' | 'write' | 'delete', value?: Dataset): Promise<Dataset | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('catalogue', action === 'read' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('catalogue');
      const request = action === 'read' ? store.get('imported') : action === 'write' ? store.put(value, 'imported') : store.delete('imported');
      transaction.oncomplete = () => resolve(action === 'read' ? request.result : undefined);
      transaction.onerror = transaction.onabort = () => reject(new Error('无法保存关卡。请检查浏览器存储权限与可用空间。'));
    });
  } finally { db.close(); }
}
export const readLocalLevels = () => catalogue('read');

export async function importFolder(files: Iterable<File>): Promise<Dataset> {
  const entries = new Map<string, File>();
  for (const file of files) {
    const path = file.webkitRelativePath.replaceAll('\\', '/');
    const match = path.match(/(?:^|\/)(world\/[^/]+\.(?:mxw|json)|languages\/(?:zh-CN|en)\.json)$/);
    const name = match?.[1] ?? (path.endsWith('/structure.json') ? 'world/structure.json' : path.match(/\/([^/]+\.mxw)$/) ? `world/${file.name}` : undefined);
    if (!name) continue;
    if (entries.has(name)) throw new Error('选取的目录包含多份关卡，请只选择一份游戏安装目录。');
    entries.set(name, file);
  }
  if (!entries.has('world/structure.json')) throw new Error('找不到 world/structure.json。请选择原作安装目录或其中的 world 文件夹。');
  if (entries.size > 20000 || [...entries.values()].reduce((sum, file) => sum + file.size, 0) > 100_000_000) throw new Error('关卡文件数量或大小超出限制。');
  const data = await importLevelDataset(async (name, optional) => {
    const file = entries.get(name);
    if (!file) { if (optional) return undefined; throw new Error(`缺少 ${name}。请完整选取 world 文件夹。`); }
    return new Uint8Array(await file.arrayBuffer());
  });
  if (!data.levels.length || new Set(data.levels.map(level => level.id)).size !== data.levels.length) throw new Error('关卡目录为空或包含重复编号。');
  return data;
}

export function installLocalImport(): { update(data: Dataset, local: boolean): void } {
  const dialog = document.createElement('dialog');
  dialog.className = 'local-levels-dialog'; dialog.setAttribute('aria-label', '导入原作关卡');
  dialog.innerHTML = `<div class="local-levels-heading"><h2>导入原作关卡</h2><button aria-label="关闭导入教程">×</button></div>
    <p>从自己合法取得的游戏安装目录读取关卡。文件仅在本机浏览器处理，不会上传到服务器。</p>
    <ol><li>在 Steam 库中右键 Maxwell’s puzzling demon，选择「管理 → 浏览本地文件」。</li>
    <li>点击下面的「选择游戏文件夹」，选取刚打开的安装目录。默认位置：<code>C:\\Program Files (x86)\\Steam\\steamapps\\common\\Maxwell's puzzling demon</code>。</li>
    <li>所选目录应包含 <code>world/structure.json</code>、<code>world/*.mxw</code> 和 <code>languages/zh-CN.json</code>。也可单独选择 <code>world</code> 文件夹，但缺少语言文件时无法显示提示文字。</li>
    <li>导入成功后页面重新加载，从本地目录读取完整世界。之后无需重复选择；清除浏览器网站数据会移除导入内容。</li></ol>
    <p>浏览器可能将文件夹选择称为“上传”；此页面只读取关卡和提示文件，不发送它们。关卡内容以所选版本为准；免费 Demo 的目录只能导入其自身包含的关卡。</p>
    <p>请购买并支持原作。拥有游戏或免费试玩不等于获得关卡再分发许可，请勿分享导出的原作关卡文件。</p>
    <div class="local-levels-actions"><button id="choose-level-folder">选择游戏文件夹</button><button id="remove-local-levels" hidden>移除本地导入，恢复公开内容</button></div>
    <input id="local-level-folder" type="file" webkitdirectory multiple hidden><p id="local-level-status" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);
  const button = document.querySelector<HTMLButtonElement>('#local-levels-button')!;
  button.onclick = () => dialog.showModal();
  dialog.querySelector<HTMLButtonElement>('[aria-label="关闭导入教程"]')!.onclick = () => dialog.close();
  const input = dialog.querySelector<HTMLInputElement>('#local-level-folder')!;
  const choose = dialog.querySelector<HTMLButtonElement>('#choose-level-folder')!;
  const remove = dialog.querySelector<HTMLButtonElement>('#remove-local-levels')!;
  const status = dialog.querySelector<HTMLElement>('#local-level-status')!;
  choose.onclick = () => input.click();
  input.onchange = async () => {
    if (!input.files?.length) return;
    choose.disabled = remove.disabled = true; status.textContent = '正在本机读取和检查关卡…';
    try {
      const data = await importFolder(Array.from(input.files));
      await catalogue('write', data);
      status.textContent = `已保存 ${data.levels.length} 个场景，正在重新加载…`;
      location.reload();
    } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
    finally { input.value = ''; choose.disabled = remove.disabled = false; }
  };
  remove.onclick = async () => {
    choose.disabled = remove.disabled = true;
    try { await catalogue('delete'); location.reload(); }
    catch (error) { status.textContent = String(error); choose.disabled = remove.disabled = false; }
  };
  return { update(data, local) {
    remove.hidden = !local;
    document.querySelector('#content-scope')!.textContent = local ? '本机导入 · 完整目录' : data.edition === 'preview' ? '公开体验 · w1–w2' : '本机开发目录';
    status.textContent = local ? `已在此浏览器保存 ${data.levels.length} 个场景。移除导入内容不会删除游戏进度或个人回放。` : '';
  } };
}
