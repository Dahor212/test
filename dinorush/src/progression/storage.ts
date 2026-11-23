import { ACCESSORY_BY_ID, DINO_BY_ID } from '../config/dinosaurs';
import { LEVEL_BY_ID } from '../config/campaign';
import { ARCHETYPES } from '../config/dinosaurs';
import { DIFFICULTIES } from '../config/difficulty';
import { DECORATIONS, PARK_SIZE } from '../config/economy';
import { MODES } from '../config/modes';
import { WORLDS } from '../config/worlds';
import type {
  Archetype,
  CupState,
  DailyState,
  DecorationId,
  DinosaurInstance,
  GameSettings,
  GhostData,
  LifetimeStats,
  PlayerProfile,
  RaceSetup,
  SaveData,
} from '../types';
import { AVATAR_COLORS, createDefaultProfile, createDefaultSettings, createDinoInstance, defaultStats, emptyDaily, MAX_PROFILES, newProfileId } from './profile';
import { levelForXp, repairLineup } from './rpg';

export const SAVE_KEY = 'dinorush.save';
export const SAVE_VERSION = 3;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

class MemoryStorage implements StorageLike {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

export function getStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') {
      const t = '__dinorush_test__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return localStorage;
    }
  } catch {
    /* private mode etc. */
  }
  return new MemoryStorage();
}

// ---------------------------------------------------------------------------
// Sanitising helpers – never trust stored data.
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const str = (v: unknown, d: string, maxLen = 40) => (typeof v === 'string' ? v.slice(0, maxLen) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

function sanitizeStats(raw: unknown): LifetimeStats {
  const d = defaultStats();
  if (!isObj(raw)) return d;
  const out = { ...d };
  for (const k of Object.keys(d) as (keyof LifetimeStats)[]) {
    if (k === 'worldsWon') {
      out.worldsWon = Array.isArray(raw.worldsWon) ? (raw.worldsWon.filter((w) => typeof w === 'string' && w in WORLDS) as never) : [];
    } else if (k === 'modesPlayed') {
      out.modesPlayed = Array.isArray(raw.modesPlayed) ? (raw.modesPlayed.filter((w) => typeof w === 'string' && w in MODES) as never) : [];
    } else {
      (out as Record<string, unknown>)[k] = num(raw[k], 0, 0);
    }
  }
  out.worldsWon = [...new Set(out.worldsWon)];
  out.modesPlayed = [...new Set(out.modesPlayed)];
  return out;
}

function sanitizeDino(id: string, raw: unknown): DinosaurInstance | null {
  if (!DINO_BY_ID[id]) return null;
  const base = createDinoInstance(id, 0);
  if (!isObj(raw)) return base;
  const xp = num(raw.xp, 0, 0, 1e7);
  const st = isObj(raw.stats) ? raw.stats : {};
  const acc = typeof raw.accessory === 'string' && ACCESSORY_BY_ID[raw.accessory] ? raw.accessory : null;
  return {
    defId: id,
    xp,
    level: levelForXp(xp),
    stats: {
      speed: Math.round(num(st.speed, 0, 0, 5)),
      transform: Math.round(num(st.transform, 0, 0, 5)),
      stamina: Math.round(num(st.stamina, 0, 0, 5)),
    },
    accessory: acc,
    unlockedAt: num(raw.unlockedAt, 0, 0),
  };
}

function sanitizeSetup(raw: unknown): RaceSetup | null {
  if (!isObj(raw)) return null;
  const mode = typeof raw.mode === 'string' && raw.mode in MODES ? (raw.mode as RaceSetup['mode']) : 'classic';
  const worldId = typeof raw.worldId === 'string' && raw.worldId in WORLDS ? (raw.worldId as RaceSetup['worldId']) : 'jungle';
  const difficulty =
    typeof raw.difficulty === 'string' && raw.difficulty in DIFFICULTIES ? (raw.difficulty as RaceSetup['difficulty']) : 'racer';
  const humans = [1, 2, 3].includes(raw.humans as number) ? (raw.humans as 1 | 2 | 3) : 1;
  const names = Array.isArray(raw.names) ? raw.names.map((n) => str(n, 'Hráč', 14)) : [];
  return { mode, worldId, difficulty, humans, names };
}

function sanitizeCup(raw: unknown): CupState | null {
  if (!isObj(raw)) return null;
  try {
    const worlds = Array.isArray(raw.worlds) ? raw.worlds.filter((w) => typeof w === 'string' && w in WORLDS) : [];
    if (worlds.length !== 5) return null;
    const difficulty = typeof raw.difficulty === 'string' && raw.difficulty in DIFFICULTIES ? raw.difficulty : 'racer';
    const rec = (v: unknown) =>
      isObj(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'number' || typeof x === 'string')) : {};
    return {
      difficulty: difficulty as CupState['difficulty'],
      humans: Math.round(num(raw.humans, 1, 1, 3)),
      worlds: worlds as CupState['worlds'],
      baseSeed: num(raw.baseSeed, 1, 0),
      raceIndex: Math.round(num(raw.raceIndex, 0, 0, 5)),
      points: rec(raw.points) as Record<string, number>,
      names: rec(raw.names) as Record<string, string>,
      colors: rec(raw.colors) as Record<string, string>,
      races: Array.isArray(raw.races) ? (raw.races.filter(isObj) as unknown as CupState['races']) : [],
      finished: bool(raw.finished, false),
      seatProfiles: Array.isArray(raw.seatProfiles)
        ? raw.seatProfiles.slice(0, 3).map((x) => (typeof x === 'string' ? x.slice(0, 24) : null))
        : undefined,
    };
  } catch {
    return null;
  }
}

