/**
 * DinoRUSH – central data types.
 * Game rules, rendering and UI all share these definitions; nothing here
 * depends on Three.js or React.
 */

// ---------------------------------------------------------------------------
// Dinosaurs
// ---------------------------------------------------------------------------

/** The four base archetypes. Every lineup must contain exactly one of each. */
export type Archetype = 'raptor' | 'spino' | 'ankylo' | 'trike';

export type AbilityId = 'superSprint' | 'waterWave' | 'unstoppableSmash' | 'unstoppableAdvance';

export interface DinosaurAbility {
  id: AbilityId;
  name: string;
  description: string;
  /** How the ability charges. */
  chargeSource: 'firmDistance' | 'waterDistance' | 'smash' | 'roughDistance';
  /** Terrain categories where the ability can fire. */
  activeOn: TerrainCategory[];
  /** Speed multiplier while active. */
  speedMultiplier: number;
  /** Seconds active. */
  duration: number;
}

/** Small solo-only perks for variants. Normalised away in competitive multiplayer. */
export interface VariantPerk {
  kind: 'abilityCharge' | 'abilityDuration' | 'terrainSpeed' | 'comboCoins' | 'perfectBoost';
  value: number;
  terrains?: TerrainId[];
  description: string;
}

export interface DinoPalette {
  body: number;
  belly: number;
  accent: number;
  detail: number;
  /** Optional effect for cosmetic variants. */
  effect?: 'none' | 'sparkle' | 'rainbow' | 'frost' | 'gold';
}

export interface DinosaurDefinition {
  id: string;
  name: string;
  species: string;
  archetype: Archetype;
  /** Short role label e.g. RYCHLÍK. */
  role: string;
  palette: DinoPalette;
  rarity: 1 | 2 | 3;
  /** Base dinos are unlocked from the start. */
  starter: boolean;
  perk?: VariantPerk;
  description: string;
}

export type StatId = 'speed' | 'transform' | 'stamina';

export interface DinosaurStats {
  speed: number;
  transform: number;
  stamina: number;
}

export interface DinosaurInstance {
  defId: string;
  level: number;
  xp: number;
  stats: DinosaurStats;
  accessory: string | null;
  unlockedAt: number;
}

export type Lineup = Record<Archetype, string>;

// ---------------------------------------------------------------------------
// Terrain / track
// ---------------------------------------------------------------------------

export type TerrainId =
  | 'grass'
  | 'path'
  | 'water'
  | 'deepWater'
  | 'stones'
  | 'woodBarrier'
  | 'scree'
  | 'mud'
  | 'sand'
  | 'snow'
  | 'ice'
  | 'bridge';

export type TerrainCategory = 'firm' | 'water' | 'smash' | 'rough';

export type ObstacleKind = 'rockPile' | 'woodWall' | 'boulder' | 'fallenTree' | 'iceBlock' | 'stoneWall';

export type Suitability = 'best' | 'ok' | 'bad' | 'awful';

export interface TerrainDefinition {
  id: TerrainId;
  name: string;
  category: TerrainCategory;
  best: Archetype;
  suitability: Record<Archetype, Suitability>;
  /** Obstacle kinds this terrain spawns (smash category). */
  obstacles?: ObstacleKind[];
  /** Base colour for rendering. */
  color: number;
  /** Secondary colour (stripes, details). */
  color2: number;
  /** Icon key used by HUD / signs. */
  icon: string;
  /** Short warning text (very short for pre-readers). */
  warning: string;
}

export interface TrackObstacle {
  /** Absolute distance along the track (metres). */
  at: number;
  kind: ObstacleKind;
}

export type DynamicEventType = 'fallingTree' | 'rockslide' | 'flood' | 'snowfall' | 'quake' | 'stoneWall';

export interface TrackEventSpec {
  type: DynamicEventType;
  /** Terrain the segment turns into. */
  newTerrain: TerrainId;
  /** Obstacles added by the event. */
  newObstacles: TrackObstacle[];
  /** Trigger when the leader is this many metres before the segment start. */
  leadDistance: number;
  triggered: boolean;
}

