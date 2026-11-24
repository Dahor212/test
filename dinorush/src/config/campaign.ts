import { hashString } from '../core/rng';
import type { Archetype, CampaignLevel, CampaignMode, RegionDefinition, RegionId, StarGoal, TerrainId, TrackStyle, WorldLook } from '../types';

/**
 * Career map ("Dobrodružství"): one island with six regions. Every place is
 * a race whose track comes from the landscape around it – swamps are full
 * of mud and water, the canyon of sand and rocks, the Ice Age of snow and
 * ice. Paths connect the places; a place opens when you earn a star on a
 * place it is reached from. After the jungle the path splits in two.
 */

export const REGIONS: Record<RegionId, RegionDefinition> = {
  jungle: {
    id: 'jungle',
    name: 'Pravěký prales',
    subtitle: 'Kapradiny, říčky a padlé kmeny',
    world: 'jungle',
    terrainPool: { grass: 3, path: 2, water: 3, deepWater: 1, stones: 2, woodBarrier: 2 },
    colors: ['#43e97b', '#2f9e55'],
    badge: 'Odznak pralesa',
  },
  swamp: {
    id: 'swamp',
    name: 'Mlžné bažiny',
    subtitle: 'Bahno, rákosí a mlha',
    world: 'jungle',
    terrainPool: { mud: 4, water: 3, deepWater: 1, grass: 2, woodBarrier: 2, path: 1 },
    look: {
      sky: { top: 0x7fa39b, bottom: 0xd3e2c4 },
      fog: 0xa7bfa0,
      fogNear: 35,
      fogFar: 150,
      ambient: 0xe8f2dc,
      sunIntensity: 1.6,
      ground: 0x5a8a3c,
      ground2: 0x41702f,
      weather: 'rain',
      scenery: 'swamp',
    },
    colors: ['#78b37a', '#3f7a4f'],
    badge: 'Odznak bažin',
  },
  canyon: {
    id: 'canyon',
    name: 'Písečný kaňon',
    subtitle: 'Rudé skály, písek a suť',
    world: 'volcano',
    terrainPool: { sand: 4, scree: 2, stones: 3, path: 3, mud: 1, water: 1 },
    look: {
      sky: { top: 0x4f9de0, bottom: 0xffd9a3 },
      fog: 0xf2c48c,
      fogNear: 70,
      fogFar: 200,
      ambient: 0xfff0dc,
      sun: 0xffe2a8,
      sunIntensity: 2.4,
      ground: 0xd99a5b,
      ground2: 0xbf7c40,
      weather: 'none',
      scenery: 'canyon',
    },
    colors: ['#f6b26b', '#d9772b'],
    badge: 'Odznak kaňonu',
  },
  volcano: {
    id: 'volcano',
    name: 'Sopečné údolí',
    subtitle: 'Lávové mosty a horké prameny',
    world: 'volcano',
    terrainPool: { path: 3, bridge: 2, scree: 3, stones: 2, water: 1, deepWater: 1, sand: 2, mud: 1, chasm: 2 },
    colors: ['#ff7f50', '#a8412a'],
    badge: 'Odznak sopky',
  },
  ice: {
    id: 'ice',
    name: 'Ledová doba',
    subtitle: 'Sníh, led a zamrzlá jezera',
    world: 'ice',
    terrainPool: { path: 2, grass: 1, snow: 3, ice: 3, water: 2, deepWater: 1, stones: 2, scree: 1, chasm: 2 },
    colors: ['#a8dcff', '#5aa9e6'],
    badge: 'Odznak ledové doby',
  },
  islands: {
    id: 'islands',
    name: 'Dinosauří ostrovy',
    subtitle: 'Pláže, palmy a laguny',
    world: 'islands',
    terrainPool: { sand: 3, grass: 2, bridge: 2, water: 3, deepWater: 2, woodBarrier: 2, stones: 1, mud: 1, chasm: 2 },
    colors: ['#4dd0e1', '#1e9fb3'],
    badge: 'Odznak ostrovů',
  },
};

export const REGION_LIST = Object.values(REGIONS);