export function sanitizeProfile(raw: unknown): PlayerProfile {
  const d = createDefaultProfile();
  if (!isObj(raw)) return d;
  const p: PlayerProfile = { ...d };
  p.createdAt = num(raw.createdAt, d.createdAt, 0);
  p.coins = Math.floor(num(raw.coins, d.coins, 0, 1e9));
  p.totalCoinsEarned = Math.floor(num(raw.totalCoinsEarned, 0, 0, 1e10));

  const dinos: Record<string, DinosaurInstance> = { ...d.dinos };
  if (isObj(raw.dinos)) {
    for (const [id, v] of Object.entries(raw.dinos)) {
      const inst = sanitizeDino(id, v);
      if (inst) dinos[id] = inst;
    }
  }
  p.dinos = dinos;
  p.accessories = Array.isArray(raw.accessories)
    ? [...new Set(raw.accessories.filter((a): a is string => typeof a === 'string' && !!ACCESSORY_BY_ID[a]))]
    : [];
  for (const inst of Object.values(p.dinos)) if (inst.accessory && !p.accessories.includes(inst.accessory)) inst.accessory = null;

  p.players = d.players.map((dp, i) => {
    const rp = Array.isArray(raw.players) && isObj(raw.players[i]) ? (raw.players[i] as Record<string, unknown>) : {};
    return {
      name: str(rp.name, dp.name, 14) || dp.name,
      color: typeof rp.color === 'string' && /^#[0-9a-f]{6}$/i.test(rp.color) ? rp.color : dp.color,
      lineup: repairLineup(p, isObj(rp.lineup) ? (rp.lineup as never) : undefined),
    };
  });

  p.stats = sanitizeStats(raw.stats);
  p.missions = {};
  if (isObj(raw.missions)) {
    for (const [id, v] of Object.entries(raw.missions)) {
      if (isObj(v)) p.missions[id] = { completed: bool(v.completed, false), completedAt: num(v.completedAt, 0, 0) || null };
    }
  }
  const r = isObj(raw.records) ? raw.records : {};
  const bestTimes: Record<string, number> = {};
  if (isObj(r.bestTimes)) for (const [k, v] of Object.entries(r.bestTimes)) if (typeof v === 'number' && v > 0) bestTimes[k] = v;
  p.records = {
    bestTimes,
    endlessBest: num(r.endlessBest, 0, 0),
    goldBest: num(r.goldBest, 0, 0),
    trexBestLead: num(r.trexBestLead, 0, 0),
  };
  const e = isObj(raw.eggs) ? raw.eggs : {};
  p.eggs = {
    pending: Math.floor(num(e.pending, 0, 0, 99)),
    racesTowardNext: Math.floor(num(e.racesTowardNext, 0, 0, 99)),
    opened: Math.floor(num(e.opened, 0, 0, 9999)),
  };
  const pk = isObj(raw.park) ? raw.park : {};
  const size = PARK_SIZE.cols * PARK_SIZE.rows;
  const cells = Array.isArray(pk.cells) ? pk.cells : [];
  const inventory: Partial<Record<DecorationId, number>> = {};
  if (isObj(pk.inventory)) {
    for (const [k, v] of Object.entries(pk.inventory)) if (k in DECORATIONS) inventory[k as DecorationId] = Math.floor(num(v, 0, 0, 999));
  } else {
    Object.assign(inventory, d.park.inventory);
  }
  p.park = {
    cols: PARK_SIZE.cols,
    rows: PARK_SIZE.rows,
    cells: Array.from({ length: size }, (_, i) => (typeof cells[i] === 'string' && cells[i] in DECORATIONS ? (cells[i] as DecorationId) : null)),
    inventory,
  };
  p.activeCup = sanitizeCup(raw.activeCup);
  p.cupHistory = Array.isArray(raw.cupHistory) ? (raw.cupHistory.filter(isObj).slice(-10) as never) : [];
  p.tutorialDone = bool(raw.tutorialDone, false);
  p.lastSetup = sanitizeSetup(raw.lastSetup);
  p.id = typeof raw.id === 'string' && /^[a-z0-9]{2,24}$/i.test(raw.id) ? raw.id : newProfileId();
  const av = isObj(raw.avatar) ? raw.avatar : {};
  p.avatar = {
    archetype: typeof av.archetype === 'string' && (ARCHETYPES as string[]).includes(av.archetype) ? (av.archetype as Archetype) : 'raptor',
    color: typeof av.color === 'string' && /^#[0-9a-f]{6}$/i.test(av.color) ? av.color : AVATAR_COLORS[0],
  };
  const cp = isObj(raw.campaign) ? raw.campaign : {};
  const stars: Record<string, number> = {};
  if (isObj(cp.stars)) for (const [k, v] of Object.entries(cp.stars)) if (LEVEL_BY_ID[k]) stars[k] = Math.round(num(v, 0, 0, 3));
  p.campaign = {
    difficulty: typeof cp.difficulty === 'string' && cp.difficulty in DIFFICULTIES ? (cp.difficulty as PlayerProfile['campaign']['difficulty']) : 'racer',
    stars,
  };
  p.daily = sanitizeDaily(raw.daily);
  p.ghosts = {};
  if (isObj(raw.ghosts)) {
    for (const [k, v] of Object.entries(raw.ghosts).slice(0, 80)) {
      const g = sanitizeGhost(v);
      if (g) p.ghosts[k.slice(0, 60)] = g;
    }
  }
  return p;
}