export interface TrackSegment {
  index: number;
  start: number;
  end: number;
  terrain: TerrainId;
  /** Recommended (best) archetype – derived from terrain but cached for speed. */
  recommended: Archetype;
  obstacles: TrackObstacle[];
  /** Coin rows (Gold Rush): absolute positions. */
  coins: number[];
  event?: TrackEventSpec;
  /** Final straight flag. */
  finish?: boolean;
  /** Start straight flag. */
  startArea?: boolean;
}

export interface TrackDefinition {
  seed: number;
  worldId: WorldId;
  difficulty: DifficultyId;
  /** Total length; Infinity for endless tracks. */
  length: number;
  segments: TrackSegment[];
  endless: boolean;
}

// ---------------------------------------------------------------------------
// Worlds
// ---------------------------------------------------------------------------

export type WorldId = 'jungle' | 'volcano' | 'ice' | 'islands';

export interface WorldDefinition {
  id: WorldId;
  name: string;
  subtitle: string;
  /** Weighted terrain pool. */
  terrainPool: Partial<Record<TerrainId, number>>;
  /** Firm terrain used for start/finish/event-base segments. */
  firmTerrain: TerrainId;
  events: DynamicEventType[];
  sky: { top: number; bottom: number };
  fog: number;
  fogNear: number;
  fogFar: number;
  ambient: number;
  sun: number;
  sunIntensity: number;
  ground: number;
  ground2: number;
  /** UI card gradient. */
  cardColors: [string, string];
  weather?: 'none' | 'smoke' | 'snow' | 'sparkle';
}

// ---------------------------------------------------------------------------
// Difficulty, AI, modes
// ---------------------------------------------------------------------------

export type DifficultyId = 'small' | 'racer' | 'champion';

export interface GameDifficulty {
  id: DifficultyId;
  name: string;
  ages: string;
  /** Seconds of warning before a terrain change. */
  warningTime: number;
  baseSpeed: number;
  trackLength: number;
  /** Segment duration range in seconds at nominal (correct) speed. */
  segmentTime: [number, number];
  /** Minimum segment duration – guarantees a reaction is always possible. */
  minSegmentTime: number;
  /** Probability that the next segment needs a different dino. */
  changeProbability: number;
  /** 0..1 scaling of penalty (1 = full table penalty). */
  penaltyScale: number;
  hintLevel: 'strong' | 'normal' | 'minimal';
  /** Profiles of the computer racers (in order of appearance). */
  aiProfiles: AIProfileId[];
  dynamicEvents: [number, number];
  /** Portion of the track that uses only simple terrains. */
  easyIntro: number;
  trexSpeedFactor: number;
}

export type AIProfileId = 'beginner' | 'advanced' | 'champion';

export interface AIProfile {
  id: AIProfileId;
  name: string;
  /** Probability of picking the correct dino. */
  accuracy: number;
  /** Reaction time range in seconds after a warning becomes visible. */
  reaction: [number, number];
  /** Probability of aiming at the perfect window. */
  perfectSkill: number;
  /** Seconds before realising a mistake and correcting it. */
  recovery: [number, number];
}

export type GameModeId = 'classic' | 'cup' | 'trex' | 'endless' | 'goldRush' | 'team';

export interface GameModeDefinition {
  id: GameModeId;
  name: string;
  short: string;
  description: string;
  icon: string;
  colors: [string, string];
  /** Whether the race ends when racers cross the finish. */
  hasFinish: boolean;
  /** Coins placed on track. */
  trackCoins: boolean;
  trex: boolean;
  team: boolean;
  /** Ranking metric. */
  ranking: 'finishTime' | 'coins' | 'score' | 'trex' | 'team';
}

// ---------------------------------------------------------------------------
// Race runtime
// ---------------------------------------------------------------------------

export type ParticipantKind = 'human' | 'ai';

export interface ParticipantLoadout {
  archetype: Archetype;
  defId: string;
  stats: DinosaurStats;
  level: number;
  perk?: VariantPerk;
  accessory: string | null;
}

export interface ActiveAbility {
  archetype: Archetype;
  id: AbilityId;
  remaining: number;
  duration: number;
}

