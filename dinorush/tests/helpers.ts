import { RaceEngine, type ParticipantSetup } from '../src/game/raceEngine';
import { nextChange } from '../src/game/track';
import { baseLoadout } from '../src/progression/rpg';
import type { AIProfileId, Archetype, RaceConfig, RaceEvent, RaceParticipant } from '../src/types';

export function human(id: string, seat: number, start?: Archetype): ParticipantSetup {
  return { id, name: id, color: '#ff0000', kind: 'human', seat, loadout: baseLoadout(), start };
}

export function ai(id: string, profile: AIProfileId): ParticipantSetup {
  return { id, name: id, color: '#00ff00', kind: 'ai', seat: -1, aiProfile: profile, loadout: baseLoadout() };
}

export function config(partial: Partial<RaceConfig> = {}): RaceConfig {
  return { mode: 'classic', difficulty: 'racer', worldId: 'jungle', seed: 1234, normalizeStats: false, ...partial };
}

export type Bot = (e: RaceEngine, p: RaceParticipant) => void;

/** Switches inside the perfect window (0.6 s before each change). */
export const perfectBot: Bot = (e, p) => {
  const seg = e.state.track.segments[p.segmentIndex];
  if (p.current !== seg.recommended && !p.prepared) e.requestSwitch(p.id, seg.recommended);
  const n = nextChange(e.state.track, p.segmentIndex);
  if (n) {
    const ttc = (n.start - p.position) / Math.max(1, p.speed);
    if (ttc <= 0.6) e.requestSwitch(p.id, n.recommended);
  }
};

/** Never changes dino. */
export const lazyBot: Bot = () => {};

/** Always one wrong dino. */
export const wrongBot: Bot = (e, p) => {
  const seg = e.state.track.segments[p.segmentIndex];
  if (p.current === seg.recommended) {
    const wrong: Archetype = seg.recommended === 'spino' ? 'raptor' : 'spino';
    e.requestSwitch(p.id, wrong);
  }
};

export interface SimOutcome {
  engine: RaceEngine;
  events: RaceEvent[];
}

/** Runs a full race with bots controlling human participants. */
export function simulate(engine: RaceEngine, bots: Record<string, Bot>, maxSeconds = 600, dt = 1 / 30): SimOutcome {
  const events: RaceEvent[] = [];
  let t = 0;
  while (engine.state.phase !== 'finished' && t < maxSeconds) {
    for (const p of engine.state.participants) {
      const bot = bots[p.id];
      if (bot && engine.state.phase === 'racing' && !p.finished) bot(engine, p);
    }
    events.push(...engine.update(dt));
    t += dt;
  }
  return { engine, events };
}
