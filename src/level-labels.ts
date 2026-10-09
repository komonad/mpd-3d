import type { Cell, Level } from './types';

export function levelIdentifier(level: Level): string { return level.displayName ?? level.label; }

export function compareLevels(a: Level, b: Level): number {
  return a.order !== undefined && b.order !== undefined ? a.order - b.order : levelIdentifier(a).localeCompare(levelIdentifier(b), undefined, { numeric: true });
}

export function levelLabels(levels: Level[]): Map<string, { full: string; local: string }> {
  return new Map(levels.map(level => [level.id, {
    full: levelIdentifier(level),
    local: level.localName ?? level.label.split('-').at(-1)!.replace(/^0+(?=\d)/, ''),
  }]));
}

export function portalLabel(cell: Cell, labels: ReturnType<typeof levelLabels>): string {
  const name = cell.portal && labels.get(cell.portal.target);
  return name ? cell.portal!.shortcut ? name.full : name.local : '↗';
}
