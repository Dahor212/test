import { ARCHETYPES, DINO_BY_ID, STARTER_LINEUP } from '../config/dinosaurs';
import { LEVEL_THRESHOLDS, UPGRADE_COSTS, UPGRADE_LEVEL_REQ } from '../config/economy';
import { GAME_CONFIG } from '../config/gameConfig';
import type { Archetype, DinosaurInstance, Lineup, ParticipantLoadout, PlayerProfile, StatId } from '../types';
import { createDinoInstance } from './profile';

const R = GAME_CONFIG.rpg;

export function levelForXp(xp: number): number {
  let lvl = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) if (xp >= LEVEL_THRESHOLDS[i]) lvl = i + 1;
  return Math.min(R.maxLevel, lvl);
}

/** Progress (0..1) towards the next level and XP numbers. */
export function levelProgress(inst: DinosaurInstance): { level: number; current: number; needed: number; ratio: number; max: boolean } {
  const level = levelForXp(inst.xp);
  if (level >= R.maxLevel) return { level, current: 0, needed: 0, ratio: 1, max: true };
  const lo = LEVEL_THRESHOLDS[level - 1];
  const hi = LEVEL_THRESHOLDS[level];
  return { level, current: inst.xp - lo, needed: hi - lo, ratio: (inst.xp - lo) / (hi - lo), max: false };
}

/** Add XP; returns new level. */
export function addXp(inst: DinosaurInstance, xp: number): number {
  inst.xp = Math.max(0, Math.round(inst.xp + xp));
  inst.level = levelForXp(inst.xp);
  return inst.level;
}

export type UpgradeCheck =
  | { ok: true; cost: number; from: number; to: number }
  | { ok: false; reason: 'max' | 'level' | 'coins' | 'missing'; cost?: number; requiredLevel?: number; from?: number };

export function checkUpgrade(profile: PlayerProfile, defId: string, stat: StatId): UpgradeCheck {
  const inst = profile.dinos[defId];
  if (!inst) return { ok: false, reason: 'missing' };
  const from = inst.stats[stat];
  if (from >= R.maxStatPoints) return { ok: false, reason: 'max', from };
  const cost = UPGRADE_COSTS[from];
  const requiredLevel = UPGRADE_LEVEL_REQ[from];
  if (inst.level < requiredLevel) return { ok: false, reason: 'level', cost, requiredLevel, from };
  if (profile.coins < cost) return { ok: false, reason: 'coins', cost, requiredLevel, from };
  return { ok: true, cost, from, to: from + 1 };
}

/** Buys one upgrade tier. Mutates the profile. */
export function buyUpgrade(profile: PlayerProfile, defId: string, stat: StatId): UpgradeCheck {
  const check = checkUpgrade(profile, defId, stat);
  if (!check.ok) return check;
  profile.coins -= check.cost;
  profile.dinos[defId].stats[stat] = check.to;
  profile.stats.upgradesBought++;
  return check;
}

/** Human readable effect of `points` in a stat. */
export function statEffectText(stat: StatId, points: number): string {
  switch (stat) {
    case 'speed':
      return `+${(points * R.speedPerPoint * 100).toFixed(1)} % rychlost`;
    case 'transform':
      return `proměna ${(GAME_CONFIG.switchCooldown - points * R.transformCooldownPerPoint).toFixed(2)} s, okno +${(points * R.transformPerfectWindowPerPoint).toFixed(2)} s`;
    case 'stamina':
      return `-${(points * R.staminaPerPoint * 100).toFixed(1)} % zpomalení`;
  }
}

export function lineupIsValid(profile: PlayerProfile, lineup: Lineup): boolean {
  return ARCHETYPES.every((a) => {
    const id = lineup[a];
    return !!profile.dinos[id] && DINO_BY_ID[id]?.archetype === a;
  });
}

/** Repairs a lineup so it covers all four archetypes with owned dinos. */
export function repairLineup(profile: PlayerProfile, lineup: Partial<Lineup> | undefined): Lineup {
  const out = { ...STARTER_LINEUP };
  for (const a of ARCHETYPES) {
    const id = lineup?.[a];
    if (id && profile.dinos[id] && DINO_BY_ID[id]?.archetype === a) out[a] = id;
  }
  return out;
}

export function loadoutFor(profile: PlayerProfile, lineup: Lineup): Record<Archetype, ParticipantLoadout> {
  const res = {} as Record<Archetype, ParticipantLoadout>;
  const valid = repairLineup(profile, lineup);
  for (const a of ARCHETYPES) {
    const id = valid[a];
    const inst = profile.dinos[id] ?? createDinoInstance(id);
    const def = DINO_BY_ID[id];
    res[a] = {
      archetype: a,
      defId: id,
      stats: { ...inst.stats },
      level: inst.level,
      perk: def.perk,
      accessory: inst.accessory,
    };
  }
  return res;
}

export function baseLoadout(): Record<Archetype, ParticipantLoadout> {
  const res = {} as Record<Archetype, ParticipantLoadout>;
  for (const a of ARCHETYPES) {
    res[a] = { archetype: a, defId: STARTER_LINEUP[a], stats: { speed: 0, transform: 0, stamina: 0 }, level: 1, accessory: null };
  }
  return res;
}
