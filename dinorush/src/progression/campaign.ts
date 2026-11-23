import {
  BOSS_NAMES,
  CAMPAIGN_LEVELS,
  CAMPAIGN_REWARDS,
  CAREER_XP,
  EXPLORER_LEVELS,
  LEVEL_BY_ID,
  LEVELS_PER_REGION,
  REGIONS,
  RIVAL_ID,
  START_LEVEL,
} from '../config/campaign';
import { DIFFICULTIES } from '../config/difficulty';
import type {
  AIProfileId,
  CampaignLevel,
  DifficultyId,
  GameModeId,
  ParticipantResult,
  PlayerProfile,
  RaceConfig,
  RegionId,
  StarGoal,
} from '../types';
import { createDinoInstance } from './profile';

/**
 * Career on the map: places open along the paths, every race gives explorer
 * XP, three stars find a fossil, region bosses give a badge, and some places
 * introduce a new dinosaur friend that joins the collection.
 */

/** Which star goals a racer met. Goal 0 is the pass condition. */
export function goalsMet(goals: readonly StarGoal[], r: ParticipantResult, mode: GameModeId, all: readonly ParticipantResult[] = []): boolean[] {
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
      case 'rival': {
        const rival = all.find((x) => x.id === RIVAL_ID);
        return finished && !!rival && r.place < rival.place;
      }
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

/** A place is open when it is the start or a place leading to it has a star. */
export function isUnlocked(profile: PlayerProfile, level: CampaignLevel): boolean {
  if (level.from.length === 0) return true;
  return level.from.some((id) => levelStars(profile, id) > 0);
}

export function isRegionUnlocked(profile: PlayerProfile, region: RegionId): boolean {
  const first = CAMPAIGN_LEVELS.find((l) => l.region === region && l.index === 0)!;
  return isUnlocked(profile, first);
}

/** Kept for older callers: worlds are now regions. */
export const isWorldUnlocked = isRegionUnlocked;

/** Places that can be played next: open places without a star. */
export function openPlaces(profile: PlayerProfile): CampaignLevel[] {
  return CAMPAIGN_LEVELS.filter((l) => isUnlocked(profile, l) && levelStars(profile, l.id) === 0);
}

/** Where the explorer stands: the last visited place, or the next new one. */
export function currentLevel(profile: PlayerProfile): CampaignLevel {
  const cur = profile.campaign.current ? LEVEL_BY_ID[profile.campaign.current] : null;
  if (cur && isUnlocked(profile, cur)) return cur;
  return openPlaces(profile)[0] ?? LEVEL_BY_ID[START_LEVEL];
}

/** Places reached from this one (to show where the paths go). */
export function nextPlaces(level: CampaignLevel): CampaignLevel[] {
  return CAMPAIGN_LEVELS.filter((l) => l.from.includes(level.id));
}

export function nextLevel(level: CampaignLevel): CampaignLevel | null {
  return nextPlaces(level)[0] ?? null;
}

/** AI strength of a place relative to the chosen difficulty. */
export function levelAiProfiles(level: CampaignLevel, difficulty: DifficultyId): AIProfileId[] {
  const base = DIFFICULTIES[difficulty].aiProfiles;
  const up: Record<AIProfileId, AIProfileId> = { rookie: 'beginner', beginner: 'advanced', advanced: 'champion', champion: 'champion' };
  if (level.ai === 'easy') return base.map((p) => (p === 'champion' ? 'beginner' : 'rookie'));
  if (level.ai === 'hard') return base.map((p, i) => (i % 2 === 0 ? up[p] : p));
  return [...base];
}

/** Track length for the chosen difficulty (places are designed for 'racer'). */
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
    boss: level.boss && level.bossKind === 'trex' ? BOSS_NAMES[level.region] : undefined,
    context: { kind: 'campaign', levelId: level.id },
    terrainPool: level.terrainPool,
    look: level.look,
  };
}

// ---------------------------------------------------------------------------
// Explorer level (RPG progression in kid style)
// ---------------------------------------------------------------------------

export function explorerLevel(xp: number): number {
  let lv = 1;
  EXPLORER_LEVELS.forEach((l, i) => {
    if (xp >= l.xp) lv = i + 1;
  });
  return lv;
}

export function explorerTitle(xp: number): string {
  return EXPLORER_LEVELS[explorerLevel(xp) - 1].title;
}

