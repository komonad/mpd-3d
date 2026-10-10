import catalogue from './solutions.json';
import { parseOperations, Simulation, type Operation } from './editor-model';
import type { Dataset } from './types';

export interface SavedSolution {
  levelId: string;
  label: string;
  actions: string;
  origin: 'search' | 'video';
  source?: string;
  expected: { moves: number; pushes: number };
}

export const savedSolutions = catalogue.solutions as SavedSolution[];

export const operationLabel = (operation: Operation): string => ({
  L: '←', D: '↓', R: '→', U: '↑', RESET: '重置', UNDO: '撤销', REDO: '重做', ENTER: '进入', EXIT: '退出', HINT: '提示',
})[operation.command];

export class SolutionReplay {
  simulation: Simulation;
  readonly operations: Operation[];
  cursor = 0;
  accepted = true;

  constructor(readonly data: Dataset, readonly solution: SavedSolution) {
    this.operations = parseOperations(solution.actions);
    this.simulation = this.createSimulation();
  }

  private createSimulation(): Simulation {
    const level = this.data.levels.find(l => l.id === this.solution.levelId);
    if (!level) throw new Error('解法对应的关卡数据未载入。');
    return new Simulation(this.data, level);
  }

  get finished(): boolean { return this.cursor === this.operations.length; }
  get passed(): boolean {
    const state = this.simulation.session.current;
    return this.finished && state.solved && state.moves === this.solution.expected.moves && state.pushes === this.solution.expected.pushes;
  }

  advance(): Operation | undefined {
    const operation = this.operations[this.cursor];
    if (!operation) return;
    this.accepted = this.simulation.apply(operation.command, operation.target);
    this.cursor++;
    return operation;
  }

  seek(step: number): void {
    if (!Number.isInteger(step) || step < 0 || step > this.operations.length) throw new Error('回放步数超出范围。');
    this.simulation = this.createSimulation(); this.cursor = 0; this.accepted = true;
    while (this.cursor < step) this.advance();
  }
}
