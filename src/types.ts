export type Temperature = -1 | 0 | 1 | 2;
export interface Point { x: number; y: number }
export interface BlockProperties { fixed: boolean; storesHeat: boolean; temperature: Temperature; edges: number }
export interface Cell extends Point, BlockProperties {
  key: number;
  portal?: { target: string; shortcut: boolean; before: BlockProperties; after: BlockProperties };
}
export interface Level {
  id: string; width: number; height: number; label: string;
  category: 'main' | 'extra' | 'world' | 'hint';
  cells: Omit<Cell, 'key'>[]; players: Point[]; goals: Point[]; hintId?: string; tail: number[];
  notes?: (Point & { text: string })[];
}
export interface State {
  levelId: string; cells: Cell[]; players: (Point & { temperature: Temperature })[];
  moves: number; pushes: number; outside: Temperature; solved: boolean; frozen: boolean;
}
export interface Dataset { version: number; world: string; levels: Level[]; hints: Record<string, string> }
export type Direction = 0 | 1 | 2 | 3;
