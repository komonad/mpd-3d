import { portalPlayers } from './engine';
import { portalCandidates, type Session } from './session';
import type { Dataset, Point } from './types';

export function portalEntryTargets(data: Dataset, session: Session, target: string): Point[] {
  const portals = portalCandidates(data, session).filter(cell => cell.portal!.target === target);
  return session.current.players.map(player => portals.find(portal => portalPlayers(session.current, portal).includes(player)) ?? player);
}

export function portalExitOrigins(before: Session, after: Session): Point[] | undefined {
  const entry = before.entries[before.current.levelId];
  if (!entry || after.current.levelId !== entry.parentId) return;
  const portal = after.current.cells.find(cell => cell.key === entry.portalKey);
  if (!portal) return;
  const remaining = new Set(before.states[entry.parentId]?.players.map(player => player.key) ?? []);
  return after.current.players.map(player => remaining.has(player.key) ? player : portal);
}
