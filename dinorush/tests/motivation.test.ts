import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVELS, CAMPAIGN_REWARDS, goalText, LEVEL_BY_ID, LEVELS_PER_WORLD } from '../src/config/campaign';
import { DIFFICULTIES } from '../src/config/difficulty';
import { MISSION_BY_ID } from '../src/config/missions';
import { WORLD_IDS } from '../src/config/worlds';
import { GhostPlayer, GhostRecorder } from '../src/game/ghost';
import { RaceEngine } from '../src/game/raceEngine';
import { buildParticipants } from '../src/game/setup';
import { TrackGenerator } from '../src/game/trackGenerator';
import {
  applyCampaignResult,
  currentLevel,
  goalsMet,
  isUnlocked,
  isWorldUnlocked,
  levelAiProfiles,
  levelLength,
  levelRaceConfig,
  starsFromGoals,
  totalStars,
} from '../src/progression/campaign';
import { applyDailyResult, dailyKey, dailyMetric, dailySpec, DAILY_REWARDS, isBetterDaily, refreshDaily } from '../src/progression/daily';
import { createDefaultProfile, createProfile, MAX_PROFILES } from '../src/progression/profile';
import { applyRaceResult, resultForSeats } from '../src/progression/rewards';
import { loadSave, sanitizeGhost, SAVE_KEY, writeSave, type StorageLike } from '../src/progression/storage';
import type { ParticipantResult, RaceResult } from '../src/types';
import { config, human, perfectBot, simulate } from './helpers';

class MemStore implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

function res(partial: Partial<ParticipantResult> = {}): ParticipantResult {
  const zero = { raptor: 0, spino: 0, ankylo: 0, trike: 0 };
  return {
    id: 'p0',
    name: 'Ema',
    color: '#f00',
    kind: 'human',
    seat: 0,
    place: 1,
    finishTime: 80,
    distance: 1000,
    correctSegments: 10,
    mistakes: 0,
    perfects: 5,
    maxCombo: 8,
    smashed: 5,
    coins: 40,
    score: 30,
    caught: false,
    stars: 3,
    used: { raptor: 300, spino: 300, ankylo: 200, trike: 200 },
    segmentsByArchetype: { ...zero, raptor: 3, spino: 3, ankylo: 2, trike: 2 },
    abilitiesUsed: 1,
    loadout: { raptor: 'raptor-green', spino: 'spino-blue', ankylo: 'ankylo-orange', trike: 'trike-purple' },
    ...partial,
  };
}

