import { describe, expect, it } from 'vitest';
import { RaceEngine } from '../src/game/raceEngine';
import type { AIProfileId, DifficultyId } from '../src/types';
import { ai, config, human, lazyBot, perfectBot, simulate, wrongBot } from './helpers';

describe('AI opponents', () => {
  it('make decisions with roughly their configured accuracy', () => {
    const stats: Record<AIProfileId, [number, number]> = { baby: [0, 0], rookie: [0, 0], beginner: [0, 0], advanced: [0, 0], champion: [0, 0] };
    for (let seed = 1; seed <= 12; seed++) {
      const e = new RaceEngine(config({ seed }), [ai('ai0', 'beginner'), ai('ai1', 'advanced'), ai('ai2', 'champion')]);
      simulate(e, {});
      for (const [id, prof] of [['ai0', 'beginner'], ['ai1', 'advanced'], ['ai2', 'champion']] as const) {
        const c = e.ai.get(id)!;
        stats[prof][0] += c.correctDecisions;
        stats[prof][1] += c.decisions;
      }
    }
    const acc = (p: AIProfileId) => stats[p][0] / stats[p][1];
    expect(acc('beginner')).toBeGreaterThan(0.6);
    expect(acc('beginner')).toBeLessThan(0.8);
    expect(acc('advanced')).toBeGreaterThan(0.77);
    expect(acc('advanced')).toBeLessThan(0.92);
    expect(acc('champion')).toBeGreaterThan(0.88);
  });

  it('stronger AI wins more often, results come from the simulation', () => {
    let champWins = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const e = new RaceEngine(config({ seed }), [ai('ai0', 'beginner'), ai('ai1', 'champion'), ai('ai2', 'beginner')]);
      simulate(e, {});
      if (e.getResult().results[0].id === 'ai1') champWins++;
    }
    expect(champWins).toBeGreaterThanOrEqual(7);
  });

  it('AI builds combos and uses abilities', () => {
    const e = new RaceEngine(config({ seed: 3 }), [ai('ai0', 'champion')]);
    simulate(e, {});
    const p = e.state.participants[0];
    expect(p.maxCombo).toBeGreaterThanOrEqual(3);
    expect(p.abilitiesUsed).toBeGreaterThan(0);
    expect(p.finished).toBe(true);
  });

  it('race durations stay in the 90–150 s band for typical play', () => {
    const diffs: DifficultyId[] = ['small', 'racer', 'champion'];
    for (const difficulty of diffs) {
      const times: number[] = [];
      for (let seed = 1; seed <= 6; seed++) {
        const e = new RaceEngine(config({ seed, difficulty }), [human('a', 0), ai('ai0', 'advanced'), ai('ai1', 'beginner')]);
        simulate(e, { a: perfectBot });
        for (const p of e.state.participants) times.push(p.finishTime!);
      }
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avg).toBeGreaterThan(85);
      expect(avg).toBeLessThan(150);
    }
  });
});

