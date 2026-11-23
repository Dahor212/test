import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/config/gameConfig';
import { terrainMultiplier } from '../src/game/physics';
import { RaceEngine } from '../src/game/raceEngine';
import { nextChange } from '../src/game/track';
import { DIFFICULTIES } from '../src/config/difficulty';
import { baseLoadout } from '../src/progression/rpg';
import type { TrackDefinition } from '../src/types';
import { config, human, lazyBot, perfectBot, simulate, wrongBot } from './helpers';

const C = GAME_CONFIG;

/** grass(start) → water → grass(finish) */
function simpleTrack(): TrackDefinition {
  return {
    seed: 1,
    worldId: 'jungle',
    difficulty: 'racer',
    length: 260,
    endless: false,
    segments: [
      { index: 0, start: 0, end: 80, terrain: 'grass', recommended: 'raptor', obstacles: [], coins: [], startArea: true },
      { index: 1, start: 80, end: 140, terrain: 'water', recommended: 'spino', obstacles: [], coins: [] },
      {
        index: 2,
        start: 140,
        end: 180,
        terrain: 'stones',
        recommended: 'ankylo',
        obstacles: [
          { at: 150, kind: 'rockPile' },
          { at: 165, kind: 'boulder' },
        ],
        coins: [],
      },
      { index: 3, start: 180, end: 305, terrain: 'grass', recommended: 'raptor', obstacles: [], coins: [], finish: true },
    ],
  };
}

function runUntil(e: RaceEngine, cond: () => boolean, maxSteps = 60 * 400) {
  for (let i = 0; i < maxSteps && !cond(); i++) e.step(C.fixedStep);
}

describe('physics multipliers', () => {
  const diff = DIFFICULTIES.racer;
  it('correct dino is faster than wrong dino on water', () => {
    const l = baseLoadout();
    const best = terrainMultiplier('water', l.spino, diff).multiplier;
    const bad = terrainMultiplier('water', l.raptor, diff).multiplier;
    const awful = terrainMultiplier('deepWater', l.raptor, diff).multiplier;
    expect(best).toBeCloseTo(1.15);
    expect(bad).toBeCloseTo(0.45);
    expect(awful).toBeCloseTo(0.32);
  });
  it('easy difficulty softens penalties', () => {
    const l = baseLoadout();
    expect(terrainMultiplier('water', l.raptor, DIFFICULTIES.small).multiplier).toBeGreaterThan(0.6);
  });
  it('stats improve speed and reduce penalties, capped', () => {
    const l = baseLoadout();
    const up = { ...l.spino, stats: { speed: 5, transform: 5, stamina: 5 }, level: 10 };
    expect(terrainMultiplier('water', up, diff).multiplier).toBeGreaterThan(1.15);
    expect(terrainMultiplier('water', up, diff).multiplier / 1.15 - 1).toBeLessThanOrEqual(C.rpg.maxTotalBonus + 1e-9);
    const upR = { ...l.raptor, stats: { speed: 0, transform: 0, stamina: 5 }, level: 1 };
    expect(terrainMultiplier('water', upR, diff).multiplier).toBeGreaterThan(0.45);
  });
});

