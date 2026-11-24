import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVELS, LEVEL_BY_ID } from '../src/config/campaign';
import { applyTimeOfDay, mixHex, skyLabel, timeForSeed } from '../src/config/timeOfDay';
import { WORLDS } from '../src/config/worlds';
import { buildRaceConfig } from '../src/game/setup';
import { levelRaceConfig } from '../src/progression/campaign';
import type { RaceSetup, TimeOfDay } from '../src/types';

describe('time of day and weather', () => {
  it('gives quick races mostly daylight, some sunsets and a few night races', () => {
    const n: Record<TimeOfDay, number> = { day: 0, sunset: 0, night: 0 };
    for (let s = 1; s <= 3000; s++) n[timeForSeed(s * 7919)]++;
    expect(n.day / 3000).toBeGreaterThan(0.45);
    expect(n.sunset / 3000).toBeGreaterThan(0.18);
    expect(n.night / 3000).toBeGreaterThan(0.08);
    expect(n.night).toBeLessThan(n.sunset);
    // the same seed is always the same time of day (replays look the same)
    expect(timeForSeed(12345)).toBe(timeForSeed(12345));
  });

  it('puts the time into quick race configs but keeps the tutorial in daylight', () => {
    const setup: RaceSetup = { mode: 'classic', humans: 1, names: ['A'], worldId: 'jungle', difficulty: 'racer' };
    expect(buildRaceConfig(setup, 42).look?.time).toBe(timeForSeed(42));
    expect(buildRaceConfig(setup, 42, true).look).toBeUndefined();
  });

  it('changes the sky and light but keeps the ground of the world', () => {
    for (const w of Object.values(WORLDS)) {
      const night = applyTimeOfDay(w, 'night');
      const sunset = applyTimeOfDay(w, 'sunset');
      expect(night.ground).toBe(w.ground);
      expect(sunset.ground2).toBe(w.ground2);
      expect(night.sky.top).not.toBe(w.sky.top);
      expect(sunset.fog).not.toBe(w.fog);
      expect(applyTimeOfDay(w, 'day')).toBe(w);
    }
    const storm = applyTimeOfDay({ ...WORLDS.jungle, weather: 'storm' }, 'day');
    expect(storm.sunIntensity).toBeLessThan(WORLDS.jungle.sunIntensity);
    expect(storm.fogFar).toBeLessThanOrEqual(135);
    expect(mixHex(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });

  it('dresses some career places in sunset, night and a storm – first places stay in daylight', () => {
    const looks = CAMPAIGN_LEVELS.map((l) => l.look ?? {});
    expect(looks.filter((l) => l.time === 'sunset').length).toBeGreaterThanOrEqual(4);
    expect(looks.filter((l) => l.time === 'night').length).toBeGreaterThanOrEqual(4);
    expect(LEVEL_BY_ID['swamp-5'].look?.weather).toBe('storm');
    for (const id of ['jungle-1', 'jungle-2', 'jungle-3', 'swamp-1', 'canyon-1']) expect(skyLabel(LEVEL_BY_ID[id].look)).toBeNull();
    // the place look (with its time) reaches the race
    expect(levelRaceConfig(LEVEL_BY_ID['swamp-4'], 'racer').look?.time).toBe('night');
    expect(skyLabel(LEVEL_BY_ID['swamp-5'].look)?.name).toBe('Bouřka');
    // region looks survive (swamp scenery under the night sky)
    expect(LEVEL_BY_ID['swamp-4'].look?.scenery).toBe('swamp');
  });
});
