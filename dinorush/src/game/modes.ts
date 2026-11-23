import { GAME_CONFIG } from '../config/gameConfig';
import type { GameModeId, RaceParticipant } from '../types';
import type { RaceEngine } from './raceEngine';
import { endlessRamp } from './trackGenerator';

const C = GAME_CONFIG;

/**
 * Mode rules plug into the shared race engine. The engine owns movement and
 * scoring basics; a mode decides extra entities (T-Rex, rival), scoring,
 * end conditions and ranking.
 */
export interface ModeRules {
  id: GameModeId;
  init(e: RaceEngine): void;
  tick(e: RaceEngine, dt: number): void;
  onSegmentSuccess(e: RaceEngine, p: RaceParticipant): void;
  onPerfect(e: RaceEngine, p: RaceParticipant): void;
  onCombo(e: RaceEngine, p: RaceParticipant, combo: number): void;
  onFinish(e: RaceEngine, p: RaceParticipant): void;
  shouldEnd(e: RaceEngine): boolean;
  /** Live ordering (index 0 = leading). */
  liveOrder(e: RaceEngine): RaceParticipant[];
  /** Final ordering when the race ends. */
  finalOrder(e: RaceEngine): RaceParticipant[];
  stars(e: RaceEngine, p: RaceParticipant, place: number): number;
}

function byFinishThenDistance(a: RaceParticipant, b: RaceParticipant): number {
  if (a.finished && b.finished) return (a.finishTime ?? 0) - (b.finishTime ?? 0);
  if (a.finished) return -1;
  if (b.finished) return 1;
  return b.position - a.position;
}

/** Shared end rule: everyone finished, or all humans finished + short grace. */
function defaultShouldEnd(e: RaceEngine): boolean {
  const s = e.state;
  if (s.time >= C.maxRaceSeconds) return true;
  const ps = s.participants;
  if (ps.every((p) => p.finished)) return true;
  const humans = ps.filter((p) => p.kind === 'human');
  if (humans.length && humans.every((p) => p.finished)) {
    const last = Math.max(...humans.map((p) => p.finishTime ?? 0));
    return s.time - last >= 3;
  }
  return false;
}

function placeStars(place: number): number {
  return place === 1 ? 3 : place <= 3 ? 2 : 1;
}

const base: Omit<ModeRules, 'id'> = {
  init() {},
  tick() {},
  onSegmentSuccess() {},
  onPerfect() {},
  onCombo() {},
  onFinish() {},
  shouldEnd: defaultShouldEnd,
  liveOrder(e) {
    return [...e.state.participants].sort(byFinishThenDistance);
  },
  finalOrder(e) {
    return [...e.state.participants].sort((a, b) => (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity));
  },
  stars(_e, _p, place) {
    return placeStars(place);
  },
};

const classic: ModeRules = { ...base, id: 'classic' };
const cup: ModeRules = { ...base, id: 'cup' };

const trex: ModeRules = {
  ...base,
  id: 'trex',
  init(e) {
    const d = e.difficulty;
    e.state.trex = { position: -C.trex.startGap, speed: d.baseSpeed * d.trexSpeedFactor * (e.state.config.trexFactor ?? 1), caught: [] };
  },
  tick(e, dt) {
    const t = e.state.trex!;
    t.position += t.speed * dt;
    for (const p of e.state.participants) {
      if (p.caught || p.finished) continue;
      if (t.position >= p.position - C.trex.catchDistance) {
        p.caught = true;
        p.caughtAt = e.state.time;
        t.caught.push(p.id);
        e.emit({ type: 'trexCatch', participantId: p.id, position: p.position });
      }
    }
  },
  onFinish(e, p) {
    if (!p.caught) p.score = Math.round(p.position - e.state.trex!.position);
  },
  liveOrder(e) {
    return [...e.state.participants].sort(byFinishThenDistance);
  },
  finalOrder(e) {
    return [...e.state.participants].sort((a, b) => {
      if (a.caught !== b.caught) return a.caught ? 1 : -1;
      if (!a.caught) return (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity);
      return (b.caughtAt ?? 0) - (a.caughtAt ?? 0);
    });
  },
  stars(_e, p) {
    if (p.caught) return 1;
    return p.score >= 40 ? 3 : 2;
  },
};

