import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/config/difficulty';
import { GAME_CONFIG } from '../src/config/gameConfig';
import { TERRAINS } from '../src/config/terrain';
import { WORLD_IDS } from '../src/config/worlds';
import { generateTrack, TrackGenerator, tutorialTrack } from '../src/game/trackGenerator';
import type { DifficultyId } from '../src/types';

const DIFFS: DifficultyId[] = ['small', 'racer', 'champion'];

describe('track generator', () => {
  it('is deterministic for the same seed', () => {
    const a = generateTrack({ seed: 42, worldId: 'jungle', difficulty: 'racer' });
    const b = generateTrack({ seed: 42, worldId: 'jungle', difficulty: 'racer' });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    const c = generateTrack({ seed: 43, worldId: 'jungle', difficulty: 'racer' });
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(c));
  });

  for (const world of WORLD_IDS) {
    for (const diff of DIFFS) {
      it(`produces a valid track for ${world}/${diff}`, () => {
        for (let seed = 1; seed <= 25; seed++) {
          const t = generateTrack({ seed, worldId: world, difficulty: diff });
          const d = DIFFICULTIES[diff];
          expect(t.length).toBe(d.trackLength);
          const segs = t.segments;
          expect(segs[0].startArea).toBe(true);
          expect(segs[0].start).toBe(0);
          expect(TERRAINS[segs[0].terrain].category).toBe('firm');
          const last = segs[segs.length - 1];
          expect(last.finish).toBe(true);
          expect(TERRAINS[last.terrain].category).toBe('firm');
          expect(last.end).toBeGreaterThan(t.length);
          // finish straight is at least 50 m long before the line
          expect(t.length - last.start).toBeGreaterThanOrEqual(50);
          const nominal = d.baseSpeed * GAME_CONFIG.suitabilityMultiplier.best;
          for (let i = 0; i < segs.length; i++) {
            const s = segs[i];
            expect(s.index).toBe(i);
            expect(s.end).toBeGreaterThan(s.start);
            if (i > 0) {
              expect(s.start).toBeCloseTo(segs[i - 1].end, 6);
              // never two identical terrains in a row
              expect(s.terrain).not.toBe(segs[i - 1].terrain);
            }
            expect(s.recommended).toBe(TERRAINS[s.terrain].best);
            // every segment lasts long enough to react
            if (!s.finish && !s.startArea) {
              expect((s.end - s.start) / nominal).toBeGreaterThanOrEqual(d.minSegmentTime - 1e-6);
            }
            if (TERRAINS[s.terrain].category === 'smash') {
              expect(s.obstacles.length).toBeGreaterThanOrEqual(2);
              for (const o of s.obstacles) {
                expect(o.at).toBeGreaterThan(s.start);
                expect(o.at).toBeLessThan(s.end);
              }
            }
            if (s.event) {
              expect(s.event.leadDistance).toBeGreaterThan(d.warningTime * nominal);
              const newBest = TERRAINS[s.event.newTerrain].best;
              expect(segs[i - 1].recommended).not.toBe(newBest);
              expect(segs[i + 1].recommended).not.toBe(newBest);
            }
          }
        }
      });
    }
  }

  it('starts with gentle terrains (no deep water / scree / ice in the intro)', () => {
    for (let seed = 1; seed < 40; seed++) {
      const t = generateTrack({ seed, worldId: 'ice', difficulty: 'small' });
      const introEnd = t.length * DIFFICULTIES.small.easyIntro;
      for (const s of t.segments.filter((x) => x.start < introEnd)) {
        expect(['deepWater', 'scree', 'ice']).not.toContain(s.terrain);
      }
    }
  });

  it('places dynamic events', () => {
    let events = 0;
    for (let seed = 1; seed < 30; seed++) {
      const t = generateTrack({ seed, worldId: 'jungle', difficulty: 'champion' });
      events += t.segments.filter((s) => s.event).length;
    }
    expect(events).toBeGreaterThan(20);
  });

  it('extends endless tracks on demand', () => {
    const g = new TrackGenerator({ seed: 7, worldId: 'islands', difficulty: 'racer', endless: true });
    expect(g.track.length).toBe(Infinity);
    const before = g.track.segments[g.track.segments.length - 1].end;
    g.extendTo(before + 2000);
    const after = g.track.segments[g.track.segments.length - 1].end;
    expect(after).toBeGreaterThanOrEqual(before + 2000);
    expect(g.track.segments.some((s) => s.finish)).toBe(false);
  });

  it('adds coin rows for Gold Rush', () => {
    const t = generateTrack({ seed: 3, worldId: 'jungle', difficulty: 'racer', coins: true });
    const coins = t.segments.reduce((a, s) => a + s.coins.length, 0);
    expect(coins).toBeGreaterThan(40);
  });

  it('tutorial track follows path → water → stones → mud', () => {
    const t = tutorialTrack();
    const terrains = t.segments.map((s) => s.terrain);
    expect(terrains.slice(0, 5)).toEqual(['path', 'grass', 'water', 'stones', 'mud']);
  });
});
