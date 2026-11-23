/**
 * Central tuning values. Everything gameplay-related that a designer may want
 * to tweak lives here (or in the sibling registry files) – never in React
 * components or renderers.
 */
import type { Suitability } from '../types';

export const GAME_CONFIG = {
  /** Simulation fixed step (seconds). */
  fixedStep: 1 / 60,
  /** Max real seconds simulated per frame (prevents huge jumps after a pause). */
  maxFrameDelta: 0.1,

  countdownSeconds: 3,
  laneCount: 3,
  laneSpacing: 3.4,

  suitabilityMultiplier: {
    best: 1.12,
    ok: 0.8,
    bad: 0.6,
    awful: 0.45,
  } as Record<Suitability, number>,

  /**
   * When the racer already has the dino needed for the *next* segment and
   * that segment is inside the warning window, the current segment is never
   * slower than this – reacting early is never punished.
   */
  earlyGraceMultiplier: 1.0,

  /** Exponential approach rate of speed towards target (1/s). */
  accelRate: 4.5,
  decelRate: 7,
  /** Speed never drops below this – nobody ever gets stuck. */
  minSpeed: 2.6,
  /** Overall cap on boost stacking relative to base speed. */
  maxSpeedFactor: 1.75,

  switchCooldown: 0.3,
  transformAnimTime: 0.4,

  perfect: {
    /** Seconds before the segment start where a switch counts as perfect. */
    windowBefore: 1.0,
    /** Seconds after the segment start that still count. */
    windowAfter: 0.3,
    boost: 1.2,
    duration: 1.6,
    coins: 5,
  },

  segment: {
    /** Fraction of the segment that must be ridden correctly. */
    successFraction: 0.6,
  },

  combo: {
    turboEvery: 3,
    coinsEvery: 5,
    turboMultiplier: 1.22,
    turboDuration: 2.2,
    coinBonus: 15,
  },

  obstacle: {
    /** Correct (smashing) dino: tiny bump. */
    smashBump: 0.12,
    smashBumpFactor: 0.85,
    /** Wrong dino climbing over: speed is clamped to this for the bump time. */
    climbSpeed: 3.2,
    climbBump: 0.55,
  },

  ability: {
    /** Charge per metre (0..100) on suitable terrain with the right dino. */
    firmChargePerMetre: 100 / 140,
    waterChargePerMetre: 100 / 70,
    roughChargePerMetre: 100 / 80,
    smashChargePerObstacle: 34,
  },

  coins: {
    /** Gold Rush: in-race coins. */
    correctSegment: 3,
    perfect: 5,
    comboMilestone: 10,
    pickup: 1,
    rowSpacing: 4,
  },

  finishGraceSeconds: 20,
  /** Hard cap on race duration (safety net). */
  maxRaceSeconds: 400,

  rpg: {
    /** Maximum combined bonus from RPG systems. */
    maxTotalBonus: 0.12,
    speedPerPoint: 0.012,
    staminaPerPoint: 0.024,
    transformCooldownPerPoint: 0.02,
    transformPerfectWindowPerPoint: 0.06,
    levelSpeedBonus: 0.003,
    maxStatPoints: 5,
    maxLevel: 10,
  },

  trex: {
    startGap: 32,
    catchDistance: 0.6,
  },

  team: {
    meterMax: 10,
    turboMultiplier: 1.2,
    turboDuration: 2.5,
    /** Rival pace relative to base speed. */
    rivalPaceFactor: 0.98,
  },

  endless: {
    chunkLength: 260,
    /** Ramp increase per 100 m. */
    rampPer100m: 0.012,
    maxRamp: 1.35,
    scorePerMetre: 1,
    scorePerPerfect: 25,
    scorePerCombo: 40,
  },

  camera: {
    /** Displayed spread is softly clamped to this many metres around the focus. */
    softSpread: 9,
    maxSpread: 13,
  },
};

export type GameConfig = typeof GAME_CONFIG;
