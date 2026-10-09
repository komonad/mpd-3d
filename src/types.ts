export type Temperature = -1 | 0 | 1 | 2;
export interface Point { x: number; y: number }
export interface BlockProperties { fixed: boolean; storesHeat: boolean; temperature: Temperature; edges: number }
export interface Cell extends Point, BlockProperties {
  key: number;
  container?: number;
  portal?: { target: string; shortcut: boolean; before: BlockProperties; after: BlockProperties };
}
export interface Piston {
  baseKey: number; headKey: number; direction: Direction; expanded: boolean; order: number;
  head: BlockProperties;
  model?: 'boundary';
}
export interface Demon extends Point { temperature: Temperature; key?: string; container?: number; awake?: boolean }
export interface TurnFrame { cells: Cell[]; players: Demon[]; pistons: Piston[]; phase: 'motion' | 'heat' }
export interface Level {
  id: string; width: number; height: number; label: string;
  displayName?: string; localName?: string;
  category: 'main' | 'extra' | 'world' | 'hint' | 'lab';
  cells: Omit<Cell, 'key'>[]; players: (Point & { temperature?: Temperature; container?: number })[]; goals: Point[]; hintId?: string; tail: number[];
  title?: string; description?: string; pistons?: Piston[];
  worldId?: string; parentId?: string;
  notes?: (Point & { text: string })[];
}
export interface State {
  levelId: string; cells: Cell[]; players: Demon[];
  moves: number; pushes: number; outside: Temperature; solved: boolean; frozen: boolean;
  pistons?: Piston[]; phase?: 'ready' | 'cycling'; turnFrames?: TurnFrame[];
  transient?: boolean;
}
export interface World { id: string; index: number; title: string; description: string; supported: boolean }
export interface Dataset { version: number; world: string; worlds?: World[]; levels: Level[]; hints: Record<string, string> }
export type Direction = 0 | 1 | 2 | 3;
