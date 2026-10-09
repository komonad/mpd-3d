import type { Cell, Point } from './types';

export function pickBodyCell(cells: Cell[], point: Point, labelKey?: number): Cell | undefined {
  if (labelKey !== undefined) return cells.find(cell => cell.key === labelKey);
  const containing = cells.find(cell => Math.abs(cell.x - point.x) <= 0.5 && Math.abs(cell.y - point.y) <= 0.5);
  const closest = containing ?? cells.reduce<Cell | undefined>((closest, cell) => !closest ||
    Math.hypot(cell.x - point.x, cell.y - point.y) < Math.hypot(closest.x - point.x, closest.y - point.y) ? cell : closest, undefined);
  return closest && Math.abs(closest.x - point.x) <= 0.62 && Math.abs(closest.y - point.y) <= 0.62 ? closest : undefined;
}