/** Fossils found for three stars (kid-friendly names, one per place). */
export const FOSSILS: Record<string, { name: string; icon: string }> = {
  tooth: { name: 'Zub T-Rexe', icon: 'f-tooth' },
  claw: { name: 'Srpovitý dráp', icon: 'f-claw' },
  leaf: { name: 'Zkamenělá kapradina', icon: 'f-leaf' },
  amber: { name: 'Jantar s komárem', icon: 'f-amber' },
  footprint: { name: 'Stopa ve skále', icon: 'f-foot' },
  shell: { name: 'Amonit', icon: 'f-shell' },
  egg: { name: 'Zkamenělé vajíčko', icon: 'f-egg' },
  skull: { name: 'Malá lebka', icon: 'f-skull' },
  bone: { name: 'Stehenní kost', icon: 'f-bone' },
  feather: { name: 'Otisk pírka', icon: 'f-feather' },
  plate: { name: 'Hřbetní ploténka', icon: 'f-plate' },
  horn: { name: 'Roh triceratopse', icon: 'f-horn' },
  scale: { name: 'Otisk šupin', icon: 'f-scale' },
  fish: { name: 'Zkamenělá ryba', icon: 'f-fish' },
  vertebra: { name: 'Obratel', icon: 'f-bone' },
  mammoth: { name: 'Klopýtající kámen', icon: 'f-foot' },
  crystal: { name: 'Lávový krystal', icon: 'f-amber' },
  coral: { name: 'Pravěký korál', icon: 'f-shell' },
  dome: { name: 'Lebka tvrdohlavce', icon: 'f-skull' },
  spike: { name: 'Ocasní bodec', icon: 'f-claw' },
  nest: { name: 'Hnízdo s vajíčky', icon: 'f-egg' },
  pebble: { name: 'Žaludeční kamínek', icon: 'f-amber' },
  icefern: { name: 'Zamrzlá kapradina', icon: 'f-leaf' },
  sandtooth: { name: 'Zub z písku', icon: 'f-tooth' },
};

interface PlaceSpec {
  title: string;
  mode: CampaignMode;
  x: number;
  y: number;
  length?: number;
  ai?: CampaignLevel['ai'];
  boss?: 'trex' | 'rival';
  friend?: string;
  fossil?: string;
  pool?: Partial<Record<TerrainId, number>>;
  look?: WorldLook;
  goals?: [StarGoal, StarGoal, StarGoal];
  style?: TrackStyle;
  focus?: TerrainId;
}

/**
 * Level design of each place: its rhythm and its main terrain. Places that
 * introduce a new dinosaur role are calm ("teach") and focus on its
 * terrain; bosses are rhythmic; the fourth place of a region tests stamina.
 */
const DESIGN: Record<string, { style: TrackStyle; focus?: TerrainId }> = {
  'jungle-1': { style: 'teach' },
  'jungle-2': { style: 'teach', focus: 'water' },
  'jungle-3': { style: 'teach', focus: 'stones' },
  'jungle-4': { style: 'endurance', focus: 'woodBarrier' },
  'jungle-5': { style: 'rhythm' },
  'swamp-1': { style: 'teach', focus: 'mud' },
  'swamp-2': { style: 'rhythm', focus: 'water' },
  'swamp-3': { style: 'flow', focus: 'water' },
  'swamp-4': { style: 'endurance', focus: 'mud' },
  'swamp-5': { style: 'flow' },
  'canyon-1': { style: 'teach', focus: 'sand' },
  'canyon-2': { style: 'rhythm', focus: 'path' },
  'canyon-3': { style: 'flow', focus: 'sand' },
  'canyon-4': { style: 'endurance', focus: 'scree' },
  'canyon-5': { style: 'flow' },
  'ice-1': { style: 'teach', focus: 'chasm' },
  'ice-2': { style: 'rhythm', focus: 'snow' },
  'ice-3': { style: 'flow', focus: 'snow' },
  'ice-4': { style: 'endurance', focus: 'ice' },
  'ice-5': { style: 'rhythm' },
  'volcano-1': { style: 'teach', focus: 'chasm' },
  'volcano-2': { style: 'flow', focus: 'bridge' },
  'volcano-3': { style: 'endurance', focus: 'stones' },
  'volcano-4': { style: 'rhythm', focus: 'chasm' },
  'volcano-5': { style: 'rhythm' },
  'islands-1': { style: 'flow' },
  'islands-2': { style: 'rhythm', focus: 'water' },
  'islands-3': { style: 'flow', focus: 'woodBarrier' },
  'islands-4': { style: 'endurance', focus: 'chasm' },
  'islands-5': { style: 'flow' },
};

const race = (third: StarGoal): [StarGoal, StarGoal, StarGoal] => [{ kind: 'place', value: 3 }, { kind: 'place', value: 1 }, third];
const rival = (third: StarGoal): [StarGoal, StarGoal, StarGoal] => [{ kind: 'rival', value: 1 }, { kind: 'place', value: 1 }, third];
const chase = (lead: number, third: StarGoal): [StarGoal, StarGoal, StarGoal] => [{ kind: 'escape', value: 1 }, { kind: 'lead', value: lead }, third];

