import { AI_COLORS, AI_NAMES, DIFFICULTIES, PLAYER_COLORS } from '../config/difficulty';
import { Rng } from '../core/rng';
import { baseLoadout, loadoutFor } from '../progression/rpg';
import type { PlayerProfile, RaceConfig, RaceSetup } from '../types';
import type { ParticipantSetup } from './raceEngine';

/**
 * Five racers share the trail. Positions keep panels and racers in the
 * same left→right order:
 * 1 human: AI AI P1 AI AI,  2 humans: AI P1 AI P2 AI,  3 humans: P1 AI P2 AI P3.
 */
export function laneLayout(humans: number): ('h' | 'a')[] {
  if (humans >= 3) return ['h', 'a', 'h', 'a', 'h'];
  if (humans === 2) return ['a', 'h', 'a', 'h', 'a'];
  return ['a', 'a', 'h', 'a', 'a'];
}

export function buildParticipants(setup: RaceSetup, profile: PlayerProfile, seed: number): ParticipantSetup[] {
  const diff = DIFFICULTIES[setup.difficulty];
  const rng = new Rng(seed ^ 0x5bd1e995);
  const names = [...AI_NAMES];
  // deterministic shuffle of AI names
  for (let i = names.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [names[i], names[j]] = [names[j], names[i]];
  }
  const layout = laneLayout(setup.humans);
  let seat = 0;
  let ai = 0;
  return layout.map((kind) => {
    if (kind === 'h') {
      const s = seat++;
      const player = profile.players[s];
      return {
        id: `p${s}`,
        name: (setup.names[s] || player?.name || `Hráč ${s + 1}`).slice(0, 14),
        color: player?.color ?? PLAYER_COLORS[s],
        kind: 'human',
        seat: s,
        loadout: loadoutFor(profile, player.lineup),
      } satisfies ParticipantSetup;
    }
    const a = ai++;
    return {
      id: `ai${a}`,
      name: names[a],
      color: AI_COLORS[a],
      kind: 'ai',
      seat: -1,
      aiProfile: diff.aiProfiles[a % diff.aiProfiles.length],
      loadout: baseLoadout(),
    } satisfies ParticipantSetup;
  });
}

export function buildRaceConfig(setup: RaceSetup, seed: number, tutorial = false): RaceConfig {
  return {
    mode: setup.mode,
    difficulty: setup.difficulty,
    worldId: setup.worldId,
    seed,
    normalizeStats: setup.humans >= 2 && setup.mode !== 'team',
    tutorial,
  };
}