const endless: ModeRules = {
  ...base,
  id: 'endless',
  tick(e) {
    const s = e.state;
    let lead = 0;
    for (const p of s.participants) {
      lead = Math.max(lead, p.position);
      p.score = Math.floor(p.position * C.endless.scorePerMetre) + e.bonusScore(p.id);
    }
    s.ramp = endlessRamp(lead);
  },
  onPerfect(e, p) {
    e.addBonusScore(p.id, C.endless.scorePerPerfect);
  },
  onCombo(e, p) {
    e.addBonusScore(p.id, C.endless.scorePerCombo);
  },
  shouldEnd(e) {
    return e.state.endedByPlayer || e.state.time >= 900;
  },
  liveOrder(e) {
    return [...e.state.participants].sort((a, b) => b.score - a.score);
  },
  finalOrder(e) {
    return [...e.state.participants].sort((a, b) => b.score - a.score);
  },
  stars(_e, p) {
    return p.score >= 1500 ? 3 : p.score >= 600 ? 2 : 1;
  },
};

const goldRush: ModeRules = {
  ...base,
  id: 'goldRush',
  onSegmentSuccess(_e, p) {
    p.coins += C.coins.correctSegment;
  },
  onCombo(_e, p, combo) {
    if (combo % C.combo.turboEvery === 0) p.coins += C.coins.comboMilestone;
  },
  liveOrder(e) {
    return [...e.state.participants].sort((a, b) => b.coins - a.coins || byFinishThenDistance(a, b));
  },
  finalOrder(e) {
    return [...e.state.participants].sort(
      (a, b) => b.coins - a.coins || (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity),
    );
  },
};

function addTeamMeter(e: RaceEngine, amount: number) {
  const t = e.state.team!;
  t.meter += amount;
  if (t.meter >= t.meterMax) {
    t.meter = 0;
    t.turbos++;
    for (const p of e.state.participants) if (!p.finished) p.teamTurbo = C.team.turboDuration;
    e.emit({ type: 'teamTurbo' });
  }
}

const team: ModeRules = {
  ...base,
  id: 'team',
  init(e) {
    const d = e.difficulty;
    const rivalSpeed = d.baseSpeed * d.trexSpeedFactor * C.team.rivalPaceFactor;
    e.state.team = {
      meter: 0,
      meterMax: C.team.meterMax,
      score: 0,
      turbos: 0,
      rivalPosition: 0,
      rivalSpeed,
      rivalFinishTime: null,
    };
  },
  tick(e, dt) {
    const t = e.state.team!;
    const before = t.rivalPosition;
    t.rivalPosition += t.rivalSpeed * dt;
    const len = e.state.track.length;
    if (t.rivalFinishTime === null && t.rivalPosition >= len && before < len) {
      t.rivalFinishTime = e.state.time - (t.rivalPosition - len) / t.rivalSpeed;
    }
  },
  onSegmentSuccess(e, p) {
    e.state.team!.score += 10;
    p.score += 10;
    addTeamMeter(e, 1);
  },
  onPerfect(e, p) {
    e.state.team!.score += 25;
    p.score += 25;
    addTeamMeter(e, 1);
  },
  onCombo(e, p) {
    e.state.team!.score += 20;
    p.score += 20;
  },
  stars(e) {
    const r = e.teamOutcome();
    if (!r.won) return 1;
    return r.margin >= 5 ? 3 : 2;
  },
};

export const MODE_RULES: Record<GameModeId, ModeRules> = { classic, cup, trex, endless, goldRush, team };
