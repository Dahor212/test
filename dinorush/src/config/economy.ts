import type { DecorationId, EggReward, GameModeId, ParkDecoration, StatId } from '../types';

/** Reward tuning – no microtransactions, no loss of earned coins. */
export const ECONOMY = {
  finishCoins: 100,
  placeCoins: [60, 45, 30, 20, 10],
  /**
   * Perfect transformations and combo milestones pay out "bonus coins" during
   * the race (see GAME_CONFIG.perfect.coins / GAME_CONFIG.combo.coinBonus);
   * these are added to the reward as one line.
   */
  /** Extra mode-specific bonuses. */
  modeBonus: {
    classic: 0,
    cup: 0,
    trex: 40,
    endless: 0,
    goldRush: 0,
    team: 50,
  } as Record<GameModeId, number>,
  /** Endless: coins per 10 m travelled. */
  endlessCoinsPer10m: 1,
  maxEndlessCoins: 250,
  racesPerEgg: 3,
  /** Coins for eggs opened after the whole sequence has been unlocked. */
  eggFallbackCoins: 150,
  xp: {
    perMetre: 0.12,
    perSegment: 6,
    perPerfect: 10,
    finish: 20,
    win: 15,
  },
};

/** XP needed to reach level index+1 (level 1 = 0 XP). Ten levels. */
export const LEVEL_THRESHOLDS = [0, 80, 200, 360, 560, 820, 1140, 1520, 1980, 2520];

/** Coins required for each upgrade tier (0→1, 1→2, ...). */
export const UPGRADE_COSTS = [60, 120, 200, 300, 450];

/** Required dino level for each tier. */
export const UPGRADE_LEVEL_REQ = [1, 2, 4, 6, 8];

export const STAT_INFO: Record<StatId, { name: string; description: string; icon: string }> = {
  speed: { name: 'RYCHLOST', description: 'Rychlejší na vhodném terénu', icon: 'bolt' },
  transform: { name: 'PROMĚNA', description: 'Rychlejší proměna a delší okno pro perfektní proměnu', icon: 'swap' },
  stamina: { name: 'VÝDRŽ', description: 'Menší zpomalení po chybě', icon: 'heart' },
};

/**
 * Predictable egg sequence – no random loot boxes. Each egg unlocks the next
 * reward in order; after the list is exhausted eggs give coins.
 */
export const EGG_SEQUENCE: EggReward[] = [
  { kind: 'dino', id: 'raptor-blue' },
  { kind: 'accessory', id: 'partyHat' },
  { kind: 'dino', id: 'spino-teal' },
  { kind: 'dino', id: 'ankylo-red' },
  { kind: 'accessory', id: 'sunglasses' },
  { kind: 'dino', id: 'trike-ice' },
  { kind: 'dino', id: 'ankylo-moss' },
  { kind: 'accessory', id: 'scarf' },
  { kind: 'dino', id: 'raptor-gold' },
  { kind: 'dino', id: 'spino-lava' },
  { kind: 'accessory', id: 'crown' },
  { kind: 'dino', id: 'trike-rainbow' },
  { kind: 'accessory', id: 'flower' },
  // newer species – usually met earlier on the career map
  { kind: 'dino', id: 'galli-sand' },
  { kind: 'dino', id: 'stego-forest' },
  { kind: 'dino', id: 'bary-river' },
  { kind: 'dino', id: 'styraco-desert' },
  { kind: 'dino', id: 'dilo-jungle' },
  { kind: 'dino', id: 'pachy-rock' },
  { kind: 'dino', id: 'brachio-ice' },
];

export const DECORATIONS: Record<DecorationId, ParkDecoration> = {
  flowers: { id: 'flowers', name: 'Květiny', price: 30, description: 'Barevné květinky' },
  stone: { id: 'stone', name: 'Kámen', price: 40, description: 'Velký kulatý kámen' },
  bush: { id: 'bush', name: 'Keř', price: 50, description: 'Hustý zelený keř' },
  fence: { id: 'fence', name: 'Plot', price: 40, description: 'Dřevěný plůtek výběhu' },
  tree: { id: 'tree', name: 'Strom', price: 90, description: 'Pravěký strom' },
  palm: { id: 'palm', name: 'Palma', price: 110, description: 'Palma z ostrovů' },
  nest: { id: 'nest', name: 'Hnízdo', price: 120, description: 'Hnízdo s vajíčky' },
  pond: { id: 'pond', name: 'Jezírko', price: 150, description: 'Jezírko pro plavce' },
  statue: { id: 'statue', name: 'Dino socha', price: 250, description: 'Zlatá socha dinosaura' },
  volcano: { id: 'volcano', name: 'Sopečka', price: 300, description: 'Malá kouřící sopka' },
};

export const DECORATION_LIST = Object.values(DECORATIONS);

export const PARK_SIZE = { cols: 5, rows: 4 };
