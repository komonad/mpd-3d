import { bodies } from './engine';
import type { Cell, Point } from './types';

export function motionBodies(cells: Cell[], rendered: ReadonlyMap<number, Point>): { groups: Cell[][]; merging: boolean } {
  const final = bodies(cells), groups: Cell[][] = [];
  for (const body of final) {
    const offsets = new Map<string, Cell[]>();
    for (const cell of body) {
      const position = rendered.get(cell.key) ?? cell;
      const offset = [position.x - cell.x, position.y - cell.y].map(value => Math.abs(value) <= 0.001 ? 0 : Math.round(value * 10000));
      const key = offset.join(','), partition = offsets.get(key) ?? [];
      partition.push(cell); offsets.set(key, partition);
    }
    if (offsets.size === 1) groups.push(body);
    else for (const partition of offsets.values()) groups.push(...bodies(partition));
  }
  return { groups: groups.map(body => body.sort((a, b) => a.key - b.key)), merging: groups.length > final.length };
}
