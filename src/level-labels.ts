import type { Cell, Level } from './types';

export function levelLabels(levels: Level[]): Map<string, { full: string; local: string }> {
  return new Map(levels.map(level => [level.id, {
    full: level.displayName ?? level.label,
    local: level.localName ?? level.label.split('-').at(-1)!.replace(/^0+(?=\d)/, ''),
  }]));
}

export function portalLabel(cell: Cell, labels: ReturnType<typeof levelLabels>): string {
  const name = cell.portal && labels.get(cell.portal.target);
  return name ? cell.portal!.shortcut ? name.full : name.local : '↗';
}