describe('race engine', () => {
  it('counts down 3-2-1 and starts', () => {
    const e = new RaceEngine(config(), [human('a', 0)], simpleTrack());
    const events = e.update(0.05);
    expect(events.find((x) => x.type === 'countdown')?.value).toBe(3);
    const all = [];
    for (let i = 0; i < 80; i++) all.push(...e.update(0.05));
    expect(all.filter((x) => x.type === 'countdown').map((x) => x.value)).toEqual([2, 1]);
    expect(all.some((x) => x.type === 'start')).toBe(true);
    expect(e.state.phase).toBe('racing');
  });

  it('moves automatically and reaches ~base speed', () => {
    const e = new RaceEngine(config(), [human('a', 0)], simpleTrack());
    runUntil(e, () => e.state.time > 4);
    const p = e.state.participants[0];
    expect(p.position).toBeGreaterThan(30);
    expect(p.speed).toBeGreaterThan(11);
  });

  it('TEST 3/4: switching to Spinosaurus before water keeps speed, wrong dino slows down', () => {
    const good = new RaceEngine(config(), [human('a', 0)], simpleTrack());
    const bad = new RaceEngine(config(), [human('a', 0)], simpleTrack());
    runUntil(good, () => good.state.participants[0].position > 72);
    good.requestSwitch('a', 'spino');
    runUntil(good, () => good.state.participants[0].position > 110);
    runUntil(bad, () => bad.state.participants[0].position > 110);
    const g = good.state.participants[0];
    const b = bad.state.participants[0];
    expect(g.current).toBe('spino');
    expect(b.current).toBe('raptor');
    expect(g.speed).toBeGreaterThan(11.5);
    expect(b.speed).toBeLessThan(7.5);
    expect(g.speed / b.speed).toBeGreaterThan(1.6);
  });

  it('applies the switch cooldown', () => {
    const e = new RaceEngine(config(), [human('a', 0)], simpleTrack());
    runUntil(e, () => e.state.time > 1);
    expect(e.requestSwitch('a', 'spino')).toBe(true);
    expect(e.requestSwitch('a', 'trike')).toBe(false);
    runUntil(e, () => e.state.participants[0].sinceSwitch > C.switchCooldown + 0.01);
    expect(e.requestSwitch('a', 'trike')).toBe(true);
  });

  it('TEST 5: perfect transformation inside the window, normal bonus when early', () => {
    const e = new RaceEngine(config(), [human('a', 0)], simpleTrack());
    const evs: string[] = [];
    e.onEvent = (ev) => evs.push(ev.type);
    // 0.5 s before water
    runUntil(e, () => {
      const p = e.state.participants[0];
      return (80 - p.position) / p.speed <= 0.5;
    });
    e.requestSwitch('a', 'spino');
    expect(evs).toContain('perfect');
    expect(e.state.participants[0].perfects).toBe(1);
    expect(e.state.participants[0].perfectBoost).toBeGreaterThan(0);

    const early = new RaceEngine(config(), [human('a', 0)], simpleTrack());
    const evs2: string[] = [];
    early.onEvent = (ev) => evs2.push(ev.type);
    runUntil(early, () => early.state.participants[0].position > 60);
    early.requestSwitch('a', 'spino'); // ~1.7 s early: no perfect …
    expect(evs2).not.toContain('perfect');
    early.step(C.fixedStep);
    const p = early.state.participants[0];
    expect(p.prepared).toBe(true);
    runUntil(early, () => early.state.participants[0].position > 79);
    // … but never slowed down for reacting early
    expect(early.state.participants[0].speed).toBeGreaterThan(10.5);
    runUntil(early, () => early.state.participants[0].position > 141);
    expect(evs2).toContain('segmentSuccess');
    expect(early.state.participants[0].mistakes).toBe(0);
  });

  it('TEST 6: combo after three correct segments activates turbo', () => {
    const e = new RaceEngine(config(), [human('a', 0)], simpleTrack());
    const evs: { type: string; value?: number }[] = [];
    e.onEvent = (ev) => evs.push(ev);
    simulate(e, { a: perfectBot });
    const combo = evs.find((x) => x.type === 'combo');
    expect(combo?.value).toBe(3);
    expect(evs.some((x) => x.type === 'turbo')).toBe(true);
    expect(e.state.participants[0].maxCombo).toBeGreaterThanOrEqual(4);
  });

  it('combo is based on segments, not button presses', () => {
    const e = new RaceEngine(config(), [human('a', 0)], simpleTrack());
    runUntil(e, () => e.state.time > 0.2);
    for (let i = 0; i < 10; i++) {
      e.requestSwitch('a', i % 2 ? 'raptor' : 'trike');
      runUntil(e, () => e.state.participants[0].sinceSwitch > 0.35);
    }
    expect(e.state.participants[0].combo).toBeLessThanOrEqual(1);
  });

  it('mistake breaks the combo and never stops the racer', () => {
    const e = new RaceEngine(config(), [human('a', 0)], simpleTrack());
    simulate(e, { a: wrongBot });
    const p = e.state.participants[0];
    expect(p.finished).toBe(true);
    expect(p.mistakes).toBeGreaterThan(2);
    expect(p.climbed).toBe(2);
    expect(e.state.time).toBeLessThan(120);
  });

  it('TEST 7: special ability activates automatically', () => {
    const e = new RaceEngine(config({ seed: 99 }), [human('a', 0)]);
    const evs: { type: string; archetype?: string }[] = [];
    e.onEvent = (ev) => evs.push(ev);
    simulate(e, { a: perfectBot });
    const acts = evs.filter((x) => x.type === 'abilityActivated');
    expect(acts.length).toBeGreaterThan(0);
  });

  it('ankylosaurus smashes obstacles, others climb', () => {
    const e = new RaceEngine(config(), [human('a', 0), human('b', 1)], simpleTrack());
    simulate(e, { a: perfectBot, b: lazyBot });
    const [a, b] = e.state.participants;
    expect(a.smashed).toBe(2);
    expect(b.climbed).toBe(2);
  });

  it('TEST 8: finishing order follows real simulated speed', () => {
    const e = new RaceEngine(config({ seed: 5 }), [human('good', 0), human('lazy', 1), human('wrong', 2)]);
    simulate(e, { good: perfectBot, lazy: lazyBot, wrong: wrongBot });
    const res = e.getResult();
    expect(res.results.map((r) => r.id)).toEqual(['good', 'lazy', 'wrong']);
    const times = res.results.map((r) => r.finishTime!);
    expect(times[0]).toBeLessThan(times[1]);
    expect(times[1]).toBeLessThan(times[2]);
    // standard race lasts roughly 90–150 s
    expect(times[0]).toBeGreaterThan(80);
    expect(times[0]).toBeLessThan(150);
  });

  it('is deterministic for identical input', () => {
    const run = () => {
      const e = new RaceEngine(config({ seed: 77 }), [human('a', 0), { ...human('x', -1), kind: 'ai', aiProfile: 'advanced', id: 'ai0' }]);
      simulate(e, { a: perfectBot });
      return e.getResult().results.map((r) => [r.id, r.finishTime?.toFixed(4)]);
    };
    expect(run()).toEqual(run());
  });

  it('time-scale only slows the simulation (tutorial)', () => {
    const e = new RaceEngine(config(), [human('a', 0)], simpleTrack());
    e.state.timeScale = 0.25;
    for (let i = 0; i < 60; i++) e.update(1 / 60);
    expect(e.state.countdown).toBeGreaterThan(2.7);
  });

  it('clamps huge frame deltas (tab switching)', () => {
    const e = new RaceEngine(config(), [human('a', 0)], simpleTrack());
    e.update(30);
    expect(e.state.countdown).toBeGreaterThan(2.8);
  });

  it('dynamic events change upcoming terrain before anybody reaches it', () => {
    let seen = 0;
    for (let seed = 1; seed < 15; seed++) {
      const e = new RaceEngine(config({ seed, difficulty: 'champion' }), [human('a', 0)]);
      const evSegs: number[] = [];
      e.onEvent = (ev) => {
        if (ev.type === 'dynamicEvent') {
          evSegs.push(ev.segmentIndex!);
          const seg = e.state.track.segments[ev.segmentIndex!];
          const p = e.state.participants[0];
          // racer has at least the warning window + margin left
          expect(seg.start - p.position).toBeGreaterThan(DIFFICULTIES.champion.warningTime * p.speed);
        }
      };
      simulate(e, { a: perfectBot });
      seen += evSegs.length;
    }
    expect(seen).toBeGreaterThan(10);
  });

  it('warnings are emitted ahead of each change', () => {
    const e = new RaceEngine(config({ seed: 11 }), [human('a', 0)]);
    const warns: number[] = [];
    e.onEvent = (ev) => {
      if (ev.type === 'warning') {
        const p = e.state.participants[0];
        const seg = e.state.track.segments[ev.segmentIndex!];
        warns.push((seg.start - p.position) / Math.max(p.speed, 1));
      }
    };
    simulate(e, { a: perfectBot });
    expect(warns.length).toBeGreaterThan(8);
    for (const w of warns) expect(w).toBeGreaterThan(1.8);
  });

  it('a perfect switch is never physically impossible (every change is reachable)', () => {
    for (let seed = 1; seed < 20; seed++) {
      const e = new RaceEngine(config({ seed, difficulty: 'champion' }), [human('a', 0)]);
      simulate(e, { a: perfectBot });
      const p = e.state.participants[0];
      expect(p.mistakes).toBe(0);
      // the perfect bot gets a perfect almost every change
      const changes = e.state.track.segments.filter((s, i) => i > 0 && s.recommended !== e.state.track.segments[i - 1].recommended).length;
      expect(p.perfects).toBeGreaterThanOrEqual(Math.floor(changes * 0.8));
    }
  });

  it('nextChange skips segments with the same dino', () => {
    const t = simpleTrack();
    t.segments[1] = { ...t.segments[1], terrain: 'path', recommended: 'raptor' };
    expect(nextChange(t, 0)?.index).toBe(2);
  });
});
