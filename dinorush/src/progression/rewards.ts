import { ARCHETYPES, CLASSIC_ROLES } from '../config/dinosaurs';
import { ECONOMY } from '../config/economy';
import type { Archetype, MissionDefinition, ParticipantResult, PlayerProfile, RaceResult } from '../types';
import { evaluateMissions } from './missions';
import { addXp, levelForXp } from './rpg';

export interface CoinLine {
  label: string;
  amount: number;
}

export interface XpLine {
  defId: string;
  archetype: Archetype;
  xp: number;
  levelBefore: number;
  levelAfter: number;
}

export interface PlayerReward {
  participantId: string;
  seat: number;
  name: string;
  lines: CoinLine[];
  coins: number;
  xp: XpLine[];
}

export interface RewardSummary {
  players: PlayerReward[];
  totalCoins: number;
  eggsEarned: number;
  racesTowardNextEgg: number;
  missions: MissionDefinition[];
  records: string[];
}

const competitiveModes = new Set(['classic', 'cup', 'goldRush', 'trex', 'endless']);

/**
 * The race as seen by one child profile: only its own seats count as human,
 * so coins, XP, stats and missions land in the right profile when siblings
 * race together.
 */
export function resultForSeats(result: RaceResult, seats: number[]): RaceResult {
  return {
    ...result,
    results: result.results.map((r) => (r.kind === 'human' && !seats.includes(r.seat) ? { ...r, kind: 'ai' as const } : r)),
  };
}

/** Pure computation of coin lines for one human result. */
export function coinLines(result: RaceResult, r: ParticipantResult): CoinLine[] {
  const mode = result.config.mode;
  const lines: CoinLine[] = [];
  if (mode === 'endless') {
    lines.push({ label: 'Výprava', amount: 40 });
    const dist = Math.min(ECONOMY.maxEndlessCoins, Math.floor(r.distance / 10) * ECONOMY.endlessCoinsPer10m);
    if (dist > 0) lines.push({ label: 'Uběhnutá vzdálenost', amount: dist });
  } else {
    lines.push({ label: 'Dokončení závodu', amount: ECONOMY.finishCoins });
  }
  if (competitiveModes.has(mode)) {
    const bonus = ECONOMY.placeCoins[r.place - 1] ?? 0;
    if (bonus) lines.push({ label: `${r.place}. místo`, amount: bonus });
  }
  if (r.coins > 0) lines.push({ label: mode === 'goldRush' ? 'Sebrané mince' : 'Perfektní proměny a kombo', amount: r.coins });
  if (mode === 'trex' && !r.caught) lines.push({ label: 'Útěk před T-Rexem', amount: ECONOMY.modeBonus.trex });
  if (mode === 'team' && result.teamWon) lines.push({ label: 'Týmové vítězství', amount: ECONOMY.modeBonus.team });
  return lines;
}

/** XP per dino used, proportional to distance and successful segments. */
export function xpForResult(r: ParticipantResult, won: boolean): Record<Archetype, number> {
  const X = ECONOMY.xp;
  const out: Record<Archetype, number> = { raptor: 0, spino: 0, ankylo: 0, trike: 0, ptero: 0 };
  const totalUsed = ARCHETYPES.reduce((a, k) => a + r.used[k], 0) || 1;
  const shared = X.finish + (won ? X.win : 0) + r.perfects * X.perPerfect;
  for (const a of ARCHETYPES) {
    const share = r.used[a] / totalUsed;
    out[a] = Math.round(r.used[a] * X.perMetre + r.segmentsByArchetype[a] * X.perSegment + shared * share);
  }
  return out;
}

/**
 * Applies the race outcome to the profile: coins, XP, lifetime statistics,
 * records, egg progress and missions. Mutates `profile`.
 */
