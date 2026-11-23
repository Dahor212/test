import { describe, expect, it } from 'vitest';
import { EGG_SEQUENCE, UPGRADE_COSTS } from '../src/config/economy';
import { RaceEngine } from '../src/game/raceEngine';
import { buildParticipants, buildRaceConfig, laneLayout } from '../src/game/setup';
import { completeCup, createCup, cupStandings, recordCupRace } from '../src/progression/cup';
import { equipAccessory, nextEggReward, openEgg } from '../src/progression/eggs';
import { evaluateMissions, missionStatus } from '../src/progression/missions';
import { buyDecoration, moveDecoration, placeDecoration, removeDecoration } from '../src/progression/park';
import { cloneProfile, createDefaultProfile } from '../src/progression/profile';
import { applyRaceResult } from '../src/progression/rewards';
import { addXp, buyUpgrade, checkUpgrade, levelForXp, loadoutFor } from '../src/progression/rpg';
import { defaultSave, loadSave, SAVE_KEY, writeSave, type StorageLike } from '../src/progression/storage';
import type { RaceSetup } from '../src/types';
import { perfectBot, simulate } from './helpers';

class MemStore implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

function playRace(setup: RaceSetup, profile = createDefaultProfile(), seed = 21) {
  const parts = buildParticipants(setup, profile, seed);
  const e = new RaceEngine(buildRaceConfig(setup, seed), parts);
  const bots = Object.fromEntries(parts.filter((p) => p.kind === 'human').map((p) => [p.id, perfectBot]));
  simulate(e, bots);
  if (setup.mode === 'endless') e.endByPlayer();
  return { profile, result: e.getResult(), engine: e };
}

const solo: RaceSetup = { mode: 'classic', humans: 1, names: ['Ema'], worldId: 'jungle', difficulty: 'racer' };

describe('rewards (TEST 9)', () => {
  it('adds coins, XP, stats and missions after a race', () => {
    const { profile, result } = playRace(solo);
    const coinsBefore = profile.coins;
    const xpBefore = profile.dinos['raptor-green'].xp;
    const summary = applyRaceResult(profile, result);
    expect(summary.totalCoins).toBeGreaterThanOrEqual(100);
    expect(profile.coins).toBeGreaterThan(coinsBefore + 100);
    expect(profile.dinos['raptor-green'].xp).toBeGreaterThan(xpBefore);
    expect(profile.stats.racesFinished).toBe(1);
    expect(summary.missions.map((m) => m.id)).toContain('firstRace');
    expect(profile.missions.firstRace.completed).toBe(true);
    expect(summary.players[0].lines[0].label).toBe('Dokončení závodu');
  });

  it('never removes coins and grants an egg every 3 races', () => {
    const profile = createDefaultProfile();
    let last = profile.coins;
    for (let i = 0; i < 3; i++) {
      const { result } = playRace(solo, profile, 30 + i);
      applyRaceResult(profile, result);
      expect(profile.coins).toBeGreaterThan(last);
      last = profile.coins;
    }
    expect(profile.eggs.pending).toBeGreaterThanOrEqual(1);
  });
});

describe('RPG upgrades (TEST 10)', () => {
  it('levels from XP', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(80)).toBe(2);
    expect(levelForXp(1e6)).toBe(10);
  });

  it('buying an upgrade costs coins and changes the stat used in races', () => {
    const p = createDefaultProfile();
    p.coins = 1000;
    const before = loadoutFor(p, p.players[0].lineup).raptor.stats.speed;
    const r = buyUpgrade(p, 'raptor-green', 'speed');
    expect(r.ok).toBe(true);
    expect(p.coins).toBe(1000 - UPGRADE_COSTS[0]);
    expect(p.dinos['raptor-green'].stats.speed).toBe(before + 1);
    expect(loadoutFor(p, p.players[0].lineup).raptor.stats.speed).toBe(1);
    expect(p.stats.upgradesBought).toBe(1);
  });

  it('refuses upgrades without coins or level', () => {
    const p = createDefaultProfile();
    p.coins = 10;
    expect(checkUpgrade(p, 'raptor-green', 'speed')).toMatchObject({ ok: false, reason: 'coins' });
    p.coins = 5000;
    buyUpgrade(p, 'raptor-green', 'speed');
    expect(checkUpgrade(p, 'raptor-green', 'speed')).toMatchObject({ ok: false, reason: 'level' });
    addXp(p.dinos['raptor-green'], 100);
    expect(checkUpgrade(p, 'raptor-green', 'speed').ok).toBe(true);
    expect(checkUpgrade(p, 'raptor-blue', 'speed')).toMatchObject({ ok: false, reason: 'missing' });
  });
});

