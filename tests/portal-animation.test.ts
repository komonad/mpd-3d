import test from 'node:test';
import assert from 'node:assert/strict';
import { portalEntryTargets, portalExitOrigins } from '../src/portal-animation';
import { createSession, enterPortal, exitLevel } from '../src/session';
import type { Dataset, Level } from '../src/types';

test('multiple demons approach their own entrance while bystanders stay still', () => {
  const properties = { fixed: true, storesHeat: true, temperature: 0 as const, edges: 0xaa };
  const parent: Level = { id: 'parent', width: 9, height: 9, label: 'parent', category: 'world', players: [{ x: 2, y: 3 }, { x: 6, y: 3 }, { x: 4, y: 6 }], goals: [], tail: [], cells: [3, 5].map(x => ({ x, y: 3, ...properties, portal: { target: 'child', shortcut: false, before: properties, after: properties } })) };
  const child: Level = { id: 'child', parentId: parent.id, width: 9, height: 9, label: 'child', category: 'main', players: [{ x: 4, y: 4 }], cells: [], goals: [], tail: [] };
  const data: Dataset = { version: 2, world: parent.id, levels: [parent, child], hints: {} };
  const session = createSession(parent), original = structuredClone(session);
  const targets = portalEntryTargets(data, session, child.id);
  assert.deepEqual(targets.map(({ x, y }) => ({ x, y })), [{ x: 3, y: 3 }, { x: 5, y: 3 }, { x: 4, y: 6 }]);
  assert.deepEqual(session, original);
  const entered = enterPortal(data, session, child.id)!;
  assert.ok(entered);
  const exited = exitLevel(data, entered)!;
  const beforeExit = structuredClone(entered), afterExit = structuredClone(exited);
  const origins = portalExitOrigins(entered, exited)!;
  const portal = exited.current.cells.find(cell => cell.key === entered.entries.child.portalKey)!;
  assert.equal(origins[0].x, 4); assert.equal(origins[0].y, 6);
  for (const origin of origins.slice(1)) assert.deepEqual({ x: origin.x, y: origin.y }, { x: portal.x, y: portal.y });
  assert.deepEqual(entered, beforeExit); assert.deepEqual(exited, afterExit);
});