export interface RaceParticipant {
  id: string;
  lane: number;
  name: string;
  color: string;
  kind: ParticipantKind;
  /** Human seat index (0..2) or -1 for AI. */
  seat: number;
  aiProfile?: AIProfileId;
  loadout: Record<Archetype, ParticipantLoadout>;
  current: Archetype;
  previous: Archetype;
  /** Seconds since the last transformation (visual + cooldown). */
  sinceSwitch: number;
  switchCooldown: number;
  position: number;
  speed: number;
  targetSpeed: number;
  segmentIndex: number;
  /** Distance travelled in current segment with the right dino (or prepared). */
  segCorrect: number;
  segTotal: number;
  /** Was a perfect awarded for the current segment. */
  segPerfect: boolean;
  combo: number;
  maxCombo: number;
  correctSegments: number;
  mistakes: number;
  perfects: number;
  smashed: number;
  climbed: number;
  switches: number;
  coins: number;
  score: number;
  abilityCharge: Record<Archetype, number>;
  ability: ActiveAbility | null;
  abilitiesUsed: number;
  perfectBoost: number;
  turbo: number;
  teamTurbo: number;
  /** Short slowdown after hitting an obstacle (seconds). */
  bump: number;
  bumpKind: 'smash' | 'climb';
  /** Segment index for which a perfect transformation was already awarded. */
  perfectSegIndex: number;
  /** Segment index for which the upcoming-change warning was already emitted. */
  warnedSegIndex: number;
  /** Is the racer currently "prepared" (has the dino for the next change). */
  prepared: boolean;
  /** Current multiplier from terrain suitability (for HUD/renderer). */
  terrainFactor: number;
  finished: boolean;
  finishTime: number | null;
  caught: boolean;
  caughtAt: number | null;
  used: Record<Archetype, number>;
  segmentsByArchetype: Record<Archetype, number>;
  /** Pending AI decisions etc. kept opaque to the engine. */
  place: number;
}

export type RaceEventType =
  | 'countdown'
  | 'start'
  | 'switch'
  | 'perfect'
  | 'segmentSuccess'
  | 'segmentMistake'
  | 'combo'
  | 'comboCoins'
  | 'turbo'
  | 'abilityActivated'
  | 'abilityEnded'
  | 'smash'
  | 'climb'
  | 'enterTerrain'
  | 'coin'
  | 'coinMissed'
  | 'dynamicEvent'
  | 'finish'
  | 'trexCatch'
  | 'teamTurbo'
  | 'raceEnd'
  | 'warning';

export interface RaceEvent {
  type: RaceEventType;
  time: number;
  participantId?: string;
  archetype?: Archetype;
  terrain?: TerrainId;
  value?: number;
  segmentIndex?: number;
  obstacleIndex?: number;
  eventType?: DynamicEventType;
  position?: number;
}

export interface TrexState {
  position: number;
  speed: number;
  /** Ids of participants already caught. */
  caught: string[];
}

export interface TeamState {
  meter: number;
  meterMax: number;
  score: number;
  turbos: number;
  /** Rival pace setter. */
  rivalPosition: number;
  rivalSpeed: number;
  rivalFinishTime: number | null;
}

export type RacePhase = 'countdown' | 'racing' | 'finished';

export interface RaceConfig {
  mode: GameModeId;
  difficulty: DifficultyId;
  worldId: WorldId;
  seed: number;
  /** Normalise RPG stats (competitive multiplayer). */
  normalizeStats: boolean;
  tutorial?: boolean;
  trackLengthOverride?: number;
}

export interface RaceState {
  config: RaceConfig;
  phase: RacePhase;
  countdown: number;
  time: number;
  track: TrackDefinition;
  participants: RaceParticipant[];
  trex: TrexState | null;
  team: TeamState | null;
  /** Time scale (tutorial slow motion). */
  timeScale: number;
  /** Seconds since first finisher (grace period). */
  sinceFirstFinish: number | null;
  /** Endless: current difficulty ramp factor. */
  ramp: number;
  endedByPlayer: boolean;
}

