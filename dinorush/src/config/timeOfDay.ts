import type { TimeOfDay, WorldDefinition, WorldLook } from '../types';

/**
 * Time of day and storms. A race keeps its world's character (colours of
 * the ground, plants, mountains) but the sky, fog and light change:
 * a warm low sun at sunset, a bright moon, stars and fireflies at night,
 * dark clouds, rain and distant lightning in a storm.
 */

export const TIME_INFO: Record<TimeOfDay, { name: string; icon: string }> = {
  day: { name: 'Den', icon: 'sun' },
  sunset: { name: 'Západ slunce', icon: 'sunset' },
  night: { name: 'Noc', icon: 'moon' },
};

export const STORM_INFO = { name: 'Bouřka', icon: 'storm' };

/** What a child sees on the place card and before the start (null for a plain day). */
export function skyLabel(look: WorldLook | undefined): { name: string; icon: string; intro: string } | null {
  if (look?.weather === 'storm') return { ...STORM_INFO, intro: 'Bouřka! Prší a v dálce se blýská' };
  if (look?.time === 'sunset') return { ...TIME_INFO.sunset, intro: 'Závod při západu slunce' };
  if (look?.time === 'night') return { ...TIME_INFO.night, intro: 'Noční závod – cestu svítí lucerničky' };
  return null;
}

/** Quick races and daily challenges: mostly day, sometimes sunset, now and then a night race. */
export function timeForSeed(seed: number): TimeOfDay {
  const r = (((Math.abs(Math.floor(seed)) * 9301 + 49297) % 233280) + 233280) % 233280 / 233280;
  return r < 0.55 ? 'day' : r < 0.83 ? 'sunset' : 'night';
}

/** Mix two 0xRRGGBB colours (t = 0 → a, 1 → b). */
export function mixHex(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

/** The world's look at the given time of day (and in a storm). */
export function applyTimeOfDay(world: WorldDefinition, time: TimeOfDay = 'day'): WorldDefinition {
  let w = world;
  if (w.weather === 'storm') {
    w = {
      ...w,
      sky: { top: mixHex(w.sky.top, 0x3b4655, 0.8), bottom: mixHex(w.sky.bottom, 0x75807f, 0.8) },
      fog: mixHex(w.fog, 0x66726d, 0.7),
      fogNear: Math.min(w.fogNear, 30),
      fogFar: Math.min(w.fogFar, 135),
      ambient: mixHex(w.ambient, 0xc7d0d8, 0.6),
      sunIntensity: w.sunIntensity * 0.55,
    };
  }
  if (time === 'sunset') {
    return {
      ...w,
      sky: { top: mixHex(w.sky.top, 0x3d3b8e, 0.65), bottom: mixHex(w.sky.bottom, 0xffa060, 0.75) },
      fog: mixHex(w.fog, 0xf0a070, 0.68),
      ambient: mixHex(w.ambient, 0xffb98a, 0.7),
      sun: 0xff9445,
      sunIntensity: w.sunIntensity * 0.95,
    };
  }
  if (time === 'night') {
    return {
      ...w,
      sky: { top: 0x070f2b, bottom: mixHex(w.sky.bottom, 0x1f3a6b, 0.88) },
      fog: mixHex(w.fog, 0x1b2f55, 0.85),
      fogFar: w.fogFar * 1.05,
      ambient: 0x8aa6ff,
      sun: 0xc4d8ff,
      sunIntensity: 1.3,
    };
  }
  return w;
}
