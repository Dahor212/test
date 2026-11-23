import { DECORATIONS } from '../config/economy';
import type { DecorationId, MissionDefinition, PlayerProfile } from '../types';
import { evaluateMissions } from './missions';

export type ParkResult = { ok: true; missions?: MissionDefinition[] } | { ok: false; reason: string };

export function buyDecoration(profile: PlayerProfile, id: DecorationId): ParkResult {
  const def = DECORATIONS[id];
  if (!def) return { ok: false, reason: 'unknown' };
  if (profile.coins < def.price) return { ok: false, reason: 'coins' };
  profile.coins -= def.price;
  profile.park.inventory[id] = (profile.park.inventory[id] ?? 0) + 1;
  return { ok: true };
}

export function placeDecoration(profile: PlayerProfile, cell: number, id: DecorationId): ParkResult {
  const park = profile.park;
  if (cell < 0 || cell >= park.cells.length) return { ok: false, reason: 'cell' };
  if (park.cells[cell]) return { ok: false, reason: 'occupied' };
  if ((park.inventory[id] ?? 0) <= 0) return { ok: false, reason: 'inventory' };
  park.inventory[id] = (park.inventory[id] ?? 0) - 1;
  park.cells[cell] = id;
  profile.stats.decorationsPlaced++;
  return { ok: true, missions: evaluateMissions(profile) };
}

export function removeDecoration(profile: PlayerProfile, cell: number): ParkResult {
  const park = profile.park;
  const id = park.cells[cell];
  if (!id) return { ok: false, reason: 'empty' };
  park.cells[cell] = null;
  park.inventory[id] = (park.inventory[id] ?? 0) + 1;
  return { ok: true };
}

export function moveDecoration(profile: PlayerProfile, from: number, to: number): ParkResult {
  const park = profile.park;
  if (from === to) return { ok: true };
  if (to < 0 || to >= park.cells.length || !park.cells[from]) return { ok: false, reason: 'cell' };
  const tmp = park.cells[to];
  park.cells[to] = park.cells[from];
  park.cells[from] = tmp;
  return { ok: true };
}
