import type { Archetype, ObstacleKind, Suitability, TerrainCategory, TerrainDefinition, TerrainId } from '../types';

function suit(best: Archetype, rest: Partial<Record<Archetype, Suitability>>): Record<Archetype, Suitability> {
  const base: Record<Archetype, Suitability> = { raptor: 'bad', spino: 'bad', ankylo: 'bad', trike: 'bad' };
  return { ...base, ...rest, [best]: 'best' };
}

/**
 * Terrain registry. To add a new terrain: add an id to TerrainId, add a
 * definition here and (optionally) a rendering style in render/trackRenderer.
 */
export const TERRAINS: Record<TerrainId, TerrainDefinition> = {
  grass: {
    id: 'grass',
    name: 'Tráva',
    category: 'firm',
    best: 'raptor',
    suitability: suit('raptor', { trike: 'ok', ankylo: 'bad', spino: 'bad' }),
    color: 0x6ccf3d,
    color2: 0x58b82e,
    icon: 'grass',
    warning: 'Tráva',
  },
  path: {
    id: 'path',
    name: 'Pevná cesta',
    category: 'firm',
    best: 'raptor',
    suitability: suit('raptor', { trike: 'ok', ankylo: 'ok', spino: 'bad' }),
    color: 0xd9a066,
    color2: 0xc48a52,
    icon: 'path',
    warning: 'Cesta',
  },
  bridge: {
    id: 'bridge',
    name: 'Most',
    category: 'firm',
    best: 'raptor',
    suitability: suit('raptor', { trike: 'ok', ankylo: 'ok', spino: 'bad' }),
    color: 0xa0632e,
    color2: 0x7d4a1f,
    icon: 'bridge',
    warning: 'Most',
  },
  water: {
    id: 'water',
    name: 'Voda',
    category: 'water',
    best: 'spino',
    suitability: suit('spino', { raptor: 'bad', ankylo: 'bad', trike: 'bad' }),
    color: 0x2ec4f0,
    color2: 0x7fe3ff,
    icon: 'water',
    warning: 'Voda',
  },
  deepWater: {
    id: 'deepWater',
    name: 'Hluboká voda',
    category: 'water',
    best: 'spino',
    suitability: suit('spino', { raptor: 'awful', ankylo: 'awful', trike: 'awful' }),
    color: 0x1279c9,
    color2: 0x3fa3ef,
    icon: 'deepWater',
    warning: 'Hluboko',
  },
  stones: {
    id: 'stones',
    name: 'Kameny',
    category: 'smash',
    best: 'ankylo',
    suitability: suit('ankylo', { trike: 'bad', raptor: 'bad', spino: 'awful' }),
    obstacles: ['rockPile', 'boulder'],
    color: 0xb6a38c,
    color2: 0x9c8a75,
    icon: 'stones',
    warning: 'Kameny',
  },
  woodBarrier: {
    id: 'woodBarrier',
    name: 'Dřevěná bariéra',
    category: 'smash',
    best: 'ankylo',
    suitability: suit('ankylo', { trike: 'bad', raptor: 'bad', spino: 'awful' }),
    obstacles: ['woodWall', 'fallenTree'],
    color: 0xc9a46b,
    color2: 0xb08c55,
    icon: 'wood',
    warning: 'Zeď',
  },
  scree: {
    id: 'scree',
    name: 'Skalní suť',
    category: 'smash',
    best: 'ankylo',
    suitability: suit('ankylo', { trike: 'bad', raptor: 'awful', spino: 'awful' }),
    obstacles: ['boulder', 'rockPile', 'stoneWall'],
    color: 0x8a8079,
    color2: 0x6e655f,
    icon: 'scree',
    warning: 'Suť',
  },
  mud: {
    id: 'mud',
    name: 'Bahno',
    category: 'rough',
    best: 'trike',
    suitability: suit('trike', { ankylo: 'bad', raptor: 'awful', spino: 'bad' }),
    color: 0x7a4f2a,
    color2: 0x5e3b1e,
    icon: 'mud',
    warning: 'Bahno',
  },
  sand: {
    id: 'sand',
    name: 'Písek',
    category: 'rough',
    best: 'trike',
    suitability: suit('trike', { ankylo: 'bad', raptor: 'bad', spino: 'bad' }),
    color: 0xf5d97a,
    color2: 0xe8c45c,
    icon: 'sand',
    warning: 'Písek',
  },
  snow: {
    id: 'snow',
    name: 'Sníh',
    category: 'rough',
    best: 'trike',
    suitability: suit('trike', { ankylo: 'bad', raptor: 'bad', spino: 'bad' }),
    color: 0xf4fbff,
    color2: 0xd9eef9,
    icon: 'snow',
    warning: 'Sníh',
  },
  ice: {
    id: 'ice',
    name: 'Led',
    category: 'rough',
    best: 'trike',
    suitability: suit('trike', { ankylo: 'bad', raptor: 'awful', spino: 'bad' }),
    color: 0xaee7ff,
    color2: 0xd8f5ff,
    icon: 'ice',
    warning: 'Led',
  },
};

export const TERRAIN_LIST = Object.values(TERRAINS);

export function terrainCategory(id: TerrainId): TerrainCategory {
  return TERRAINS[id].category;
}

export interface ObstacleDefinition {
  kind: ObstacleKind;
  name: string;
  /** Rendering size hint (width, height, depth). */
  size: [number, number, number];
}

/** Obstacle registry (extensible). */
export const OBSTACLES: Record<ObstacleKind, ObstacleDefinition> = {
  rockPile: { kind: 'rockPile', name: 'Hromada kamenů', size: [2.4, 1.3, 1.4] },
  woodWall: { kind: 'woodWall', name: 'Dřevěná zeď', size: [2.6, 1.6, 0.5] },
  boulder: { kind: 'boulder', name: 'Velký balvan', size: [2.0, 1.8, 1.8] },
  fallenTree: { kind: 'fallenTree', name: 'Padlý strom', size: [2.8, 1.0, 1.0] },
  iceBlock: { kind: 'iceBlock', name: 'Ledový blok', size: [2.4, 1.6, 1.2] },
  stoneWall: { kind: 'stoneWall', name: 'Kamenná zeď', size: [2.6, 1.5, 0.7] },
};
