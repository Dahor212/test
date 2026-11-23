import { MISSIONS } from '../config/missions';
import type { MissionDefinition, PlayerProfile } from '../types';

export interface MissionStatus {
  def: MissionDefinition;
  progress: number;
  completed: boolean;
}

export function missionStatus(profile: PlayerProfile): MissionStatus[] {
  return MISSIONS.map((def) => {
    const completed = !!profile.missions[def.id]?.completed;
    const progress = Math.min(def.target, def.metric(profile.stats, profile));
    return { def, progress: completed ? def.target : progress, completed };
  });
}

/**
 * Checks all missions and grants rewards for newly completed ones.
 * Mutates the profile and returns the completed missions.
 */
export function evaluateMissions(profile: PlayerProfile, now = Date.now()): MissionDefinition[] {
  const done: MissionDefinition[] = [];
  // Loop because rewards could complete further missions in the future.
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const def of MISSIONS) {
      if (profile.missions[def.id]?.completed) continue;
      if (def.metric(profile.stats, profile) >= def.target) {
        profile.missions[def.id] = { completed: true, completedAt: now };
        profile.coins += def.reward.coins;
        profile.totalCoinsEarned += def.reward.coins;
        if (def.reward.eggs) profile.eggs.pending += def.reward.eggs;
        done.push(def);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return done;
}
