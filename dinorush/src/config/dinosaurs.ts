import type { Archetype, DinosaurAbility, DinosaurDefinition, AbilityId } from '../types';

export const ARCHETYPES: Archetype[] = ['raptor', 'spino', 'ankylo', 'trike'];

export interface ArchetypeInfo {
  id: Archetype;
  species: string;
  /** Czech accusative ("Klepni na …"). */
  accusative: string;
  role: string;
  /** UI colour (CSS). */
  color: string;
  colorDark: string;
  ability: AbilityId;
  specialty: string;
}

export const ARCHETYPE_INFO: Record<Archetype, ArchetypeInfo> = {
  raptor: {
    id: 'raptor',
    species: 'Velociraptor',
    accusative: 'Velociraptora',
    role: 'RYCHLÍK',
    color: '#4cd137',
    colorDark: '#2a8a1c',
    ability: 'superSprint',
    specialty: 'Tráva, hlína, pevná cesta',
  },
  spino: {
    id: 'spino',
    species: 'Spinosaurus',
    accusative: 'Spinosaura',
    role: 'PLAVEC',
    color: '#2e86ff',
    colorDark: '#1a4fa8',
    ability: 'waterWave',
    specialty: 'Řeky, jezera, zaplavené cesty',
  },
  ankylo: {
    id: 'ankylo',
    species: 'Ankylosaurus',
    accusative: 'Ankylosaura',
    role: 'BOURÁK',
    color: '#ff8c1a',
    colorDark: '#b35800',
    ability: 'unstoppableSmash',
    specialty: 'Kameny, skály, dřevěné bariéry',
  },
  trike: {
    id: 'trike',
    species: 'Triceratops',
    accusative: 'Triceratopse',
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
  // ---- New species (met on the career map, later also in eggs) -------------
  {
    id: 'galli-sand',
    name: 'Pštrosák',
    species: 'Gallimimus',
    archetype: 'raptor',
    model: 'gallimimus',
    role: 'RYCHLÍK',
    palette: { body: 0xe0b27a, belly: 0xfff1d6, accent: 0x9c5b2b, detail: 0xff7f50, effect: 'none' },
    rarity: 2,
    starter: false,
    perk: { kind: 'terrainSpeed', value: 0.03, terrains: ['path', 'bridge'], description: 'O 3 % rychlejší na cestě a mostech (sólo)' },
    description: 'Dlouhonohý běžec z písečného kaňonu. Běhá jako pštros.',
  },
  {
    id: 'dilo-jungle',
    name: 'Hřebínek',
    species: 'Dilophosaurus',
    archetype: 'raptor',
    model: 'dilophosaurus',
    role: 'RYCHLÍK',
    palette: { body: 0x20bf6b, belly: 0xd9ffe9, accent: 0xff9f1a, detail: 0xff4757, effect: 'none' },
    rarity: 2,
    starter: false,
    perk: { kind: 'perfectBoost', value: 0.2, description: 'Bonus za perfektní proměnu vydrží o 20 % déle (sólo)' },
    description: 'Pralesní dinosaurus se dvěma barevnými hřebínky na hlavě.',
  },
  {
    id: 'bary-river',
    name: 'Rybář',
    species: 'Baryonyx',
    archetype: 'spino',
    model: 'baryonyx',
    role: 'PLAVEC',
    palette: { body: 0x3c6e91, belly: 0xd6ecff, accent: 0x7ed6df, detail: 0xf6b93b, effect: 'none' },
    rarity: 2,
    starter: false,
    perk: { kind: 'terrainSpeed', value: 0.03, terrains: ['water'], description: 'O 3 % rychlejší v mělké vodě (sólo)' },
    description: 'Rybář z bažin s dlouhým čenichem a obřím drápem.',
  },
  {
    id: 'stego-forest',
    name: 'Ploténka',
    species: 'Stegosaurus',
    archetype: 'ankylo',
    model: 'stego',
    role: 'BOURÁK',
    palette: { body: 0x7bc96f, belly: 0xeaffd9, accent: 0xe55039, detail: 0xffd32a, effect: 'none' },
    rarity: 2,
    starter: false,
    perk: { kind: 'abilityCharge', value: 0.15, description: 'NÁRAZ se nabíjí o 15 % rychleji (sólo)' },
    description: 'Má na zádech barevné ploténky a na ocase čtyři bodce.',
  },
  {
    id: 'pachy-rock',
    name: 'Tvrdohlavec',
    species: 'Pachycephalosaurus',
    archetype: 'ankylo',
    model: 'pachy',
    role: 'BOURÁK',
    palette: { body: 0xd9773b, belly: 0xffe9c7, accent: 0xf5d07a, detail: 0xfff8e7, effect: 'none' },
    rarity: 3,
    starter: false,
    perk: { kind: 'abilityDuration', value: 0.25, description: 'NÁRAZ vydrží o 25 % déle (sólo)' },
    description: 'Prorazí cokoli svou tvrdou kulatou hlavou.',
  },
  {
    id: 'styraco-desert',
    name: 'Bodlinka',
    species: 'Styracosaurus',
    archetype: 'trike',
    model: 'styraco',
    role: 'TEREŇÁK',
    palette: { body: 0xe58e26, belly: 0xfff1dc, accent: 0xb33939, detail: 0xfffaf0, effect: 'none' },
    rarity: 2,
    starter: false,
    perk: { kind: 'terrainSpeed', value: 0.03, terrains: ['sand', 'mud'], description: 'O 3 % rychlejší v písku a bahně (sólo)' },
    description: 'Límec s dlouhými bodci a jeden velký roh na nose.',
  },
  {
    id: 'brachio-ice',
    name: 'Dlouhán',
    species: 'Brachiosaurus',
    archetype: 'trike',
    model: 'brachio',
    role: 'TEREŇÁK',
    palette: { body: 0x6fa8dc, belly: 0xe8f4ff, accent: 0x2d6a9f, detail: 0xffeaa7, effect: 'none' },
    rarity: 3,
    starter: false,
    perk: { kind: 'abilityDuration', value: 0.2, description: 'NEZASTAVITELNÝ POSTUP vydrží o 20 % déle (sólo)' },
    description: 'Obr s dlouhým krkem. Přes sníh i bahno jde jako po chodníku.',
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
