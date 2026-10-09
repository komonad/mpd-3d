import { bodies } from './engine';
import type { Cell, Piston, State, Temperature } from './types';

export interface InspectedItem {
  title: string; details: string; kind: 'block' | 'glass' | 'demon' | 'piston';
  temperature: Temperature; depth: number;
}
export interface Inspection {
  title: string; details: string;
  piston?: { state: string; direction: string; expanded: boolean };
  contents: InspectedItem[];
}

export const temperatureName = (temperature: Temperature): string => temperature === 1 ? '高温' : temperature === -1 ? '低温' : temperature === 2 ? '第4温度' : '常温';
export const pistonStateName = (piston: Piston): string => piston.expanded ? '展开' : '压缩';

export function inspectCell(state: State, key: number, labels: Map<string, string>): Inspection | undefined {
  const hovered = state.cells.find(c => c.key === key);
  if (!hovered) return;
  const pistons = new Map((state.pistons ?? []).map(p => [p.baseKey, p]));
  const cells = new Map(state.cells.map(c => [c.key, c]));
  let cell = cells.get(state.pistons?.find(p => p.expanded && p.headKey === hovered.key)?.baseKey ?? hovered.key)!;
  if (!pistons.has(cell.key)) {
    const parent = cell.container === undefined ? undefined : cells.get(cell.container);
    if (parent && pistons.has(parent.key)) cell = parent;
  }
  const fixedKeys = new Set(bodies(state.cells, state.pistons).filter(b => b.some(c => c.fixed)).flatMap(b => b.map(c => c.key)));
  const title = (c: Cell): string => {
    const p = pistons.get(c.key);
    return p ? `活塞 #${p.order}` : c.portal ? `关卡 ${labels.get(c.portal.target) ?? '入口'}` : c.storesHeat ? '方块' : '透明方块';
  };
  const details = (c: Cell): string => [temperatureName(c.temperature), fixedKeys.has(c.key) ? '固定' : '可推动',
    ...(!c.storesHeat ? ['透明 · 不储热'] : []),
    ...((c.heatCapacity ?? 1) > 1 ? [`热容量 ${c.heatCapacity}`] : []),
    ...([0, 1, 2, 3].some(d => ((c.edges >> (d * 2)) & 3) === 3) ? ['粘边'] : []),
    ...(pistons.has(c.key) ? [pistonStateName(pistons.get(c.key)!)] : [])].join(' · ');
  const contents: InspectedItem[] = [];
  const seen = new Set<number>();
  const visit = (parent: number, depth: number): void => {
    if (seen.has(parent)) return; seen.add(parent);
    for (const child of state.cells.filter(c => c.container === parent)) {
      contents.push({ title: title(child), details: details(child), temperature: child.temperature, depth,
        kind: pistons.has(child.key) ? 'piston' : child.storesHeat ? 'block' : 'glass' });
      visit(child.key, depth + 1);
    }
    for (const player of state.players.filter(p => p.container === parent)) {
      contents.push({ title: '麦妖', details: `${temperatureName(player.temperature)} · ${player.temperature === 1 ? '假死' : '导热 · 不储热'}`,
        temperature: player.temperature, depth, kind: 'demon' });
    }
  };
  const piston = pistons.get(cell.key);
  if (piston?.model === 'boundary') visit(cell.key, 0);
  return { title: title(cell), details: details(cell), contents,
    ...(piston ? { piston: { state: pistonStateName(piston), direction: ['向左', '向下', '向右', '向上'][piston.direction], expanded: piston.expanded } } : {}) };
}