// ---------------------------------------------------------------------------
describe('adventure campaign', () => {
  it('has 4 worlds × 6 levels with a T-Rex boss at the end of each world', () => {
    expect(CAMPAIGN_LEVELS).toHaveLength(WORLD_IDS.length * LEVELS_PER_WORLD);
    expect(new Set(CAMPAIGN_LEVELS.map((l) => l.id)).size).toBe(CAMPAIGN_LEVELS.length);
    expect(new Set(CAMPAIGN_LEVELS.map((l) => l.seed)).size).toBe(CAMPAIGN_LEVELS.length);
    CAMPAIGN_LEVELS.forEach((l, i) => {
      expect(l.number).toBe(i + 1);
      expect(l.boss).toBe(l.index === LEVELS_PER_WORLD - 1);
      if (l.boss) expect(l.mode).toBe('trex');
      expect(l.goals).toHaveLength(3);
      for (const g of l.goals) expect(goalText(g).length).toBeGreaterThan(3);
    });
  });

  it('generates a valid fixed track of the configured length for every level and difficulty', () => {
    for (const l of CAMPAIGN_LEVELS) {
      for (const d of ['small', 'racer', 'champion'] as const) {
        const len = levelLength(l, d);
        const a = new TrackGenerator({ seed: l.seed, worldId: l.world, difficulty: d, length: len }).track;
        const b = new TrackGenerator({ seed: l.seed, worldId: l.world, difficulty: d, length: len }).track;
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        expect(a.length).toBeGreaterThanOrEqual(len * 0.9);
        expect(a.segments[0].start).toBe(0);
      }
    }
  });

  it('evaluates star goals; the first goal is the pass condition', () => {
    const l = LEVEL_BY_ID['jungle-1']; // place ≤ 3, win, perfects
    expect(goalsMet(l.goals, res({ place: 1, perfects: 5 }), 'classic')).toEqual([true, true, true]);
    expect(starsFromGoals(goalsMet(l.goals, res({ place: 2, perfects: 0 }), 'classic'))).toBe(1);
    // place 4 fails the level even when the perfect-switch goal is met
    expect(starsFromGoals(goalsMet(l.goals, res({ place: 4, perfects: 9 }), 'classic'))).toBe(0);
    const boss = LEVEL_BY_ID['jungle-6']; // escape, lead, mistakes
    expect(starsFromGoals(goalsMet(boss.goals, res({ caught: true, finishTime: null }), 'trex'))).toBe(0);
    expect(starsFromGoals(goalsMet(boss.goals, res({ score: 5, mistakes: 0 }), 'trex'))).toBe(2);
    expect(starsFromGoals(goalsMet(boss.goals, res({ score: 40, mistakes: 1 }), 'trex'))).toBe(3);
  });

  it('unlocks levels one by one and worlds after their boss', () => {
    const p = createDefaultProfile(0);
    expect(isUnlocked(p, CAMPAIGN_LEVELS[0])).toBe(true);
    expect(isUnlocked(p, CAMPAIGN_LEVELS[1])).toBe(false);
    expect(currentLevel(p).id).toBe('jungle-1');
    applyCampaignResult(p, 'jungle-1', res({ place: 3, perfects: 0 }), 'classic');
    expect(isUnlocked(p, CAMPAIGN_LEVELS[1])).toBe(true);
    expect(currentLevel(p).id).toBe('jungle-2');
    expect(isWorldUnlocked(p, 'volcano')).toBe(false);
    for (let i = 2; i <= 5; i++) p.campaign.stars[`jungle-${i}`] = 1;
    const out = applyCampaignResult(p, 'jungle-6', res({ score: 30 }), 'trex')!;
    expect(out.bossFirstWin).toBe(true);
    expect(out.unlockedWorld).toBe('volcano');
    expect(isWorldUnlocked(p, 'volcano')).toBe(true);
    expect(currentLevel(p).id).toBe('volcano-1');
  });

  it('pays only for new stars and the boss reward only once', () => {
    const p = createDefaultProfile(0);
    const c0 = p.coins;
    const a = applyCampaignResult(p, 'jungle-1', res({ place: 2, perfects: 0 }), 'classic')!;
    expect(a.stars).toBe(1);
    expect(p.coins - c0).toBe(CAMPAIGN_REWARDS.perStar);
    const b = applyCampaignResult(p, 'jungle-1', res({ place: 2, perfects: 0 }), 'classic')!;
    expect(b.newStars).toBe(0);
    expect(b.coins).toBe(0);
    const c = applyCampaignResult(p, 'jungle-1', res({ place: 1, perfects: 4 }), 'classic')!;
    expect(c.newStars).toBe(2);
    expect(p.campaign.stars['jungle-1']).toBe(3);
    // a worse run never lowers the stars
    applyCampaignResult(p, 'jungle-1', res({ place: 5 }), 'classic');
    expect(p.campaign.stars['jungle-1']).toBe(3);
    expect(totalStars(p)).toBe(3);
    for (let i = 2; i <= 5; i++) p.campaign.stars[`jungle-${i}`] = 1;
    const eggs = p.eggs.pending;
    applyCampaignResult(p, 'jungle-6', res({ score: 30 }), 'trex');
    applyCampaignResult(p, 'jungle-6', res({ score: 30 }), 'trex');
    expect(p.eggs.pending - eggs).toBe(CAMPAIGN_REWARDS.bossEggs);
  });

  it('ramps AI strength and boss T-Rex speed', () => {
    const first = LEVEL_BY_ID['jungle-1'];
    const boss = LEVEL_BY_ID['jungle-6'];
    expect(levelAiProfiles(first, 'racer').every((p) => p === 'rookie')).toBe(true);
    expect(levelAiProfiles(boss, 'racer')).toContain('champion');
    expect(levelAiProfiles(LEVEL_BY_ID['jungle-3'], 'racer')).toEqual(DIFFICULTIES.racer.aiProfiles);
    const cfg = levelRaceConfig(boss, 'racer');
    expect(cfg.trexFactor).toBeGreaterThan(1);
    expect(cfg.boss).toBeTruthy();
    expect(cfg.context).toEqual({ kind: 'campaign', levelId: 'jungle-6' });
    const e = new RaceEngine(cfg, [human('p0', 0)]);
    expect(e.state.trex!.speed).toBeCloseTo(DIFFICULTIES.racer.baseSpeed * DIFFICULTIES.racer.trexSpeedFactor * cfg.trexFactor!, 5);
  });

  it('a skilled player earns all three stars on the first level and the first boss', () => {
    for (const id of ['jungle-1', 'jungle-6']) {
      const l = LEVEL_BY_ID[id];
      const profile = createDefaultProfile(0);
      const setup = { mode: l.mode, humans: 1 as const, names: ['K'], worldId: l.world, difficulty: 'racer' as const };
      const parts = buildParticipants(setup, profile, l.seed, undefined, levelAiProfiles(l, 'racer'));
      const e = new RaceEngine(levelRaceConfig(l, 'racer'), parts);
      simulate(e, { p0: perfectBot });
      const r = e.getResult().results.find((x) => x.id === 'p0')!;
      expect(starsFromGoals(goalsMet(l.goals, r, l.mode))).toBe(3);
    }
  });
});