/** Progress towards the next explorer level (0–1) and the XP numbers. */
export function explorerProgress(xp: number): { level: number; ratio: number; into: number; need: number; max: boolean } {
  const lv = explorerLevel(xp);
  const cur = EXPLORER_LEVELS[lv - 1];
  const next = EXPLORER_LEVELS[lv];
  if (!next) return { level: lv, ratio: 1, into: xp - cur.xp, need: 0, max: true };
  return { level: lv, ratio: (xp - cur.xp) / (next.xp - cur.xp), into: xp - cur.xp, need: next.xp - cur.xp, max: false };
}

// ---------------------------------------------------------------------------
// Outcome of one career race
// ---------------------------------------------------------------------------

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
  /** Region opened by this race (its first place became playable). */
  unlockedWorld: RegionId | null;
  xp: number;
  levelBefore: number;
  levelAfter: number;
  /** Fossil found now (first time three stars). */
  fossil: string | null;
  /** Dinosaur that joined now. */
  friend: string | null;
  badge: RegionId | null;
}

/** Stores the stars of a finished place and pays rewards. Mutates profile. */
export function applyCampaignResult(
  profile: PlayerProfile,
  levelId: string,
  r: ParticipantResult,
  mode: GameModeId,
  all: readonly ParticipantResult[] = [],
): CampaignOutcome | null {
  const level = LEVEL_BY_ID[levelId];
  if (!level) return null;
  const c = profile.campaign;
  const openBefore = new Set(CAMPAIGN_LEVELS.filter((l) => isUnlocked(profile, l)).map((l) => l.id));
  const met = goalsMet(level.goals, r, mode, all);
  const stars = starsFromGoals(met);
  const previousStars = levelStars(profile, level.id);
  const newStars = Math.max(0, stars - previousStars);
  if (stars > previousStars) c.stars[level.id] = stars;
  c.current = level.id;
  let coins = newStars * CAMPAIGN_REWARDS.perStar;
  let eggs = 0;
  const bossFirstWin = level.boss && previousStars === 0 && stars > 0;
  let badge: RegionId | null = null;
  if (bossFirstWin) {
    coins += CAMPAIGN_REWARDS.bossCoins;
    eggs += CAMPAIGN_REWARDS.bossEggs;
    if (!c.badges.includes(level.region)) {
      c.badges.push(level.region);
      badge = level.region;
    }
  }
  // a new dinosaur friend joins on the first pass of its place
  let friend: string | null = null;
  if (level.friend && stars > 0 && !c.friends.includes(level.friend)) {
    c.friends.push(level.friend);
    friend = level.friend;
    if (!profile.dinos[level.friend]) {
      profile.dinos[level.friend] = createDinoInstance(level.friend);
      profile.stats.dinosUnlocked++;
    }
  }
  // three stars find the place's fossil
  let fossil: string | null = null;
  if (level.fossil && stars === 3 && !c.fossils.includes(level.fossil)) {
    c.fossils.push(level.fossil);
    fossil = level.fossil;
  }
  // explorer XP and level-up rewards
  const finished = r.finishTime !== null && !(mode === 'trex' && r.caught);
  const xp = (finished ? CAREER_XP.finish : 0) + newStars * CAREER_XP.perNewStar + (bossFirstWin ? CAREER_XP.bossFirst : 0) + (friend ? CAREER_XP.friend : 0);
  const levelBefore = explorerLevel(c.xp);
  c.xp += xp;
  const levelAfter = explorerLevel(c.xp);
  for (let lv = levelBefore + 1; lv <= levelAfter; lv++) {
    const rw = EXPLORER_LEVELS[lv - 1].reward;
    coins += rw.coins ?? 0;
    eggs += rw.eggs ?? 0;
  }
  profile.eggs.pending += eggs;
  profile.coins += coins;
  profile.totalCoinsEarned += coins;
  const opened = CAMPAIGN_LEVELS.filter((l) => !openBefore.has(l.id) && isUnlocked(profile, l));
  const nextOpen = opened[0] ?? nextPlaces(level).find((l) => isUnlocked(profile, l)) ?? null;
  const newRegion = opened.find((l) => l.index === 0);
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
    unlockedWorld: newRegion ? newRegion.region : null,
    xp,
    levelBefore,
    levelAfter,
    fossil,
    friend,
    badge,
  };
}

export function regionStars(profile: PlayerProfile, region: RegionId): number {
  return CAMPAIGN_LEVELS.filter((l) => l.region === region).reduce((a, l) => a + levelStars(profile, l.id), 0);
}

export const worldStars = regionStars;
export const REGION_MAX_STARS = LEVELS_PER_REGION * 3;
export const WORLD_MAX_STARS = REGION_MAX_STARS;

export function regionName(id: RegionId): string {
  return REGIONS[id].name;
}
