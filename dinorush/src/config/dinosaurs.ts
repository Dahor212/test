import type { Archetype, DinosaurAbility, DinosaurDefinition, AbilityId } from '../types';

export const ARCHETYPES: Archetype[] = ['raptor', 'spino', 'ankylo', 'trike'];

export interface ArchetypeInfo {
  id: Archetype;
  species: string;
  role: string;
  /** UI colour (CSS). */
  color: string;
  colorDark: string;
  ability: AbilityId;
  specialty: string;
  /** Keyboard shortcuts per seat. */
}

export const ARCHETYPE_INFO: Record<Archetype, ArchetypeInfo> = {
  raptor: {
    id: 'raptor',
    species: 'Velociraptor',
    role: 'RYCHLÍK',
    color: '#4cd137',
    colorDark: '#2a8a1c',
    ability: 'superSprint',
    specialty: 'Tráva, hlína, pevná cesta',
  },
  spino: {
    id: 'spino',
    species: 'Spinosaurus',
    role: 'PLAVEC',
    color: '#2e86ff',
    colorDark: '#1a4fa8',
    ability: 'waterWave',
    specialty: 'Řeky, jezera, zaplavené cesty',
  },
  ankylo: {
    id: 'ankylo',
    species: 'Ankylosaurus',
    role: 'BOURÁK',
    color: '#ff8c1a',
    colorDark: '#b35800',
    ability: 'unstoppableSmash',
    specialty: 'Kameny, skály, dřevěné bariéry',
  },
  trike: {
    id: 'trike',
    species: 'Triceratops',
    role: 'TEREŇÁK',
    color: '#a55eea',
    colorDark: '#6b2fae',
    ability: 'unstoppableAdvance',
    specialty: 'Bahno, písek, sníh, led',
  },
};

export const ABILITIES: Record<AbilityId, DinosaurAbility> = {
  superSprint: {
    id: 'superSprint',
    name: 'SUPER SPRINT',
    description: 'Nabíjí se během na pevné zemi. Pak krátce vystřelí vpřed!',
    chargeSource: 'firmDistance',
    activeOn: ['firm'],
    speedMultiplier: 1.32,
    duration: 2.6,
  },
  waterWave: {
    id: 'waterWave',
    name: 'VODNÍ VLNA',
    description: 'Nabíjí se plaváním. Pak se sveze na obří vlně!',
    chargeSource: 'waterDistance',
    activeOn: ['water'],
    speedMultiplier: 1.38,
    duration: 2.4,
  },
  unstoppableSmash: {
    id: 'unstoppableSmash',
    name: 'NEZASTAVITELNÝ NÁRAZ',
    description: 'Nabíjí se rozbíjením. Pak prorazí překážky bez zpomalení!',
    chargeSource: 'smash',
    activeOn: ['smash'],
    speedMultiplier: 1.3,
    duration: 3.2,
  },
  unstoppableAdvance: {
    id: 'unstoppableAdvance',
    name: 'NEZASTAVITELNÝ POSTUP',
    description: 'Nabíjí se v bahně, písku a sněhu. Pak jím projde jako nic!',
    chargeSource: 'roughDistance',
    activeOn: ['rough'],
    speedMultiplier: 1.32,
    duration: 2.8,
  },
};

/**
 * Registry of all dinosaurs. Starters are unlocked from the beginning, the
 * rest come from eggs. New dinos of the same archetype can be added here
 * without touching game logic.
 */