// ---------------------------------------------------------------------------
describe('daily challenge', () => {
  it('uses the local date and gives the same track to everybody on that day', () => {
    expect(dailyKey(new Date(2026, 10, 3))).toBe('2026-11-03');
    expect(dailySpec('2026-11-23')).toEqual(dailySpec('2026-11-23'));
    expect(dailySpec('2026-11-23').seed).not.toBe(dailySpec('2026-11-24').seed);
    const worlds = new Set<string>();
    const modes = new Set<string>();
    for (let d = 1; d <= 24; d++) {
      const s = dailySpec(`2026-12-${String(d).padStart(2, '0')}`);
      worlds.add(s.worldId);
      modes.add(s.mode);
    }
    expect(worlds.size).toBe(4);
    expect(modes).toEqual(new Set(['classic', 'goldRush', 'trex']));
  });

  it('pays the completion reward once a day and keeps the best result', () => {
    const p = createDefaultProfile(0);
    const spec = { ...dailySpec('2026-11-23'), mode: 'classic' as const };
    const c0 = p.coins;
    const a = applyDailyResult(p, spec, res({ place: 2, finishTime: 90, perfects: 0 }));
    expect(a.firstToday).toBe(true);
    expect(a.coins).toBe(DAILY_REWARDS.complete);
    expect(p.daily.best).toBe(90);
    const b = applyDailyResult(p, spec, res({ place: 1, finishTime: 85, perfects: 5 }));
    expect(b.firstToday).toBe(false);
    expect(b.improved).toBe(true);
    expect(b.stars).toBe(3);
    expect(b.coins).toBe(DAILY_REWARDS.threeStars);
    const c = applyDailyResult(p, spec, res({ place: 1, finishTime: 95, perfects: 5 }));
    expect(c.improved).toBe(false);
    expect(c.coins).toBe(0);
    expect(p.daily.best).toBe(85);
    expect(p.coins - c0).toBe(DAILY_REWARDS.complete + DAILY_REWARDS.threeStars);
    expect(p.daily.completed).toBe(1);
    // next day: fresh day, lifetime count stays (no streak to lose)
    refreshDaily(p, '2026-11-25');
    expect(p.daily).toEqual({ key: '2026-11-25', best: null, stars: 0, rewarded: false, completed: 1 });
  });

  it('compares results per mode', () => {
    expect(isBetterDaily('classic', 80, 90)).toBe(true);
    expect(isBetterDaily('goldRush', 80, 90)).toBe(false);
    expect(isBetterDaily('trex', 30, 20)).toBe(true);
    expect(dailyMetric('trex', res({ caught: true }))).toBe(0);
    expect(dailyMetric('goldRush', res({ coins: 33 }))).toBe(33);
  });
});

