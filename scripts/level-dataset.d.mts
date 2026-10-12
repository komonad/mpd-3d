import type { Dataset } from '../src/types';
export function importLevelDataset(readFile: (name: string, optional?: boolean) => Promise<Uint8Array | undefined>): Promise<Dataset>;