describe('eggs (TEST 11)', () => {
  it('follows the predictable sequence and unlocks into the collection', () => {
    const p = createDefaultProfile();
    expect(openEgg(p)).toBeNull();
    p.eggs.pending = 3;
    const first = openEgg(p)!;
    expect(first.reward).toEqual(EGG_SEQUENCE[0]);
    expect(p.dinos['raptor-blue']).toBeDefined();
    expect(first.missions.map((m) => m.id)).toContain('unlockDino');
    const second = openEgg(p)!;
    expect(second.reward).toEqual(EGG_SEQUENCE[1]);
    expect(p.accessories).toContain('partyHat');
    expect(equipAccessory(p, 'raptor-blue', 'partyHat')).toBe(true);
    expect(p.dinos['raptor-blue'].accessory).toBe('partyHat');
    expect(p.eggs.pending).toBe(1);
  });

  it('gives coins after everything is unlocked', () => {
    const p = createDefaultProfile();
    p.eggs.pending = EGG_SEQUENCE.length + 2;
    for (let i = 0; i < EGG_SEQUENCE.length; i++) openEgg(p);
    expect(nextEggReward(p).kind).toBe('coins');
    const c = p.coins;
    openEgg(p);
    expect(p.coins).toBe(c + 150);
  });
});

describe('Dino Park (TEST 12)', () => {
  it('buy, place, move and remove decorations', () => {
    const p = createDefaultProfile();
    p.coins = 500;
    expect(buyDecoration(p, 'tree').ok).toBe(true);
    expect(p.coins).toBe(410);
    const placed = placeDecoration(p, 3, 'tree');
    expect(placed.ok).toBe(true);
    expect(p.park.cells[3]).toBe('tree');
    expect(p.park.inventory.tree).toBe(0);
    expect(placed.ok && placed.missions?.map((m) => m.id)).toContain('parkFirst');
    expect(placeDecoration(p, 3, 'flowers')).toMatchObject({ ok: false, reason: 'occupied' });
    expect(placeDecoration(p, 4, 'pond')).toMatchObject({ ok: false, reason: 'inventory' });
    expect(moveDecoration(p, 3, 10).ok).toBe(true);
    expect(p.park.cells[3]).toBeNull();
    expect(p.park.cells[10]).toBe('tree');
    expect(removeDecoration(p, 10).ok).toBe(true);
    expect(p.park.inventory.tree).toBe(1);
    p.coins = 100;
    expect(buyDecoration(p, 'volcano')).toMatchObject({ ok: false, reason: 'coins' });
    expect(p.coins).toBe(100);
  });
});

describe('save system (TEST 13)', () => {
  it('round-trips the profile', () => {
    const store = new MemStore();
    const save = defaultSave();
    save.profile.coins = 777;
    save.profile.park.cells[5] = 'pond';
    save.settings.music = false;
    writeSave(save, store);
    const loaded = loadSave(store);
    expect(loaded.profile.coins).toBe(777);
    expect(loaded.profile.park.cells[5]).toBe('pond');
    expect(loaded.settings.music).toBe(false);
  });

  it('survives corrupt data without crashing', () => {
    const store = new MemStore();
    store.setItem(SAVE_KEY, '{not json');
    const s = loadSave(store);
    expect(s.profile.coins).toBe(100);
    expect(store.getItem(SAVE_KEY + '.corrupt')).toBe('{not json');

    store.setItem(SAVE_KEY, JSON.stringify({ version: 2, profile: { coins: 'lots', dinos: { nope: {} }, park: { cells: 'x' } }, settings: 5 }));
    const s2 = loadSave(store);
    expect(s2.profile.coins).toBe(100);
    expect(s2.profile.dinos['raptor-green']).toBeDefined();
    expect(s2.profile.park.cells).toHaveLength(20);
  });

  it('migrates old versions', () => {
    const store = new MemStore();
    store.setItem(SAVE_KEY, JSON.stringify({ version: 1, profile: { coins: 50, parkCells: ['tree', null, 'pond'] } }));
    const s = loadSave(store);
    expect(s.version).toBe(2);
    expect(s.profile.coins).toBe(50);
    expect(s.profile.park.cells[0]).toBe('tree');
    expect(s.profile.park.cells[2]).toBe('pond');
  });

  it('repairs lineups that reference unknown dinos', () => {
    const store = new MemStore();
    const save = defaultSave();
    const prof = cloneProfile(save.profile) as unknown as Record<string, unknown>;
    (prof.players as { lineup: Record<string, string> }[])[0].lineup.raptor = 'raptor-gold';
    store.setItem(SAVE_KEY, JSON.stringify({ ...save, profile: prof }));
    expect(loadSave(store).profile.players[0].lineup.raptor).toBe('raptor-green');
  });
});

