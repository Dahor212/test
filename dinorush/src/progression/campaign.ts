import { CAMPAIGN_LEVELS, CAMPAIGN_REWARDS, LEVEL_BY_ID, LEVELS_PER_WORLD, BOSS_NAMES } from '../config/campaign';
import { DIFFICULTIES } from '../config/difficulty';
import type {
  AIProfileId,
  CampaignLevel,
  DifficultyId,
  GameModeId,
  ParticipantResult,
  PlayerProfile,
  RaceConfig,
  StarGoal,
  WorldId,
} from '../types';

/** Which star goals a racer met. Goal 0 is the pass condition. */
export function goalsMet(goals: readonly StarGoal[], r: ParticipantResult, mode: GameModeId): boolean[] {
  const finished = r.finishTime !== null && !(mode === 'trex' && r.caught);
  return goals.map((g) => {
    switch (g.kind) {
      case 'place':
        return finished && r.place <= g.value;
      case 'escape':
        return finished && !r.caught;
      case 'lead':
        return finished && !r.caught && r.score >= g.value;
      case 'perfects':
        return r.perfects >= g.value;
      case 'combo':
        return r.maxCombo >= g.value;
      case 'smash':
        return r.smashed >= g.value;
      case 'mistakes':
        return finished && r.mistakes <= g.value;
    }
  });
}

/** 0 stars when the pass goal failed, else one star per met goal. */
export function starsFromGoals(met: boolean[]): number {
  if (!met[0]) return 0;
  return met.filter(Boolean).length;
}

export function levelStars(profile: PlayerProfile, levelId: string): number {
  return profile.campaign.stars[levelId] ?? 0;
}

export function totalStars(profile: PlayerProfile): number {
  return CAMPAIGN_LEVELS.reduce((a, l) => a + levelStars(profile, l.id), 0);
}

export const MAX_STARS = CAMPAIGN_LEVELS.length * 3;

/** Level n is open when the level before it has at least one star. */
export function isUnlocked(profile: PlayerProfile, level: CampaignLevel): boolean {
  if (level.number === 1) return true;
  const prev = CAMPAIGN_LEVELS[level.number - 2];
  return levelStars(profile, prev.id) > 0;
}

export function isWorldUnlocked(profile: PlayerProfile, world: WorldId): boolean {
  const first = CAMPAIGN_LEVELS.find((l) => l.world === world && l.index === 0)!;
  return isUnlocked(profile, first);
}

/** The level to play next: first open level without a star (or the last level). */
export function currentLevel(profile: PlayerProfile): CampaignLevel {
  for (const l of CAMPAIGN_LEVELS) {
    if (!isUnlocked(profile, l)) break;
    if (levelStars(profile, l.id) === 0) return l;
  }
  const open = CAMPAIGN_LEVELS.filter((l) => isUnlocked(profile, l));
  return open[open.length - 1] ?? CAMPAIGN_LEVELS[0];
}

export function nextLevel(level: CampaignLevel): CampaignLevel | null {
  return CAMPAIGN_LEVELS[level.number] ?? null;
}

/** AI strength of a level relative to the chosen difficulty. */
export function levelAiProfiles(level: CampaignLevel, difficulty: DifficultyId): AIProfileId[] {
  const base = DIFFICULTIES[difficulty].aiProfiles;
  const up: Record<AIProfileId, AIProfileId> = { rookie: 'beginner', beginner: 'advanced', advanced: 'champion', champion: 'champion' };
  if (level.ai === 'easy') return base.map((p) => (p === 'champion' ? 'beginner' : 'rookie'));
  if (level.ai === 'hard') return base.map((p, i) => (i % 2 === 0 ? up[p] : p));
  return [...base];
}

/** Track length for the chosen difficulty (levels are designed for 'racer'). */
export function levelLength(level: CampaignLevel, difficulty: DifficultyId): number {
  return Math.round((level.length * DIFFICULTIES[difficulty].trackLength) / DIFFICULTIES.racer.trackLength);
}

export function levelRaceConfig(level: CampaignLevel, difficulty: DifficultyId): RaceConfig {
  return {
    mode: level.mode,
    difficulty,
    worldId: level.world,
    seed: level.seed,
    normalizeStats: false,
    trackLengthOverride: levelLength(level, difficulty),
    // the small-dino T-Rex is very slow – bosses get a bit more bite there
    trexFactor: level.mode === 'trex' ? level.trexFactor * (level.boss && difficulty === 'small' ? 1.15 : 1) : undefined,
    boss: level.boss ? BOSS_NAMES[level.world] : undefined,
    context: { kind: 'campaign', levelId: level.id },
  };
}

export interface CampaignOutcome {
  levelId: string;
  met: boolean[];
  stars: number;
  previousStars: number;
  newStars: number;
  coins: number;
  eggs: number;
  bossFirstWin: boolean;
  nextLevelId: string | null;
  /** World opened by this race (boss beaten for the first time). */
  unlockedWorld: WorldId | null;
}

/** Stores the stars of a finished level and pays rewards for new stars. Mutates profile. */
export function applyCampaignResult(profile: PlayerProfile, levelId: string, r: ParticipantResult, mode: GameModeId): CampaignOutcome | null {
  const level = LEVEL_BY_ID[levelId];
  if (!level) return null;
  const met = goalsMet(level.goals, r, mode);
  const stars = starsFromGoals(met);
  const previousStars = levelStars(profile, level.id);
  const newStars = Math.max(0, stars - previousStars);
  if (stars > previousStars) profile.campaign.stars[level.id] = stars;
  let coins = newStars * CAMPAIGN_REWARDS.perStar;
  let eggs = 0;
  const bossFirstWin = level.boss && previousStars === 0 && stars > 0;
  if (bossFirstWin) {
    coins += CAMPAIGN_REWARDS.bossCoins;
    eggs += CAMPAIGN_REWARDS.bossEggs;
    profile.eggs.pending += eggs;
  }
  profile.coins += coins;
  profile.totalCoinsEarned += coins;
  const next = nextLevel(level);
  const nextOpen = next && isUnlocked(profile, next) ? next : null;
  return {
    levelId: level.id,
    met,
    stars,
    previousStars,
    newStars,
    coins,
    eggs,
    bossFirstWin,
    nextLevelId: nextOpen?.id ?? null,
    unlockedWorld: bossFirstWin && nextOpen && nextOpen.index === 0 ? nextOpen.world : null,
  };
}

export function worldStars(profile: PlayerProfile, world: WorldId): number {
  return CAMPAIGN_LEVELS.filter((l) => l.world === world).reduce((a, l) => a + levelStars(profile, l.id), 0);
}

export const WORLD_MAX_STARS = LEVELS_PER_WORLD * 3;
