import { hashString } from '../core/rng';
import type { CampaignLevel, CampaignMode, StarGoal, WorldId } from '../types';
import { WORLD_IDS } from './worlds';

/**
 * Adventure campaign: every world is a stretch of the map with five levels
 * and a T-Rex boss at its end. Tracks are fixed (seeded per level), so
 * children can learn them and race against their own ghost.
 */
export const LEVELS_PER_WORLD = 6;

const TITLES: Record<WorldId, string[]> = {
  jungle: ['Ranní rozcvička', 'Zlaté kapradí', 'Přes řeku', 'T-Rex se probouzí', 'Velký závod džungle', 'Král džungle'],
  volcano: ['Teplé kameny', 'Zlatá láva', 'Mosty nad lávou', 'Útěk z kráteru', 'Sopečný závod', 'Lávový T-Rex'],
  ice: ['Kluzký start', 'Zamrzlé mince', 'Ledová jezera', 'Sněžná honička', 'Polární závod', 'Mrazivý T-Rex'],
  islands: ['Plážová rozcvička', 'Poklad ostrovů', 'Z ostrova na ostrov', 'Útěk po pláži', 'Velký ostrovní závod', 'T-Rex Obr'],
};

/** Name of the boss T-Rex shown in the race and on the map. */
export const BOSS_NAMES: Record<WorldId, string> = {
  jungle: 'Král džungle',
  volcano: 'Lávový T-Rex',
  ice: 'Mrazivý T-Rex',
  islands: 'T-Rex Obr',
};

interface Template {
  mode: CampaignMode;
  length: number;
  ai: CampaignLevel['ai'];
  trexFactor: number;
  goals: (w: number) => [StarGoal, StarGoal, StarGoal];
}

/** Level templates; w = world index (0–3) makes later worlds a bit harder. */
const TEMPLATES: Template[] = [
  {
    mode: 'classic',
    length: 650,
    ai: 'easy',
    trexFactor: 1,
    goals: (w) => [{ kind: 'place', value: 3 }, { kind: 'place', value: 1 }, { kind: 'perfects', value: 2 + Math.floor(w / 2) }],
  },
  {
    mode: 'goldRush',
    length: 800,
    ai: 'easy',
    trexFactor: 1,
    goals: (w) => [{ kind: 'place', value: 3 }, { kind: 'place', value: 1 }, { kind: 'combo', value: 4 + Math.floor(w / 2) }],
  },
  {
    mode: 'classic',
    length: 950,
    ai: 'normal',
    trexFactor: 1,
    goals: (w) => [
      { kind: 'place', value: 3 },
      { kind: 'place', value: 1 },
      w === 1 ? { kind: 'smash', value: 4 } : { kind: 'mistakes', value: Math.max(1, 3 - Math.floor(w / 2)) },
    ],
  },
  {
    mode: 'trex',
    length: 850,
    ai: 'normal',
    trexFactor: 1,
    goals: (w) => [{ kind: 'escape', value: 1 }, { kind: 'lead', value: 20 + w * 3 }, { kind: 'perfects', value: 3 + Math.floor(w / 2) }],
  },
  {
    mode: 'classic',
    length: 1100,
    ai: 'normal',
    trexFactor: 1,
    goals: (w) => [{ kind: 'place', value: 3 }, { kind: 'place', value: 1 }, { kind: 'combo', value: 6 + Math.floor(w / 2) }],
  },
  {
    mode: 'trex',
    length: 950,
    ai: 'hard',
    trexFactor: 1.045,
    goals: (w) => [{ kind: 'escape', value: 1 }, { kind: 'lead', value: 15 + w * 2 }, { kind: 'mistakes', value: 2 }],
  },
];

function buildLevels(): CampaignLevel[] {
  const out: CampaignLevel[] = [];
  WORLD_IDS.forEach((world, w) => {
    TEMPLATES.forEach((t, i) => {
      const id = `${world}-${i + 1}`;
      out.push({
        id,
        world,
        index: i,
        number: w * LEVELS_PER_WORLD + i + 1,
        title: TITLES[world][i],
        mode: t.mode,
        boss: i === LEVELS_PER_WORLD - 1,
        length: Math.round(t.length * (1 + w * 0.04)),
        ai: t.ai,
        trexFactor: t.trexFactor + (i === LEVELS_PER_WORLD - 1 ? w * 0.004 : 0),
        seed: hashString(`campaign:${id}`) % 1_000_000,
        goals: t.goals(w),
      });
    });
  });
  return out;
}

export const CAMPAIGN_LEVELS: CampaignLevel[] = buildLevels();
export const LEVEL_BY_ID: Record<string, CampaignLevel> = Object.fromEntries(CAMPAIGN_LEVELS.map((l) => [l.id, l]));

export const CAMPAIGN_REWARDS = {
  /** Coins for every new star (first time it is earned). */
  perStar: 20,
  /** First win over a world boss. */
  bossCoins: 100,
  bossEggs: 1,
};

/** Kid-friendly goal text. */
export function goalText(g: StarGoal): string {
  switch (g.kind) {
    case 'place':
      return g.value === 1 ? 'Vyhraj závod' : `Doběhni do ${g.value}. místa`;
    case 'escape':
      return 'Uteč T-Rexovi';
    case 'lead':
      return `Náskok před T-Rexem ${g.value} m`;
    case 'perfects':
      return `${g.value}× perfektní proměna`;
    case 'combo':
      return `Kombo ${g.value}×`;
    case 'smash':
      return `Rozbij ${g.value} překážky`;
    case 'mistakes':
      return g.value <= 1 ? 'Nejvýš 1 chyba' : `Nejvýš ${g.value} chyby`;
  }
}

export function goalIcon(g: StarGoal): string {
  switch (g.kind) {
    case 'place':
      return g.value === 1 ? 'trophy' : 'flag';
    case 'escape':
    case 'lead':
      return 'trex';
    case 'perfects':
      return 'star';
    case 'combo':
      return 'combo';
    case 'smash':
      return 'stones';
    case 'mistakes':
      return 'check';
  }
}