describe('missions', () => {
  it('reports progress', () => {
    const p = createDefaultProfile();
    p.stats.smashed = 4;
    const m = missionStatus(p).find((x) => x.def.id === 'smash10')!;
    expect(m.progress).toBe(4);
    expect(m.completed).toBe(false);
    p.stats.smashed = 12;
    expect(evaluateMissions(p).map((x) => x.id)).toContain('smash10');
    expect(evaluateMissions(p)).toHaveLength(0); // not twice
  });
});

describe('setup & cup', () => {
  it('lane layout keeps panels and lanes aligned', () => {
    expect(laneLayout(1)).toEqual(['a', 'a', 'h', 'a', 'a']);
    expect(laneLayout(2)).toEqual(['a', 'h', 'a', 'h', 'a']);
    expect(laneLayout(3)).toEqual(['h', 'a', 'h', 'a', 'h']);
  });

  it('TEST 14/15: builds 2 and 3 human races', () => {
    const p = createDefaultProfile();
    const two = buildParticipants({ ...solo, humans: 2, names: ['A', 'B'] }, p, 1);
    expect(two.map((x) => x.kind)).toEqual(['ai', 'human', 'ai', 'human', 'ai']);
    expect(two[3].name).toBe('B');
    const three = buildParticipants({ ...solo, humans: 3, names: ['A', 'B', 'C'] }, p, 1);
    expect(three).toHaveLength(5);
    expect(three.filter((x) => x.kind === 'human').map((x) => x.name)).toEqual(['A', 'B', 'C']);
    const one = buildParticipants(solo, p, 1);
    expect(one.filter((x) => x.kind === 'ai')).toHaveLength(4);
    expect(new Set(one.map((x) => x.name)).size).toBe(5);
    expect(buildRaceConfig({ ...solo, humans: 2, names: [] }, 1).normalizeStats).toBe(true);
    expect(buildRaceConfig({ ...solo, humans: 2, mode: 'team', names: [] }, 1).normalizeStats).toBe(false);
  });

  it('Dino Cup accumulates points over 5 races', () => {
    const profile = createDefaultProfile();
    const parts = buildParticipants({ ...solo, mode: 'cup' }, profile, 1);
    const cup = createCup('racer', 'volcano', 1, parts, 100);
    expect(cup.worlds).toEqual(['volcano', 'ice', 'islands', 'jungle', 'volcano']);
    for (let i = 0; i < 5; i++) {
      const { result } = playRace({ ...solo, mode: 'cup', worldId: cup.worlds[i] }, profile, 100 + i);
      recordCupRace(cup, result);
    }
    expect(cup.finished).toBe(true);
    const total = Object.values(cup.points).reduce((a, b) => a + b, 0);
    expect(total).toBe(5 * (10 + 7 + 5 + 3 + 1));
    const st = cupStandings(cup);
    expect(st[0].points).toBeGreaterThanOrEqual(st[1].points);
    profile.activeCup = cup;
    const r = completeCup(profile, cup);
    expect(profile.activeCup).toBeNull();
    expect(profile.stats.cupsCompleted).toBe(1);
    expect(profile.cupHistory).toHaveLength(1);
    expect(r.coins).toBeGreaterThan(0);
  });

  it('TEST 17: all six modes run to completion through the real setup', () => {
    for (const mode of ['classic', 'cup', 'trex', 'endless', 'goldRush', 'team'] as const) {
      const profile = createDefaultProfile();
      const { result } = playRace({ ...solo, mode }, profile, 5);
      expect(result.results).toHaveLength(5);
      const sum = applyRaceResult(profile, result);
      expect(sum.totalCoins).toBeGreaterThan(0);
      expect(profile.stats.modesPlayed).toContain(mode);
    }
  });
});