const PLACES: Record<RegionId, PlaceSpec[]> = {
  jungle: [
    { title: 'Kapradinový palouk', mode: 'classic', x: 110, y: 610, length: 600, ai: 'easy', fossil: 'leaf', pool: { grass: 3, path: 2, water: 3 }, goals: race({ kind: 'perfects', value: 2 }) },
    { title: 'Říčka u vodopádu', mode: 'classic', x: 205, y: 580, length: 700, ai: 'easy', fossil: 'fish', pool: { grass: 3, water: 4, deepWater: 1, path: 2 }, goals: race({ kind: 'combo', value: 4 }) },
    { title: 'Hřebínkova mýtina', mode: 'goldRush', x: 150, y: 500, length: 800, ai: 'easy', friend: 'dilo-jungle', fossil: 'claw', pool: { grass: 3, path: 2, water: 2, stones: 3, woodBarrier: 2 }, goals: race({ kind: 'smash', value: 3 }) },
    { title: 'Padlé kmeny', mode: 'classic', x: 250, y: 460, length: 900, ai: 'normal', fossil: 'amber', pool: { grass: 3, woodBarrier: 4, path: 2, water: 2, stones: 1 }, goals: race({ kind: 'smash', value: 4 }) },
    { title: 'Král džungle', mode: 'trex', x: 345, y: 520, length: 900, ai: 'hard', boss: 'trex', goals: chase(15, { kind: 'mistakes', value: 2 }) },
  ],
  swamp: [
    { title: 'Bahnitá stezka', mode: 'classic', x: 300, y: 385, ai: 'easy', fossil: 'footprint', goals: race({ kind: 'perfects', value: 2 }) },
    { title: 'Rákosová laguna', mode: 'goldRush', x: 200, y: 360, fossil: 'shell', pool: { water: 4, deepWater: 2, mud: 3, grass: 2, woodBarrier: 1 }, goals: race({ kind: 'combo', value: 5 }) },
    { title: 'Rybářova zátoka', mode: 'classic', x: 110, y: 300, friend: 'bary-river', fossil: 'scale', pool: { water: 4, deepWater: 2, mud: 2, grass: 2, path: 1, stones: 1 }, goals: race({ kind: 'mistakes', value: 3 }) },
    { title: 'Mlhavá mokřina', mode: 'trex', x: 185, y: 225, fossil: 'egg', goals: chase(20, { kind: 'perfects', value: 3 }) },
    { title: 'Bahenní šampion', mode: 'classic', x: 290, y: 195, boss: 'rival', ai: 'hard', goals: rival({ kind: 'combo', value: 6 }) },
  ],
  canyon: [
    { title: 'Rudé skály', mode: 'classic', x: 445, y: 560, ai: 'easy', fossil: 'sandtooth', goals: race({ kind: 'perfects', value: 2 }) },
    { title: 'Pštrosí pláň', mode: 'goldRush', x: 530, y: 620, friend: 'galli-sand', fossil: 'feather', pool: { sand: 3, path: 4, stones: 2, scree: 1, mud: 1 }, goals: race({ kind: 'combo', value: 5 }) },
    { title: 'Bodlinčin úkryt', mode: 'classic', x: 615, y: 575, friend: 'styraco-desert', fossil: 'horn', pool: { sand: 4, mud: 2, stones: 3, path: 2 }, goals: race({ kind: 'smash', value: 4 }) },
    { title: 'Ozvěna kaňonu', mode: 'trex', x: 560, y: 495, fossil: 'skull', goals: chase(20, { kind: 'perfects', value: 3 }) },
    { title: 'Pán kaňonu', mode: 'classic', x: 650, y: 455, boss: 'rival', ai: 'hard', goals: rival({ kind: 'mistakes', value: 2 }) },
  ],
  volcano: [
    { title: 'Kouřící průrva', mode: 'classic', x: 600, y: 405, ai: 'easy', fossil: 'pebble', pool: { water: 2, path: 3, scree: 2, stones: 2, chasm: 3 }, goals: race({ kind: 'perfects', value: 3 }) },
    { title: 'Lávové mosty', mode: 'classic', x: 510, y: 345, fossil: 'crystal', pool: { bridge: 4, path: 3, scree: 2, stones: 1, mud: 1 }, goals: race({ kind: 'combo', value: 5 }) },
    { title: 'Tvrdohlavcova skála', mode: 'classic', x: 565, y: 265, friend: 'pachy-rock', fossil: 'dome', pool: { stones: 4, scree: 2, path: 2, sand: 2, water: 1 }, goals: race({ kind: 'smash', value: 5 }) },
    { title: 'Popelová pláň', mode: 'goldRush', x: 665, y: 250, fossil: 'vertebra', goals: race({ kind: 'combo', value: 6 }) },
    { title: 'Lávový T-Rex', mode: 'trex', x: 745, y: 320, boss: 'trex', ai: 'hard', goals: chase(18, { kind: 'mistakes', value: 2 }) },
  ],
  ice: [
    { title: 'Ledová rokle', mode: 'classic', x: 385, y: 150, ai: 'easy', fossil: 'icefern', pool: { ice: 3, snow: 2, path: 2, water: 1, chasm: 3 }, goals: race({ kind: 'perfects', value: 3 }) },
    { title: 'Sněžné pole', mode: 'goldRush', x: 470, y: 100, fossil: 'mammoth', pool: { snow: 4, path: 2, stones: 2, water: 1, ice: 1 }, goals: race({ kind: 'combo', value: 5 }) },
    { title: 'Dlouhánův průsmyk', mode: 'classic', x: 560, y: 135, friend: 'brachio-ice', fossil: 'bone', pool: { snow: 3, ice: 2, stones: 2, path: 2, water: 1 }, goals: race({ kind: 'mistakes', value: 3 }) },
    { title: 'Ledopád', mode: 'trex', x: 630, y: 80, fossil: 'tooth', goals: chase(22, { kind: 'perfects', value: 4 }) },
    { title: 'Mrazivý T-Rex', mode: 'trex', x: 715, y: 120, boss: 'trex', ai: 'hard', goals: chase(18, { kind: 'mistakes', value: 2 }) },
  ],
  islands: [
    { title: 'Plážová rozcvička', mode: 'classic', x: 810, y: 195, ai: 'easy', fossil: 'coral', goals: race({ kind: 'perfects', value: 3 }) },
    { title: 'Korálová laguna', mode: 'goldRush', x: 895, y: 150, fossil: 'nest', pool: { water: 4, deepWater: 2, sand: 3, grass: 1, stones: 1 }, goals: race({ kind: 'combo', value: 6 }) },
    { title: 'Ploténčin háj', mode: 'classic', x: 935, y: 250, friend: 'stego-forest', fossil: 'plate', pool: { grass: 3, woodBarrier: 3, sand: 2, water: 2, stones: 1 }, goals: race({ kind: 'smash', value: 5 }) },
    { title: 'Pirátská zátoka', mode: 'trex', x: 860, y: 320, fossil: 'spike', goals: chase(24, { kind: 'perfects', value: 4 }) },
    { title: 'T-Rex Obr', mode: 'trex', x: 935, y: 410, boss: 'trex', ai: 'hard', goals: chase(20, { kind: 'mistakes', value: 2 }) },
  ],
};