export const DINOSAURS: DinosaurDefinition[] = [
  {
    id: 'raptor-green',
    name: 'Rychloun',
    species: 'Velociraptor',
    archetype: 'raptor',
    role: 'RYCHLÍK',
    palette: { body: 0x4cd137, belly: 0xc8f7a0, accent: 0x1e8a3a, detail: 0xffd32a, effect: 'none' },
    rarity: 1,
    starter: true,
    description: 'Nejrychlejší běžec na pevné zemi.',
  },
  {
    id: 'spino-blue',
    name: 'Ploutvík',
    species: 'Spinosaurus',
    archetype: 'spino',
    role: 'PLAVEC',
    palette: { body: 0x2e86ff, belly: 0xbfe0ff, accent: 0x00d2d3, detail: 0xff6b81, effect: 'none' },
    rarity: 1,
    starter: true,
    description: 'Ve vodě je jako doma.',
  },
  {
    id: 'ankylo-orange',
    name: 'Bouchálek',
    species: 'Ankylosaurus',
    archetype: 'ankylo',
    role: 'BOURÁK',
    palette: { body: 0xff8c1a, belly: 0xffd8a8, accent: 0x9c4a00, detail: 0xfff3b0, effect: 'none' },
    rarity: 1,
    starter: true,
    description: 'Prorazí kameny i dřevěné zdi.',
  },
  {
    id: 'trike-purple',
    name: 'Rohatka',
    species: 'Triceratops',
    archetype: 'trike',
    role: 'TEREŇÁK',
    palette: { body: 0xa55eea, belly: 0xe5ccff, accent: 0x6b2fae, detail: 0xfff7e0, effect: 'none' },
    rarity: 1,
    starter: true,
    description: 'Bahno, písek ani sníh ho nezastaví.',
  },
  // ---- Unlockable variants --------------------------------------------------
  {
    id: 'raptor-blue',
    name: 'Blesk',
    species: 'Velociraptor',
    archetype: 'raptor',
    role: 'RYCHLÍK',
    palette: { body: 0x3fa9f5, belly: 0xd6f0ff, accent: 0x1b5fa8, detail: 0xfff200, effect: 'sparkle' },
    rarity: 2,
    starter: false,
    perk: { kind: 'abilityCharge', value: 0.15, description: 'SUPER SPRINT se nabíjí o 15 % rychleji (sólo)' },
    description: 'Modrý sprinter s bleskovými pruhy.',
  },
  {
    id: 'spino-teal',
    name: 'Vlnka',
    species: 'Spinosaurus',
    archetype: 'spino',
    role: 'PLAVEC',
    palette: { body: 0x00c9a7, belly: 0xd4fff4, accent: 0x00808a, detail: 0xffe066, effect: 'sparkle' },
    rarity: 2,
    starter: false,
    perk: { kind: 'abilityDuration', value: 0.2, description: 'VODNÍ VLNA vydrží o 20 % déle (sólo)' },
    description: 'Tyrkysový mistr vln.',
  },
  {
    id: 'ankylo-red',
    name: 'Kladivo',
    species: 'Ankylosaurus',
    archetype: 'ankylo',
    role: 'BOURÁK',
    palette: { body: 0xe84118, belly: 0xffc2a8, accent: 0x7a1c06, detail: 0xffd32a, effect: 'none' },
    rarity: 2,
    starter: false,
    perk: { kind: 'abilityCharge', value: 0.2, description: 'NÁRAZ se nabíjí o 20 % rychleji (sólo)' },
    description: 'Červený bourák s obří palicí.',
  },
  {
    id: 'trike-ice',
    name: 'Mrazík',
    species: 'Triceratops',
    archetype: 'trike',
    role: 'TEREŇÁK',
    palette: { body: 0x9fe8ff, belly: 0xffffff, accent: 0x4aa3c9, detail: 0xe0f7ff, effect: 'frost' },
    rarity: 2,
    starter: false,
    perk: { kind: 'terrainSpeed', value: 0.03, terrains: ['snow', 'ice'], description: 'O 3 % rychlejší na sněhu a ledu (sólo)' },
    description: 'Ledový triceratops z daleké severní říše.',
  },
  {
    id: 'raptor-gold',
    name: 'Zlaťák',
    species: 'Velociraptor',
    archetype: 'raptor',
    role: 'RYCHLÍK',
    palette: { body: 0xffc312, belly: 0xfff5c2, accent: 0xc08000, detail: 0xff5e57, effect: 'gold' },
    rarity: 3,
    starter: false,
    perk: { kind: 'comboCoins', value: 0.25, description: 'O 25 % více mincí za kombo (sólo)' },
    description: 'Zlatý raptor, který přitahuje mince.',
  },
  {
    id: 'trike-rainbow',
    name: 'Duháček',
    species: 'Triceratops',
    archetype: 'trike',
    role: 'TEREŇÁK',
    palette: { body: 0xff6bcb, belly: 0xfff0fa, accent: 0x7d5fff, detail: 0x32ff7e, effect: 'rainbow' },
    rarity: 3,
    starter: false,
    perk: { kind: 'perfectBoost', value: 0.25, description: 'Bonus za perfektní proměnu vydrží o 25 % déle (sólo)' },
    description: 'Duhový dinosaurus pro radost.',
  },
  {
    id: 'spino-lava',
    name: 'Žhavka',
    species: 'Spinosaurus',
    archetype: 'spino',
    role: 'PLAVEC',
    palette: { body: 0x6c2a1a, belly: 0xffb38a, accent: 0xff6b1a, detail: 0xffe066, effect: 'none' },
    rarity: 2,
    starter: false,
    perk: { kind: 'terrainSpeed', value: 0.03, terrains: ['deepWater'], description: 'O 3 % rychlejší v hluboké vodě (sólo)' },
    description: 'Spinosaurus ze Sopkového údolí s žhnoucí plachtou.',
  },
  {
    id: 'ankylo-moss',
    name: 'Mechoun',
    species: 'Ankylosaurus',
    archetype: 'ankylo',
    role: 'BOURÁK',
    palette: { body: 0x6ab04c, belly: 0xe1f7c9, accent: 0x3d6b22, detail: 0xf9ca24, effect: 'none' },
    rarity: 2,
    starter: false,
    perk: { kind: 'abilityDuration', value: 0.2, description: 'NÁRAZ vydrží o 20 % déle (sólo)' },
    description: 'Ankylosaurus porostlý mechem z džungle.',
  },
];

export const DINO_BY_ID: Record<string, DinosaurDefinition> = Object.fromEntries(DINOSAURS.map((d) => [d.id, d]));

export const STARTER_LINEUP: Record<Archetype, string> = {
  raptor: 'raptor-green',
  spino: 'spino-blue',
  ankylo: 'ankylo-orange',
  trike: 'trike-purple',
};

export interface AccessoryDefinition {
  id: string;
  name: string;
  color: number;
}

export const ACCESSORIES: AccessoryDefinition[] = [
  { id: 'partyHat', name: 'Párty čepička', color: 0xff4757 },
  { id: 'sunglasses', name: 'Sluneční brýle', color: 0x2f3542 },
  { id: 'crown', name: 'Korunka', color: 0xffc312 },
  { id: 'scarf', name: 'Šála', color: 0xff6b81 },
  { id: 'flower', name: 'Kytička', color: 0xff9ff3 },
];

export const ACCESSORY_BY_ID: Record<string, AccessoryDefinition> = Object.fromEntries(ACCESSORIES.map((a) => [a.id, a]));