export interface ParticipantResult {
  id: string;
  name: string;
  color: string;
  kind: ParticipantKind;
  seat: number;
  place: number;
  finishTime: number | null;
  distance: number;
  correctSegments: number;
  mistakes: number;
  perfects: number;
  maxCombo: number;
  smashed: number;
  coins: number;
  score: number;
  caught: boolean;
  /** 1–3 stars rating. */
  stars: number;
  used: Record<Archetype, number>;
  segmentsByArchetype: Record<Archetype, number>;
  abilitiesUsed: number;
  loadout: Record<Archetype, string>;
}

export interface RaceResult {
  config: RaceConfig;
  duration: number;
  results: ParticipantResult[];
  /** Team mode outcome. */
  teamWon?: boolean;
  teamScore?: number;
  rivalTime?: number | null;
  teamTime?: number | null;
}

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

export interface LifetimeStats {
  racesFinished: number;
  wins: number;
  perfects: number;
  maxCombo: number;
  combo5Count: number;
  smashed: number;
  worldsWon: WorldId[];
  dinosUnlocked: number;
  decorationsPlaced: number;
  cupsCompleted: number;
  cupsWon: number;
  trexEscapes: number;
  endlessBest: number;
  goldBest: number;
  teamWins: number;
  upgradesBought: number;
  allFourRaces: number;
  eggsOpened: number;
  abilitiesUsed: number;
  modesPlayed: GameModeId[];
}

export type EggRewardKind = 'dino' | 'accessory' | 'coins';

export interface EggReward {
  kind: EggRewardKind;
  id?: string;
  coins?: number;
}

export interface EggState {
  pending: number;
  racesTowardNext: number;
  opened: number;
}

export type MissionMetric = (stats: LifetimeStats, profile: PlayerProfile) => number;

export interface MissionDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  metric: MissionMetric;
  reward: { coins: number; eggs?: number };
}

export interface MissionProgress {
  completed: boolean;
  completedAt: number | null;
}

export type DecorationId = 'tree' | 'stone' | 'bush' | 'pond' | 'statue' | 'flowers' | 'palm' | 'fence' | 'volcano' | 'nest';

export interface ParkDecoration {
  id: DecorationId;
  name: string;
  price: number;
  description: string;
}

export interface ParkState {
  cols: number;
  rows: number;
  cells: (DecorationId | null)[];
  inventory: Partial<Record<DecorationId, number>>;
}

export interface LocalPlayer {
  name: string;
  color: string;
  lineup: Lineup;
}

export interface RecordsState {
  bestTimes: Record<string, number>;
  endlessBest: number;
  goldBest: number;
  trexBestLead: number;
}

export interface CupRaceRecord {
  worldId: WorldId;
  places: Record<string, number>;
}

export interface CupState {
  difficulty: DifficultyId;
  humans: number;
  worlds: WorldId[];
  baseSeed: number;
  raceIndex: number;
  points: Record<string, number>;
  names: Record<string, string>;
  colors: Record<string, string>;
  races: CupRaceRecord[];
  finished: boolean;
}

export interface CupHistoryEntry {
  date: number;
  difficulty: DifficultyId;
  standings: { name: string; points: number; human: boolean }[];
}

export interface Inventory {
  coins: number;
  accessories: string[];
}

export interface PlayerProfile {
  createdAt: number;
  coins: number;
  totalCoinsEarned: number;
  dinos: Record<string, DinosaurInstance>;
  accessories: string[];
  players: LocalPlayer[];
  stats: LifetimeStats;
  missions: Record<string, MissionProgress>;
  records: RecordsState;
  eggs: EggState;
  park: ParkState;
  activeCup: CupState | null;
  cupHistory: CupHistoryEntry[];
  tutorialDone: boolean;
  lastSetup: RaceSetup | null;
}

export interface GameSettings {
  volume: number;
  music: boolean;
  sfx: boolean;
  reducedMotion: boolean;
  defaultDifficulty: DifficultyId;
  quality: 'low' | 'high';
}

export interface SaveData {
  version: number;
  profile: PlayerProfile;
  settings: GameSettings;
}

/** What the setup wizard produces. */
export interface RaceSetup {
  mode: GameModeId;
  humans: 1 | 2 | 3;
  names: string[];
  worldId: WorldId;
  difficulty: DifficultyId;
  seed?: number;
}
