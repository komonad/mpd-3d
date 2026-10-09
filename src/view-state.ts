import { Vector3 } from 'three';
import type { Level, Point } from './types';

export function spawnPoints(level: Pick<Level, 'width' | 'height' | 'players'>): Point[] {
  const points = new Map<string, Point>();
  for (const { x, y } of level.players) {
    if (x >= 0 && y >= 0 && x < level.width && y < level.height) points.set(`${x},${y}`, { x, y });
  }
  return [...points.values()];
}

export function followFocus(positions: readonly Vector3[]): Vector3 {
  if (!positions.length) return new Vector3(0, 0.615, 0);
  const x = positions.map(p => p.x), z = positions.map(p => p.z);
  return new Vector3((Math.min(...x) + Math.max(...x)) / 2, 0.615, (Math.min(...z) + Math.max(...z)) / 2);
}

export function cameraHalfHeight(width: number, height: number, aspect: number, tilt: number, yaw: number): number {
  const w = Math.min(width, 16), h = Math.min(height, 12);
  const projectedWidth = w * Math.abs(Math.cos(yaw)) + h * Math.abs(Math.sin(yaw));
  const projectedHeight = (w * Math.abs(Math.sin(yaw)) + h * Math.abs(Math.cos(yaw))) * Math.cos(tilt);
  return Math.max(projectedHeight + 2.3, (projectedWidth + 3) / aspect) / 2;
}

export function orthographicDepth(width: number, height: number, exteriorExtent: number): { distance: number; near: number; far: number } {
  const radius = Math.hypot(exteriorExtent + width, exteriorExtent + height) + 8;
  return { distance: radius + 16, near: 8, far: radius * 2 + 32 };
}

export function motionSettled(elapsed: number, distances: readonly number[]): boolean {
  return elapsed >= 110 && distances.every(distance => distance <= 0.001);
}

export function demonStatus(active: number, total: number, activity: string, moving: boolean, thinking: boolean, cycling: boolean): string {
  const status = activity === 'resolving' ? '热量结算中' : thinking ? '思考' : !active ? '假死' : cycling ? '热量循环' : moving && activity === 'pushing' ? '推动' : moving ? '移动' : '待机';
  return total > 1 ? `${status} · ${active}/${total} 可行动` : status;
}
