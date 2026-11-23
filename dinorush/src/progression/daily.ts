import { hashString } from '../core/rng';
import { WORLD_IDS } from '../config/worlds';
import type { CampaignMode, ParticipantResult, PlayerProfile, StarGoal, WorldId } from '../types';
import { goalsMet, starsFromGoals } from './campaign';

/**
 * Daily challenge: one fixed track per calendar day, the same for every
 * profile on the tablet (and for anyone else on that day). No streaks – a
 * missed day costs nothing.
 */
export interface DailySpec {
  key: string;
  seed: number;
  worldId: WorldId;
  mode: CampaignMode;
  goals: [StarGoal, StarGoal, StarGoal];
}

export const DAILY_REWARDS = {
  /** First finished daily challenge of the day. */
  complete: 50,
  /** First time all three stars on that day. */
  threeStars: 30,
};

const MODES: CampaignMode[] = ['classic', 'goldRush', 'trex'];

/** Local calendar date as 'YYYY-MM-DD'. */
export function dailyKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function dailySpec(key: string): DailySpec {
  const n = dayNumber(key);
  const worldId = WORLD_IDS[((n % WORLD_IDS.length) + WORLD_IDS.length) % WORLD_IDS.length];
  const mode = MODES[((Math.floor(n / WORLD_IDS.length) % MODES.length) + MODES.length) % MODES.length];
  const goals: DailySpec['goals'] =
    mode === 'trex'
      ? [{ kind: 'escape', value: 1 }, { kind: 'lead', value: 20 }, { kind: 'perfects', value: 3 }]
      : mode === 'goldRush'
        ? [{ kind: 'place', value: 3 }, { kind: 'place', value: 1 }, { kind: 'combo', value: 5 }]
        : [{ kind: 'place', value: 3 }, { kind: 'place', value: 1 }, { kind: 'perfects', value: 3 }];
  return { key, seed: hashString(`daily:${key}`) % 1_000_000, worldId, mode, goals };
}

/**
 * The day's score of one run: finish time (classic, lower is better),
 * coins (gold rush) or lead over the T-Rex in metres (0 when caught).
 */
export function dailyMetric(mode: CampaignMode, r: ParticipantResult): number | null {
  if (mode === 'classic') return r.finishTime !== null ? Math.round(r.finishTime * 100) / 100 : null;
  if (mode === 'goldRush') return r.coins;
  return r.caught ? 0 : r.score;
}

export function isBetterDaily(mode: CampaignMode, value: number | null, best: number | null): boolean {
  if (value === null) return false;
  if (best === null) return true;
  return mode === 'classic' ? value < best : value > best;
}

export function formatDailyValue(mode: CampaignMode, v: number | null): string {
  if (v === null) return '–';
  if (mode === 'classic') return `${v.toFixed(1)} s`;
  if (mode === 'goldRush') return `${v} mincí`;
  return v > 0 ? `+${v} m` : 'chycen';
}

/** Resets today's fields when a new day started (the lifetime count stays). */
export function refreshDaily(profile: PlayerProfile, key: string) {
  if (profile.daily.key !== key) profile.daily = { key, best: null, stars: 0, rewarded: false, completed: profile.daily.completed };
}

export interface DailyOutcome {
  key: string;
  met: boolean[];
  stars: number;
  value: number | null;
  improved: boolean;
  firstToday: boolean;
  coins: number;
}

/** Records a daily run on the profile and pays the day's rewards once. Mutates profile. */
export function applyDailyResult(profile: PlayerProfile, spec: DailySpec, r: ParticipantResult): DailyOutcome {
  refreshDaily(profile, spec.key);
  const d = profile.daily;
  const met = goalsMet(spec.goals, r, spec.mode);
  const stars = starsFromGoals(met);
  const value = dailyMetric(spec.mode, r);
  const finished = met[0] || (r.finishTime !== null && !r.caught);
  const improved = isBetterDaily(spec.mode, value, d.best) && finished;
  if (improved) d.best = value;
  let coins = 0;
  const firstToday = finished && !d.rewarded;
  if (firstToday) {
    d.rewarded = true;
    d.completed++;
    coins += DAILY_REWARDS.complete;
  }
  if (stars === 3 && d.stars < 3) coins += DAILY_REWARDS.threeStars;
  d.stars = Math.max(d.stars, stars);
  profile.coins += coins;
  profile.totalCoinsEarned += coins;
  return { key: spec.key, met, stars, value, improved, firstToday, coins };
}
