import type { Archetype, GhostData } from '../types';

const TO_LETTER: Record<Archetype, string> = { raptor: 'r', spino: 's', ankylo: 'a', trike: 't' };
const FROM_LETTER: Record<string, Archetype> = { r: 'raptor', s: 'spino', a: 'ankylo', t: 'trike' };

/** Seconds of race time between two stored ghost samples. */
export const GHOST_DT = 0.5;

/**
 * Records one racer's run (position + dinosaur) on a fixed time grid.
 * Fed with race time after every simulation step; stores compact integers.
 */
export class GhostRecorder {
  private pos: number[] = [];
  private arch = '';
  private lastT = -1;
  private lastP = 0;

  constructor(readonly dt = GHOST_DT) {}

  /** Race time t (s), position (m), current dinosaur. */
  sample(t: number, position: number, archetype: Archetype) {
    if (t < 0) return;
    if (this.pos.length === 0) {
      this.pos.push(Math.round(position * 10));
      this.arch += TO_LETTER[archetype];
      this.lastT = t;
      this.lastP = position;
      return;
    }
    // fill every grid point passed since the previous sample (linear in between)
    let next = this.pos.length * this.dt;
    while (next <= t) {
      const f = t > this.lastT ? (next - this.lastT) / (t - this.lastT) : 1;
      const p = this.lastP + (position - this.lastP) * Math.max(0, Math.min(1, f));
      this.pos.push(Math.round(p * 10));
      this.arch += TO_LETTER[archetype];
      next = this.pos.length * this.dt;
    }
    this.lastT = t;
    this.lastP = position;
  }

  get samples(): number {
    return this.pos.length;
  }

  finish(finishTime: number, name: string, now = Date.now()): GhostData | null {
    if (this.pos.length < 2 || !(finishTime > 0)) return null;
    return { v: 1, dt: this.dt, pos: [...this.pos], arch: this.arch, time: Math.round(finishTime * 100) / 100, name, at: now };
  }
}

/** Plays a recorded ghost back: position / dinosaur at any race time. */
export class GhostPlayer {
  constructor(readonly data: GhostData) {}

  get finishTime(): number {
    return this.data.time;
  }

  positionAt(t: number): number {
    const { pos, dt } = this.data;
    if (t <= 0) return pos[0] / 10;
    const f = t / dt;
    const i = Math.floor(f);
    if (i >= pos.length - 1) {
      // after the recording ends the ghost keeps jogging past the finish
      const last = pos[pos.length - 1] / 10;
      const prev = pos[pos.length - 2] / 10;
      const v = Math.max(0, (last - prev) / dt) * 0.5;
      return last + v * Math.min(6, t - (pos.length - 1) * dt);
    }
    const a = pos[i] / 10;
    const b = pos[i + 1] / 10;
    return a + (b - a) * (f - i);
  }

  speedAt(t: number): number {
    return Math.max(0, (this.positionAt(t + 0.25) - this.positionAt(t - 0.25)) / 0.5);
  }

  archAt(t: number): Archetype {
    const { arch, dt } = this.data;
    const i = Math.max(0, Math.min(arch.length - 1, Math.round(t / dt)));
    return FROM_LETTER[arch[i]] ?? 'raptor';
  }

  /** Race time at which the ghost reached `position` (for time gaps). */
  timeAt(position: number): number {
    const { pos, dt } = this.data;
    const target = position * 10;
    if (target <= pos[0]) return 0;
    let lo = 0;
    let hi = pos.length - 1;
    if (target >= pos[hi]) return this.data.time;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pos[mid] < target) lo = mid;
      else hi = mid;
    }
    const a = pos[lo];
    const b = pos[hi];
    const f = b > a ? (target - a) / (b - a) : 0;
    return (lo + f) * dt;
  }
}

export function ghostKeyCampaign(levelId: string, difficulty: string): string {
  return `c:${levelId}:${difficulty}`;
}

export function ghostKeyDaily(key: string, difficulty: string): string {
  return `d:${key}:${difficulty}`;
}

export function ghostKeyReplay(seed: number, world: string, difficulty: string, mode: string): string {
  return `r:${seed}:${world}:${difficulty}:${mode}`;
}