/**
 * Time of day and storms: most places race in daylight, some at sunset
 * (warm low sun, long shadows), some at night (moon, stars, fireflies,
 * lanterns along the trail) and the swamp champion in a thunderstorm.
 */
const SKY: Record<string, WorldLook> = {
  'jungle-4': { time: 'sunset' },
  'jungle-5': { time: 'sunset' },
  'swamp-4': { time: 'night' },
  'swamp-5': { weather: 'storm' },
  'canyon-3': { time: 'sunset' },
  'canyon-5': { time: 'sunset' },
  'ice-2': { time: 'night' },
  'ice-4': { time: 'sunset' },
  'volcano-4': { time: 'night' },
  'volcano-5': { time: 'night' },
  'islands-2': { time: 'sunset' },
  'islands-4': { time: 'night' },
  'islands-5': { weather: 'storm', time: 'sunset' },
};

/** Where each region is entered from (the last place of the region before). */
const ENTRY: Record<RegionId, RegionId[]> = {
  jungle: [],
  swamp: ['jungle'],
  canyon: ['jungle'],
  ice: ['swamp'],
  volcano: ['canyon'],
  islands: ['ice', 'volcano'],
};

const ORDER: RegionId[] = ['jungle', 'swamp', 'canyon', 'ice', 'volcano', 'islands'];
const DIFFICULTY_STEP: Record<RegionId, number> = { jungle: 0, swamp: 1, canyon: 1, ice: 2, volcano: 2, islands: 3 };
const DEFAULT_LENGTH: Record<CampaignMode, number> = { classic: 950, goldRush: 850, trex: 900 };