// ---------------------------------------------------------------------------
describe('ghost of the best run', () => {
  it('records a run and plays it back at the same positions', () => {
    const e = new RaceEngine(config({ seed: 77 }), [human('p0', 0)]);
    const rec = new GhostRecorder();
    const truth: [number, number][] = [];
    e.onStep = () => {
      const p = e.state.participants[0];
      if (!p.finished) {
        rec.sample(e.state.time, p.position, p.current);
        truth.push([e.state.time, p.position]);
      }
    };
    simulate(e, { p0: perfectBot });
    const p = e.state.participants[0];
    const data = rec.finish(p.finishTime!, 'Ema')!;
    expect(data).not.toBeNull();
    expect(data.time).toBeCloseTo(p.finishTime!, 1);
    expect(JSON.stringify(data).length).toBeLessThan(4000);
    const g = new GhostPlayer(data);
    for (const [t, pos] of truth.filter((_, i) => i % 97 === 0)) {
      expect(Math.abs(g.positionAt(t) - pos)).toBeLessThan(0.6);
      expect(Math.abs(g.timeAt(pos) - t)).toBeLessThan(0.15);
    }
    expect(['raptor', 'spino', 'ankylo', 'trike']).toContain(g.archAt(30));
    // round-trips through the save sanitiser
    expect(sanitizeGhost(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it('rejects broken ghost data', () => {
    expect(sanitizeGhost(null)).toBeNull();
    expect(sanitizeGhost({ pos: [1, 2, 3], arch: 'rs', time: 10 })).toBeNull();
    expect(sanitizeGhost({ pos: [1, 'x'], arch: 'rr', time: 10 })).toBeNull();
    expect(sanitizeGhost({ pos: [1, 2], arch: 'rx', time: 10 })).toBeNull();
    expect(sanitizeGhost({ pos: [1, 2], arch: 'rr', time: 0 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('profiles', () => {
  it('migrates a version 2 save into a profile list without losing progress', () => {
    const store = new MemStore();
    const old = createDefaultProfile(0) as unknown as Record<string, unknown>;
    delete old.id;
    delete old.campaign;
    delete old.daily;
    delete old.ghosts;
    old.coins = 555;
    store.setItem(SAVE_KEY, JSON.stringify({ version: 2, profile: old, settings: { music: false } }));
    const s = loadSave(store);
    expect(s.version).toBe(3);
    expect(s.profiles).toHaveLength(1);
    expect(s.profiles[0].coins).toBe(555);
    expect(s.activeProfileId).toBe(s.profiles[0].id);
    expect(s.profiles[0].campaign.stars).toEqual({});
    expect(s.profiles[0].daily.completed).toBe(0);
    expect(s.settings.music).toBe(false);
  });

  it('keeps several children apart and repairs ids', () => {
    const store = new MemStore();
    const a = createProfile('Ema', { archetype: 'raptor', color: '#ff4757' }, 'small');
    const b = createProfile('Ben', { archetype: 'trike', color: '#1e90ff' }, 'champion');
    a.coins = 10;
    b.coins = 900;
    b.campaign.stars['jungle-1'] = 3;
    writeSave({ version: 3, profiles: [a, b], activeProfileId: b.id, settings: loadSave(new MemStore()).settings }, store);
    const s = loadSave(store);
    expect(s.profiles.map((p) => p.players[0].name)).toEqual(['Ema', 'Ben']);
    expect(s.activeProfileId).toBe(b.id);
    expect(s.profiles[1].coins).toBe(900);
    expect(s.profiles[1].campaign).toEqual({ difficulty: 'champion', stars: { 'jungle-1': 3 } });
    expect(s.profiles[0].avatar).toEqual({ archetype: 'raptor', color: '#ff4757' });
    // duplicate ids / unknown active id / too many profiles
    const dup = { ...JSON.parse(JSON.stringify(a)) };
    store.setItem(SAVE_KEY, JSON.stringify({ version: 3, profiles: [a, dup, b, b, a, b], activeProfileId: 'nope', settings: {} }));
    const t = loadSave(store);
    expect(t.profiles.length).toBe(MAX_PROFILES);
    expect(new Set(t.profiles.map((p) => p.id)).size).toBe(MAX_PROFILES);
    expect(t.activeProfileId).toBe(t.profiles[0].id);
  });

  it('credits each child in a shared race with only their own result', () => {
    const ema = createDefaultProfile(0);
    const ben = createDefaultProfile(0);
    const result: RaceResult = {
      config: config(),
      duration: 90,
      results: [
        res({ id: 'p0', seat: 0, place: 1, name: 'Ema' }),
        res({ id: 'ai0', kind: 'ai', seat: -1, place: 2 }),
        res({ id: 'p1', seat: 1, place: 3, name: 'Ben', coins: 0, perfects: 0 }),
      ],
    };
    const se = applyRaceResult(ema, resultForSeats(result, [0]));
    const sb = applyRaceResult(ben, resultForSeats(result, [1]));
    expect(se.players.map((p) => p.name)).toEqual(['Ema']);
    expect(sb.players.map((p) => p.name)).toEqual(['Ben']);
    expect(ema.stats.wins).toBe(1);
    expect(ben.stats.wins).toBe(0);
    expect(se.totalCoins).toBeGreaterThan(sb.totalCoins);
  });

  it('lets another child race with their own dinosaurs', () => {
    const ema = createDefaultProfile(0);
    const ben = createProfile('Ben', { archetype: 'trike', color: '#1e90ff' }, 'racer');
    ben.dinos['raptor-blue'] = { ...ben.dinos['raptor-green'], defId: 'raptor-blue' };
    ben.players[0].lineup.raptor = 'raptor-blue';
    const setup = { mode: 'classic' as const, humans: 2 as const, names: ['Ema', 'Host'], worldId: 'jungle' as const, difficulty: 'racer' as const, seatProfiles: [ema.id, ben.id] };
    const parts = buildParticipants(setup, ema, 5, (id) => (id === ben.id ? ben : undefined));
    const p1 = parts.find((p) => p.id === 'p1')!;
    expect(p1.name).toBe('Ben');
    expect(p1.loadout.raptor.defId).toBe('raptor-blue');
    const guest = buildParticipants({ ...setup, seatProfiles: [ema.id, null] }, ema, 5).find((p) => p.id === 'p1')!;
    expect(guest.name).toBe('Host');
  });

  it('new missions read the adventure, daily and ghost progress', () => {
    const p = createDefaultProfile(0);
    p.campaign.stars = { 'jungle-1': 3, 'jungle-2': 3, 'jungle-3': 3, 'jungle-4': 1 };
    expect(MISSION_BY_ID.stars10.metric(p.stats, p)).toBe(10);
    p.daily.completed = 2;
    expect(MISSION_BY_ID.daily3.metric(p.stats, p)).toBe(2);
    p.stats.ghostsBeaten = 1;
    expect(MISSION_BY_ID.ghost1.metric(p.stats, p)).toBe(1);
  });
});
