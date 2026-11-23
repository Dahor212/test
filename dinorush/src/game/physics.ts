import { GAME_CONFIG } from '../config/gameConfig';
import { TERRAINS } from '../config/terrain';
import type { GameDifficulty, ParticipantLoadout, Suitability, TerrainId } from '../types';

const C = GAME_CONFIG;

/** RPG speed bonus on suitable terrain (capped). */
export function rpgSpeedBonus(l: ParticipantLoadout): number {
  const r = C.rpg;
  const raw = l.stats.speed * r.speedPerPoint + Math.max(0, l.level - 1) * r.levelSpeedBonus;
  return Math.min(r.maxTotalBonus, raw);
}

/** Fraction by which a wrong-dino penalty is reduced (VÝDRŽ). */
export function staminaReduction(l: ParticipantLoadout): number {
  return Math.min(C.rpg.maxTotalBonus, l.stats.stamina * C.rpg.staminaPerPoint);
}

export function switchCooldown(l: ParticipantLoadout): number {
  return Math.max(0.2, C.switchCooldown - l.stats.transform * C.rpg.transformCooldownPerPoint);
}

export function perfectWindowBefore(l: ParticipantLoadout): number {
  return C.perfect.windowBefore + l.stats.transform * C.rpg.transformPerfectWindowPerPoint;
}

/**
 * Multiplier of the dino on terrain, including difficulty penalty scaling,
 * stamina reduction, speed stat and variant perks.
 */
export function terrainMultiplier(
  terrain: TerrainId,
  loadout: ParticipantLoadout,
  difficulty: GameDifficulty,
): { multiplier: number; suitability: Suitability } {
  const def = TERRAINS[terrain];
  const suitability = def.suitability[loadout.archetype];
  let m = C.suitabilityMultiplier[suitability];
  if (suitability === 'best') {
    m *= 1 + rpgSpeedBonus(loadout);
    const perk = loadout.perk;
    if (perk && perk.kind === 'terrainSpeed' && perk.terrains?.includes(terrain)) m *= 1 + perk.value;
  } else {
    const penalty = (1 - m) * difficulty.penaltyScale * (1 - staminaReduction(loadout));
    m = 1 - Math.min(0.8, penalty);
  }
  return { multiplier: m, suitability };
}

/** Exponential approach towards target speed (frame-rate independent). */
export function approachSpeed(current: number, target: number, dt: number): number {
  const rate = target > current ? C.accelRate : C.decelRate;
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}