export const LEVELS_PER_REGION = 5;

/** Name of the boss shown in the race and on the map. */
export const BOSS_NAMES: Record<RegionId, string> = Object.fromEntries(ORDER.map((r) => [r, PLACES[r][LEVELS_PER_REGION - 1].title])) as Record<RegionId, string>;

function buildLevels(): CampaignLevel[] {
  const out: CampaignLevel[] = [];
  let number = 0;
  for (const region of ORDER) {
    const reg = REGIONS[region];
    const step = DIFFICULTY_STEP[region];
    PLACES[region].forEach((pl, i) => {
      const id = `${region}-${i + 1}`;
      const from = i > 0 ? [`${region}-${i}`] : ENTRY[region].map((r) => `${r}-${LEVELS_PER_REGION}`);
      const base = pl.length ?? DEFAULT_LENGTH[pl.mode];
      out.push({
        id,
        region,
        world: reg.world,
        index: i,
        number: ++number,
        title: pl.title,
        mode: pl.mode,
        boss: !!pl.boss,
        bossKind: pl.boss,
        friend: pl.friend,
        fossil: pl.fossil,
        x: pl.x,
        y: pl.y,
        from,
        length: Math.round(base * (1 + step * 0.04)),
        ai: pl.ai ?? (i === 0 ? 'easy' : 'normal'),
        // T-Rex speed: normal chase places run with the default T-Rex, bosses are faster
        trexFactor: pl.mode === 'trex' ? (pl.boss ? 1.045 + step * 0.004 : 1) : 1,
        seed: hashString(`career:${id}`) % 1_000_000,
        terrainPool: pl.pool ?? reg.terrainPool,
        look: { ...(reg.look ?? {}), ...(pl.look ?? {}), ...(SKY[id] ?? {}) },
        goals: pl.goals ?? race({ kind: 'perfects', value: 2 }),
        style: DESIGN[id]?.style ?? 'flow',
        focus: DESIGN[id]?.focus,
      });
    });
  }
  return out;
}

export const CAMPAIGN_LEVELS: CampaignLevel[] = buildLevels();
export const LEVEL_BY_ID: Record<string, CampaignLevel> = Object.fromEntries(CAMPAIGN_LEVELS.map((l) => [l.id, l]));
export const START_LEVEL = CAMPAIGN_LEVELS[0].id;

export const CAMPAIGN_REWARDS = {
  /** Coins for every new star (first time it is earned). */
  perStar: 20,
  /** First win over a region boss. */
  bossCoins: 100,
  bossEggs: 1,
};

/**
 * New dinosaur roles join the team at milestones of the map: the career
 * starts with RYCHLÍK and PLAVEC only; tracks of a place only contain the
 * terrains of the roles a child has by then.
 */
export const ROLE_MILESTONES: { role: Archetype; after: string[]; text: string }[] = [
  { role: 'ankylo', after: ['jungle-2'], text: 'Teď už rozbiješ kameny i dřevěné zdi!' },
  { role: 'trike', after: ['jungle-5'], text: 'Bahno, písek ani sníh tě nezastaví!' },
  { role: 'ptero', after: ['swamp-5', 'canyon-5'], text: 'Přeletíš každou propast!' },
];

/** Explorer levels – kid-friendly titles and what reaching them gives. */
export const EXPLORER_LEVELS: { xp: number; title: string; reward: { coins?: number; eggs?: number } }[] = [
  { xp: 0, title: 'Vajíčko', reward: {} },
  { xp: 60, title: 'Mládě', reward: { coins: 100 } },
  { xp: 160, title: 'Průzkumník', reward: { eggs: 1 } },
  { xp: 300, title: 'Stopař', reward: { coins: 200 } },
  { xp: 480, title: 'Závodník', reward: { eggs: 1 } },
  { xp: 700, title: 'Šampion', reward: { coins: 300 } },
  { xp: 980, title: 'Dino legenda', reward: { eggs: 2 } },
];

/** Explorer XP for one career race. */
export const CAREER_XP = { finish: 10, perNewStar: 20, bossFirst: 50, friend: 20 };

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
    case 'rival':
      return 'Předběhni šampiona';
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
    case 'rival':
      return 'trophy';
  }
}

/** Participant id of the named champion in rival boss races. */
export const RIVAL_ID = 'ai0';