describe('game modes', () => {
  it('classic: race ends once humans finish and AI gets an estimated time', () => {
    const e = new RaceEngine(config({ seed: 8 }), [human('a', 0), ai('ai0', 'beginner')]);
    simulate(e, { a: perfectBot });
    expect(e.state.phase).toBe('finished');
    const r = e.getResult();
    expect(r.results.every((x) => x.finishTime !== null)).toBe(true);
  });

  it('T-Rex catches a lazy racer but not a perfect one', () => {
    const e = new RaceEngine(config({ mode: 'trex', seed: 4 }), [human('good', 0), human('lazy', 1)]);
    const catches: string[] = [];
    e.onEvent = (ev) => ev.type === 'trexCatch' && catches.push(ev.participantId!);
    simulate(e, { good: perfectBot, lazy: wrongBot });
    expect(catches).toEqual(['lazy']);
    const r = e.getResult();
    expect(r.results[0].id).toBe('good');
    expect(r.results[0].caught).toBe(false);
    expect(r.results[0].stars).toBeGreaterThanOrEqual(2);
    expect(r.results[1].caught).toBe(true);
    expect(r.results[1].stars).toBe(1);
    // caught racer still finishes – no elimination
    expect(e.state.participants.find((p) => p.id === 'lazy')!.finished).toBe(true);
  });

  it('T-Rex gap grows with correct play and shrinks with mistakes', () => {
    const e = new RaceEngine(config({ mode: 'trex', seed: 4 }), [human('good', 0), human('bad', 1)]);
    for (let i = 0; i < 60 * 25; i++) {
      for (const p of e.state.participants) if (e.state.phase === 'racing') (p.id === 'good' ? perfectBot : wrongBot)(e, p);
      e.step(1 / 60);
    }
    const t = e.state.trex!;
    const good = e.state.participants[0];
    const bad = e.state.participants[1];
    expect(good.position - t.position).toBeGreaterThan(32);
    expect(bad.position - t.position).toBeLessThan(32);
  });

  it('endless: never finishes on its own, ramps up, can be ended by the player', () => {
    const e = new RaceEngine(config({ mode: 'endless', seed: 2 }), [human('a', 0), ai('ai0', 'advanced')]);
    for (let i = 0; i < 60 * 150; i++) {
      perfectBot(e, e.state.participants[0]);
      e.step(1 / 60);
    }
    expect(e.state.phase).toBe('racing');
    expect(e.state.ramp).toBeGreaterThan(1.1);
    const p = e.state.participants[0];
    expect(p.position).toBeGreaterThan(1700);
    expect(p.score).toBeGreaterThan(p.position);
    e.endByPlayer();
    expect(e.state.phase).toBe('finished');
    expect(e.getResult().results[0].score).toBe(p.score);
  });

  it('gold rush: coins come from correct choices and decide the winner', () => {
    const e = new RaceEngine(config({ mode: 'goldRush', seed: 6 }), [human('good', 0), human('bad', 1)]);
    simulate(e, { good: perfectBot, bad: wrongBot });
    const r = e.getResult();
    expect(r.results[0].id).toBe('good');
    expect(r.results[0].coins).toBeGreaterThan(50);
    expect(r.results[1].coins).toBeLessThan(r.results[0].coins / 3);
  });

  it('gold rush ranks by coins, not by finishing first', () => {
    const e = new RaceEngine(config({ mode: 'goldRush', seed: 6 }), [human('a', 0), human('b', 1)]);
    simulate(e, { a: perfectBot, b: perfectBot });
    const ps = e.state.participants;
    ps[1].coins = ps[0].coins + 10; // b has more coins
    const order = e.rules.finalOrder(e).map((p) => p.id);
    expect(order[0]).toBe('b');
  });

  it('team: shared score and team turbo, outcome vs rival', () => {
    const e = new RaceEngine(config({ mode: 'team', seed: 9 }), [human('a', 0), human('b', 1), human('c', 2)]);
    const evs: string[] = [];
    e.onEvent = (ev) => evs.push(ev.type);
    simulate(e, { a: perfectBot, b: perfectBot, c: perfectBot });
    expect(evs).toContain('teamTurbo');
    const r = e.getResult();
    expect(r.teamScore).toBeGreaterThan(300);
    expect(r.teamWon).toBe(true);

    const e2 = new RaceEngine(config({ mode: 'team', seed: 9 }), [human('a', 0), human('b', 1), human('c', 2)]);
    simulate(e2, { a: wrongBot, b: lazyBot, c: wrongBot });
    expect(e2.getResult().teamWon).toBe(false);
  });

  it('competitive multiplayer normalises RPG stats', () => {
    const strong = human('a', 0);
    strong.loadout.raptor.stats = { speed: 5, transform: 5, stamina: 5 };
    strong.loadout.raptor.level = 10;
    const e = new RaceEngine(config({ normalizeStats: true }), [strong, human('b', 1)]);
    expect(e.state.participants[0].loadout.raptor.stats.speed).toBe(0);
    expect(e.state.participants[0].loadout.raptor.level).toBe(1);
    const solo = new RaceEngine(config({ normalizeStats: false }), [strong]);
    expect(solo.state.participants[0].loadout.raptor.stats.speed).toBe(5);
  });
});