function sanitizeDaily(raw: unknown): DailyState {
  const d = emptyDaily();
  if (!isObj(raw)) return d;
  return {
    key: typeof raw.key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.key) ? raw.key : '',
    best: typeof raw.best === 'number' && Number.isFinite(raw.best) ? raw.best : null,
    stars: Math.round(num(raw.stars, 0, 0, 3)),
    rewarded: bool(raw.rewarded, false),
    completed: Math.floor(num(raw.completed, 0, 0, 1e6)),
  };
}

export function sanitizeGhost(raw: unknown): GhostData | null {
  if (!isObj(raw)) return null;
  const pos = Array.isArray(raw.pos) ? raw.pos : null;
  const arch = typeof raw.arch === 'string' ? raw.arch : '';
  if (!pos || pos.length < 2 || pos.length > 4000 || arch.length !== pos.length) return null;
  if (!pos.every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
  if (!/^[rsat]+$/.test(arch)) return null;
  const dt = num(raw.dt, 0.5, 0.05, 5);
  const time = num(raw.time, 0, 0, 3600);
  if (time <= 0) return null;
  return { v: 1, dt, pos: pos as number[], arch, time, name: str(raw.name, 'Duch', 14), at: num(raw.at, 0, 0) };
}

export function sanitizeSettings(raw: unknown): GameSettings {
  const d = createDefaultSettings();
  if (!isObj(raw)) return d;
  return {
    volume: num(raw.volume, d.volume, 0, 1),
    music: bool(raw.music, d.music),
    sfx: bool(raw.sfx, d.sfx),
    reducedMotion: bool(raw.reducedMotion, d.reducedMotion),
    defaultDifficulty:
      typeof raw.defaultDifficulty === 'string' && raw.defaultDifficulty in DIFFICULTIES
        ? (raw.defaultDifficulty as GameSettings['defaultDifficulty'])
        : d.defaultDifficulty,
    quality: raw.quality === 'low' ? 'low' : 'high',
  };
}

/** Version migrations: each takes the raw object of version n and returns n+1. */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 stored the park as `parkCells`; v2 nests it in profile.park.
  1: (raw) => {
    const profile = isObj(raw.profile) ? { ...raw.profile } : {};
    if (Array.isArray((profile as Record<string, unknown>).parkCells)) {
      (profile as Record<string, unknown>).park = { cells: (profile as Record<string, unknown>).parkCells, inventory: {} };
      delete (profile as Record<string, unknown>).parkCells;
    }
    return { ...raw, profile, version: 2 };
  },
  // v2 had one profile per tablet; v3 keeps a list of child profiles.
  2: (raw) => {
    const profile = isObj(raw.profile) ? { ...raw.profile } : {};
    if (typeof profile.id !== 'string') profile.id = 'pf1';
    const { profile: _old, ...rest } = raw;
    void _old;
    return { ...rest, profiles: [profile], activeProfileId: profile.id, version: 3 };
  },
};

