import type { AIProfile, AIProfileId, DifficultyId, GameDifficulty } from '../types';

export const DIFFICULTIES: Record<DifficultyId, GameDifficulty> = {
  small: {
    id: 'small',
    name: 'Malý dinosaurus',
    ages: '4–6 let',
    warningTime: 4,
    baseSpeed: 9.5,
    trackLength: 1050,
    segmentTime: [5.5, 8.5],
    minSegmentTime: 4.6,
    changeProbability: 0.8,
    penaltyScale: 0.65,
    hintLevel: 'strong',
    aiProfiles: ['beginner', 'beginner', 'beginner', 'beginner'],
    dynamicEvents: [1, 1],
    easyIntro: 0.35,
    trexSpeedFactor: 0.86,
  },
  racer: {
    id: 'racer',
    name: 'Dino závodník',
    ages: '6–9 let',
    warningTime: 2.5,
    baseSpeed: 11,
    trackLength: 1200,
    segmentTime: [3.4, 6.2],
    minSegmentTime: 2.8,
    changeProbability: 0.88,
    penaltyScale: 1,
    hintLevel: 'normal',
    aiProfiles: ['advanced', 'beginner', 'advanced', 'beginner'],
    dynamicEvents: [1, 2],
    easyIntro: 0.25,
    trexSpeedFactor: 1.02,
  },
  champion: {
    id: 'champion',
    name: 'Dino šampion',
    ages: '9+ let',
    warningTime: 1.5,
    baseSpeed: 12.2,
    trackLength: 1400,
    segmentTime: [2.4, 4.6],
    minSegmentTime: 1.9,
    changeProbability: 0.93,
    penaltyScale: 1.1,
    hintLevel: 'minimal',
    aiProfiles: ['champion', 'advanced', 'champion', 'advanced'],
    dynamicEvents: [2, 3],
    easyIntro: 0.15,
    trexSpeedFactor: 1.02,
  },
};

export const DIFFICULTY_LIST = Object.values(DIFFICULTIES);

export const AI_PROFILES: Record<AIProfileId, AIProfile> = {
  /** Gentle opponents for the first levels of each adventure world. */
  rookie: {
    id: 'rookie',
    name: 'Nováček',
    accuracy: 0.6,
    reaction: [1.0, 1.7],
    perfectSkill: 0.12,
    recovery: [1.6, 2.6],
  },
  beginner: {
    id: 'beginner',
    name: 'Začátečník',
    accuracy: 0.7,
    reaction: [0.8, 1.5],
    perfectSkill: 0.25,
    recovery: [1.2, 2.0],
  },
  advanced: {
    id: 'advanced',
    name: 'Pokročilý',
    accuracy: 0.85,
    reaction: [0.45, 0.9],
    perfectSkill: 0.5,
    recovery: [0.7, 1.2],
  },
  champion: {
    id: 'champion',
    name: 'Šampion',
    accuracy: 0.94,
    reaction: [0.22, 0.5],
    perfectSkill: 0.8,
    recovery: [0.35, 0.7],
  },
};

export const AI_NAMES = ['Rexík', 'Dina', 'Ptéro', 'Kostík', 'Šupinka', 'Drápek'];
export const PLAYER_COLORS = ['#ff4757', '#1e90ff', '#ffa502'];
export const AI_COLORS = ['#7bed9f', '#c56cf0', '#a4b0be', '#48dbfb'];
