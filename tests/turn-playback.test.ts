import { test } from 'node:test';
import assert from 'node:assert/strict';
import { turnPlayback } from '../src/turn-playback';
import type { TurnFrame } from '../src/types';

test('long actuator chains keep their final state within a bounded presentation time', () => {
  const frames: TurnFrame[] = Array.from({ length: 256 }, (_, i) => ({ cells: [], players: [{ x: i, y: 0, temperature: 0 }], pistons: [], phase: i % 2 ? 'heat' : 'motion' }));
  const playback = turnPlayback(frames);
  assert.equal(playback[0].frame, frames[0]); assert.equal(playback.at(-1)!.frame, frames.at(-1));
  assert.ok(playback.length <= 6); assert.ok(playback.at(-1)!.at <= 140);
  assert.equal(frames.length, 256);
  assert.ok(playback.every((step, i) => !i || step.at > playback[i - 1].at));
});

test('short turns preserve motion and heat order', () => {
  const frames: TurnFrame[] = ['motion', 'heat', 'motion', 'heat'].map(phase => ({ cells: [], players: [], pistons: [], phase: phase as TurnFrame['phase'] }));
  assert.deepEqual(turnPlayback(frames).map(step => step.frame), frames);
  assert.deepEqual(turnPlayback([]), []);
});
