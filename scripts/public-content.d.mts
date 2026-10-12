import type { Dataset } from '../src/types';
import type { SavedSolution } from '../src/solutions';
export function publicDataset(source: Dataset): Dataset;
export function publicSolutions(catalogue: { version: number; solutions: SavedSolution[] }, data: Dataset): { version: number; solutions: SavedSolution[] };
