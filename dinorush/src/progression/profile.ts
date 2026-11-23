import { DINOSAURS, STARTER_LINEUP } from '../config/dinosaurs';
import { PLAYER_COLORS } from '../config/difficulty';
import { PARK_SIZE } from '../config/economy';
import type { DinosaurInstance, GameSettings, LifetimeStats, PlayerProfile } from '../types';

export function createDinoInstance(defId: string, now = Date.now()): DinosaurInstance {
  return { defId, level: 1, xp: 0, stats: { speed: 0, transform: 0, stamina: 0 }, accessory: null, unlockedAt: now };
}

export function defaultStats(): LifetimeStats {
  return {
    racesFinished: 0,
    wins: 0,
    perfects: 0,
    maxCombo: 0,
    combo5Count: 0,
    smashed: 0,
    worldsWon: [],
    dinosUnlocked: 0,
    decorationsPlaced: 0,
    cupsCompleted: 0,
    cupsWon: 0,
    trexEscapes: 0,
    endlessBest: 0,
    goldBest: 0,
    teamWins: 0,
    upgradesBought: 0,
    allFourRaces: 0,
    eggsOpened: 0,
    abilitiesUsed: 0,
    modesPlayed: [],
  };
}

export const DEFAULT_PLAYER_NAMES = ['Hráč 1', 'Hráč 2', 'Hráč 3'];

export function createDefaultProfile(now = Date.now()): PlayerProfile {
  const dinos: Record<string, DinosaurInstance> = {};
  for (const d of DINOSAURS) if (d.starter) dinos[d.id] = createDinoInstance(d.id, now);
  return {
    createdAt: now,
    coins: 100,
    totalCoinsEarned: 0,
    dinos,
    accessories: [],
    players: DEFAULT_PLAYER_NAMES.map((name, i) => ({ name, color: PLAYER_COLORS[i], lineup: { ...STARTER_LINEUP } })),
    stats: defaultStats(),
    missions: {},
    records: { bestTimes: {}, endlessBest: 0, goldBest: 0, trexBestLead: 0 },
    eggs: { pending: 0, racesTowardNext: 0, opened: 0 },
    park: {
      cols: PARK_SIZE.cols,
      rows: PARK_SIZE.rows,
      cells: Array(PARK_SIZE.cols * PARK_SIZE.rows).fill(null),
      inventory: { flowers: 1, bush: 1 },
    },
    activeCup: null,
    cupHistory: [],
    tutorialDone: false,
    lastSetup: null,
  };
}

export function createDefaultSettings(): GameSettings {
  return {
    volume: 0.7,
    music: true,
    sfx: true,
    reducedMotion: false,
    defaultDifficulty: 'racer',
    quality: 'high',
  };
}

/** Deep clone helper used for immutable updates of the profile. */
export function cloneProfile(p: PlayerProfile): PlayerProfile {
  return JSON.parse(JSON.stringify(p));
}