export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let cur = raw;
  let v = num(cur.version, 1, 0);
  let guard = 0;
  while (v < SAVE_VERSION && guard++ < 20) {
    const m = MIGRATIONS[v];
    cur = m ? m(cur) : { ...cur, version: v + 1 };
    v = num(cur.version, v + 1);
  }
  return cur;
}

export function defaultSave(): SaveData {
  const profile = createDefaultProfile();
  return { version: SAVE_VERSION, profiles: [profile], activeProfileId: profile.id, settings: createDefaultSettings() };
}

/** Sanitises the profile list: at least one profile, unique ids, valid active id. */
export function sanitizeProfiles(rawList: unknown, rawActive: unknown): { profiles: PlayerProfile[]; activeProfileId: string } {
  const list = Array.isArray(rawList) ? rawList.slice(0, MAX_PROFILES) : [];
  const profiles: PlayerProfile[] = [];
  const ids = new Set<string>();
  for (const r of list) {
    const p = sanitizeProfile(r);
    while (ids.has(p.id)) p.id = newProfileId();
    ids.add(p.id);
    profiles.push(p);
  }
  if (!profiles.length) profiles.push(createDefaultProfile());
  const activeProfileId = typeof rawActive === 'string' && ids.has(rawActive) ? rawActive : profiles[0].id;
  return { profiles, activeProfileId };
}

export function loadSave(storage: StorageLike = getStorage()): SaveData {
  let raw: string | null = null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return defaultSave();
  }
  if (!raw) return defaultSave();
  try {
    const parsed = JSON.parse(raw);
    if (!isObj(parsed)) throw new Error('bad save');
    const migrated = migrate(parsed);
    const { profiles, activeProfileId } = sanitizeProfiles(migrated.profiles, migrated.activeProfileId);
    return {
      version: SAVE_VERSION,
      profiles,
      activeProfileId,
      settings: sanitizeSettings(migrated.settings),
    };
  } catch {
    try {
      storage.setItem(SAVE_KEY + '.corrupt', raw);
    } catch {
      /* ignore */
    }
    return defaultSave();
  }
}

export function writeSave(data: SaveData, storage: StorageLike = getStorage()): boolean {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage: StorageLike = getStorage()) {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
