import { CUP_CONFIG } from '../config/modes';
import { WORLD_IDS } from '../config/worlds';
import type { CupState, DifficultyId, PlayerProfile, RaceResult, WorldId } from '../types';
import { evaluateMissions } from './missions';

export function createCup(
  difficulty: DifficultyId,
  firstWorld: WorldId,
  humans: number,
  participants: { id: string; name: string; color: string }[],
  baseSeed: number,
): CupState {
  const start = WORLD_IDS.indexOf(firstWorld);
  const worlds: WorldId[] = Array.from({ length: CUP_CONFIG.races }, (_, i) => WORLD_IDS[(start + i) % WORLD_IDS.length]);
  return {
    difficulty,
    humans,
    worlds,
    baseSeed,
    raceIndex: 0,
    points: Object.fromEntries(participants.map((p) => [p.id, 0])),
    names: Object.fromEntries(participants.map((p) => [p.id, p.name])),
    colors: Object.fromEntries(participants.map((p) => [p.id, p.color])),
    races: [],
    finished: false,
  };
}

export function cupSeed(cup: CupState): number {
  return (cup.baseSeed + cup.raceIndex * 7919) >>> 0;
}

/** Adds points for one finished race. Mutates the cup. */
export function recordCupRace(cup: CupState, result: RaceResult) {
  const places: Record<string, number> = {};
  for (const r of result.results) {
    places[r.id] = r.place;
    cup.points[r.id] = (cup.points[r.id] ?? 0) + (CUP_CONFIG.points[r.place - 1] ?? 0);
  }
  cup.races.push({ worldId: result.config.worldId, places });
  cup.raceIndex++;
  if (cup.raceIndex >= CUP_CONFIG.races) cup.finished = true;
}

export function cupStandings(cup: CupState): { id: string; name: string; color: string; points: number; human: boolean }[] {
  return Object.keys(cup.points)
    .map((id) => ({ id, name: cup.names[id], color: cup.colors[id], points: cup.points[id], human: id.startsWith('p') }))
    .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
}

export interface CupRewards {
  coins: number;
  eggs: number;
  humanWon: boolean;
}

/** Grants cup rewards and archives the cup. Mutates profile. */
export function completeCup(profile: PlayerProfile, cup: CupState, now = Date.now()): CupRewards {
  const standings = cupStandings(cup);
  const humanWon = standings[0]?.human ?? false;
  const coins = CUP_CONFIG.finishCoins + (humanWon ? CUP_CONFIG.winnerCoins : 0);
  profile.coins += coins;
  profile.totalCoinsEarned += coins;
  profile.eggs.pending += CUP_CONFIG.eggs;
  profile.stats.cupsCompleted++;
  if (humanWon) profile.stats.cupsWon++;
  profile.cupHistory.push({
    date: now,
    difficulty: cup.difficulty,
    standings: standings.map((s) => ({ name: s.name, points: s.points, human: s.human })),
  });
  profile.cupHistory = profile.cupHistory.slice(-10);
  profile.activeCup = null;
  evaluateMissions(profile, now);
  return { coins, eggs: CUP_CONFIG.eggs, humanWon };
}
