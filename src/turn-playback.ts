import type { TurnFrame } from './types';

export function turnPlayback(frames: readonly TurnFrame[]): { frame: TurnFrame; at: number }[] {
  if (!frames.length) return [];
  const count = Math.min(frames.length, 6), duration = Math.min(140, 80 + Math.max(0, frames.length - 2) * 12);
  return Array.from({ length: count }, (_, i) => ({
    frame: frames[Math.round(i * (frames.length - 1) / Math.max(1, count - 1))],
    at: i * duration / Math.max(1, count - 1),
  }));
}