export function applyRaceResult(profile: PlayerProfile, result: RaceResult): RewardSummary {
  const humans = result.results.filter((r) => r.kind === 'human');
  const mode = result.config.mode;
  const players: PlayerReward[] = [];
  let totalCoins = 0;
  const competitive = competitiveModes.has(mode);

  for (const r of humans) {
    const lines = coinLines(result, r);
    const coins = lines.reduce((a, l) => a + l.amount, 0);
    totalCoins += coins;
    const won = mode === 'team' ? !!result.teamWon : r.place === 1;
    const xpRec = xpForResult(r, won);
    const xp: XpLine[] = [];
    for (const a of ARCHETYPES) {
      if (xpRec[a] <= 0) continue;
      const defId = r.loadout[a];
      const inst = profile.dinos[defId];
      if (!inst) continue;
      const before = levelForXp(inst.xp);
      const after = addXp(inst, xpRec[a]);
      xp.push({ defId, archetype: a, xp: xpRec[a], levelBefore: before, levelAfter: after });
    }
    players.push({ participantId: r.id, seat: r.seat, name: r.name, lines, coins, xp });
  }
  profile.coins += totalCoins;
  profile.totalCoinsEarned += totalCoins;

  // ---- lifetime stats --------------------------------------------------------
  const s = profile.stats;
  s.racesFinished++;
  if (!s.modesPlayed.includes(mode)) s.modesPlayed.push(mode);
  const humanWon = humans.some((r) => r.place === 1);
  if (competitive && humanWon) {
    s.wins++;
    if (!s.worldsWon.includes(result.config.worldId)) s.worldsWon.push(result.config.worldId);
  }
  if (mode === 'team' && result.teamWon) {
    s.teamWins++;
    s.wins++;
    if (!s.worldsWon.includes(result.config.worldId)) s.worldsWon.push(result.config.worldId);
  }
  for (const r of humans) {
    s.perfects += r.perfects;
    s.maxCombo = Math.max(s.maxCombo, r.maxCombo);
    s.combo5Count += Math.floor(r.maxCombo / 5);
    s.smashed += r.smashed;
    s.abilitiesUsed += r.abilitiesUsed;
    // "all four" means the four classic roles (the flyer is a bonus)
    if (CLASSIC_ROLES.every((a) => r.used[a] >= 5)) s.allFourRaces++;
    if (mode === 'trex' && !r.caught) s.trexEscapes++;
    if (mode === 'endless') s.endlessBest = Math.max(s.endlessBest, r.score);
    if (mode === 'goldRush') s.goldBest = Math.max(s.goldBest, r.coins);
  }

  // ---- records ---------------------------------------------------------------
  const records: string[] = [];
  const rec = profile.records;
  for (const r of humans) {
    // adventure / daily tracks have their own lengths – they keep their own bests
    if ((mode === 'classic' || mode === 'cup') && r.finishTime && !result.config.context) {
      const key = `${result.config.worldId}-${result.config.difficulty}`;
      if (!rec.bestTimes[key] || r.finishTime < rec.bestTimes[key]) {
        rec.bestTimes[key] = Math.round(r.finishTime * 100) / 100;
        records.push(`Nejlepší čas: ${r.finishTime.toFixed(1)} s`);
      }
    }
    if (mode === 'endless' && r.score > rec.endlessBest) {
      rec.endlessBest = r.score;
      records.push(`Rekord výpravy: ${r.score} bodů`);
    }
    if (mode === 'goldRush' && r.coins > rec.goldBest) {
      rec.goldBest = r.coins;
      records.push(`Rekord mincí: ${r.coins}`);
    }
    if (mode === 'trex' && !r.caught && r.score > rec.trexBestLead) {
      rec.trexBestLead = r.score;
      records.push(`Největší náskok před T-Rexem: ${r.score} m`);
    }
  }

  // ---- eggs --------------------------------------------------------------------
  let eggsEarned = 0;
  profile.eggs.racesTowardNext++;
  while (profile.eggs.racesTowardNext >= ECONOMY.racesPerEgg) {
    profile.eggs.racesTowardNext -= ECONOMY.racesPerEgg;
    profile.eggs.pending++;
    eggsEarned++;
  }

  const pendingBefore = profile.eggs.pending;
  const missions = evaluateMissions(profile);
  eggsEarned += profile.eggs.pending - pendingBefore;

  return {
    players,
    totalCoins,
    eggsEarned,
    racesTowardNextEgg: profile.eggs.racesTowardNext,
    missions,
    records: [...new Set(records)],
  };
}
