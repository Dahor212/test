import { ACCESSORY_BY_ID, DINO_BY_ID } from '../config/dinosaurs';
import { ECONOMY, EGG_SEQUENCE } from '../config/economy';
import type { EggReward, MissionDefinition, PlayerProfile } from '../types';
import { evaluateMissions } from './missions';
import { createDinoInstance } from './profile';

/** Next reward in the predictable sequence (skips things already owned). */
export function nextEggReward(profile: PlayerProfile): EggReward {
  for (let i = profile.eggs.opened; i < EGG_SEQUENCE.length; i++) {
    const r = EGG_SEQUENCE[i];
    if (r.kind === 'dino' && r.id && !profile.dinos[r.id] && DINO_BY_ID[r.id]) return r;
    if (r.kind === 'accessory' && r.id && !profile.accessories.includes(r.id) && ACCESSORY_BY_ID[r.id]) return r;
  }
  return { kind: 'coins', coins: ECONOMY.eggFallbackCoins };
}

export interface EggOpenResult {
  reward: EggReward;
  missions: MissionDefinition[];
}

/** Opens one pending egg. Mutates profile. Returns null when no egg is pending. */
export function openEgg(profile: PlayerProfile, now = Date.now()): EggOpenResult | null {
  if (profile.eggs.pending <= 0) return null;
  const reward = nextEggReward(profile);
  profile.eggs.pending--;
  profile.stats.eggsOpened++;
  if (reward.kind === 'dino' && reward.id) {
    profile.dinos[reward.id] = createDinoInstance(reward.id, now);
    profile.stats.dinosUnlocked++;
  } else if (reward.kind === 'accessory' && reward.id) {
    profile.accessories.push(reward.id);
  } else {
    profile.coins += reward.coins ?? 0;
    profile.totalCoinsEarned += reward.coins ?? 0;
  }
  // advance pointer past the reward we just gave
  const idx = EGG_SEQUENCE.findIndex((r, i) => i >= profile.eggs.opened && r.kind === reward.kind && r.id === reward.id);
  profile.eggs.opened = idx >= 0 ? idx + 1 : Math.max(profile.eggs.opened, EGG_SEQUENCE.length);
  const missions = evaluateMissions(profile, now);
  return { reward, missions };
}

export function equipAccessory(profile: PlayerProfile, defId: string, accessory: string | null): boolean {
  const inst = profile.dinos[defId];
  if (!inst) return false;
  if (accessory !== null && !profile.accessories.includes(accessory)) return false;
  inst.accessory = accessory;
  return true;
}
