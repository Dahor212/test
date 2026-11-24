import * as THREE from 'three';
import type { SceneryId, TimeOfDay, WorldDefinition } from '../types';
import { Backdrop, sunOffsetFor } from './backdrop';
import type { Particles } from './particles';
import { PATH_HALF, TerrainField, TrackPath } from './trackPath';
import { ribbon } from './trackScene';
import { disposeObject, GeoMerger, GEO, hash01, mat, valueNoise, vertexColorMat } from './util';

const CHUNK = 30;
const GROUND_CHUNK = 40;

// ---------------------------------------------------------------------------
// Scenery primitives (added into a GeoMerger)
// ---------------------------------------------------------------------------

type Sink = Pick<GeoMerger, 'add'>;
type Adder = (m: Sink, x: number, z: number, s: number, r: number) => void;

/** Adds everything raised to a base height (ground under a tree). */
class Raised implements Sink {
  y = 0;
  constructor(private m: GeoMerger) {}
  add(geo: THREE.BufferGeometry, color: number, pos: [number, number, number], scale: [number, number, number] | number = 1, rot: [number, number, number] = [0, 0, 0]) {
    this.m.add(geo, color, [pos[0], pos[1] + this.y, pos[2]], scale, rot);
  }
}

const TAU = Math.PI * 2;

// --- jungle ---------------------------------------------------------------

const tropicalTree: Adder = (m, x, z, s, r) => {
  const h = 4.5 * s;
  m.add(GEO.cylinder(6), 0x8a5a2b, [x, 0, z], [0.25 * s, h, 0.25 * s], [0, 0, (r - 0.5) * 0.2]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + r;
    m.add(GEO.sphere(0), i % 2 ? 0x2e9e44 : 0x46c35a, [x + Math.cos(a) * 1.1 * s, h + 0.1, z + Math.sin(a) * 1.1 * s], [1.4 * s, 0.25 * s, 0.55 * s], [0, -a, -0.35]);
  }
  m.add(GEO.sphere(0), 0x3cb04f, [x, h + 0.35 * s, z], 0.6 * s);
};

/** A huge rainforest tree with buttress roots, a layered crown and vines. */
const giantTree: Adder = (m, x, z, s, r) => {
  const h = (7.5 + r * 3.5) * s;
  for (let i = 0; i < 4; i++) {
    const a = i * 1.57 + r * 2;
    m.add(GEO.cone(4), 0x6f4524, [x + Math.cos(a) * 0.55 * s, 0, z + Math.sin(a) * 0.55 * s], [0.75 * s, 2.2 * s, 0.3 * s], [0, -a, 0]);
  }
  m.add(GEO.cylinder(7), 0x7d5130, [x, 0, z], [0.5 * s, h, 0.5 * s]);
  m.add(GEO.cylinder(5), 0x7d5130, [x, h * 0.6, z], [0.22 * s, 3 * s, 0.22 * s], [0, r * 4, 0.8]);
  const greens = [0x2c8a3c, 0x41a64f, 0x23763a, 0x58b85a];
  m.add(GEO.ico(), greens[0], [x, h + 0.6 * s, z], [3.2 * s, 1.6 * s, 3.2 * s], [r, r * 3, 0]);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + r * 4;
    const rr = 2.3 * s;
    m.add(GEO.ico(), greens[(i + 1) % 4], [x + Math.cos(a) * rr, h - 0.2 * s + (i % 2) * 0.8 * s, z + Math.sin(a) * rr], [2.2 * s, 1.2 * s, 2.2 * s], [r, a, 0]);
  }
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + r * 5;
    const len = (2.5 + hash01(r * 50 + i) * 2.5) * s;
    m.add(GEO.cylinder(3), 0x3f7f2a, [x + Math.cos(a) * 2.4 * s, h - len, z + Math.sin(a) * 2.4 * s], [0.05 * s, len, 0.05 * s]);
    m.add(GEO.sphere(0), 0x4f9a35, [x + Math.cos(a) * 2.4 * s, h - len, z + Math.sin(a) * 2.4 * s], 0.18 * s);
  }
};

const fern: Adder = (m, x, z, s, r) => {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + r * 3;
    m.add(GEO.sphere(0), i % 2 ? 0x2f9e3a : 0x5fcf4a, [x + Math.cos(a) * 0.8 * s, 0.55 * s, z + Math.sin(a) * 0.8 * s], [1.0 * s, 0.12 * s, 0.32 * s], [0, -a, 0.55]);
  }
};

/** Short palm-like cycad with a crown of stiff fronds. */
const cycad = (trunk: number, leaf: number, leaf2: number): Adder => (m, x, z, s, r) => {
  const h = (1.1 + r * 0.8) * s;
  m.add(GEO.cylinder(6), trunk, [x, 0, z], [0.36 * s, h, 0.36 * s]);
  m.add(GEO.sphere(0), trunk, [x, h, z], 0.42 * s);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + r * 3;
    m.add(GEO.sphere(0), i % 2 ? leaf : leaf2, [x + Math.cos(a) * 0.95 * s, h + 0.35 * s, z + Math.sin(a) * 0.95 * s], [1.15 * s, 0.09 * s, 0.24 * s], [0, -a, 0.4]);
  }
};

const bush = (c1: number, c2: number, berry: number | null): Adder => (m, x, z, s, r) => {
  m.add(GEO.ico(), c1, [x, 0.6 * s, z], [1.0 * s, 0.8 * s, 1.0 * s], [r, r * 2, 0]);
  m.add(GEO.ico(), c2, [x + 0.7 * s, 0.45 * s, z + 0.3 * s], 0.65 * s);
  m.add(GEO.ico(), c2, [x - 0.6 * s, 0.4 * s, z - 0.35 * s], 0.55 * s, [0, r, 0]);
  if (berry !== null && r > 0.45) {
    for (let i = 0; i < 3; i++) m.add(GEO.sphere(0), berry, [x + (i - 1) * 0.45 * s, (0.95 + (i % 2) * 0.2) * s, z - 0.3 * s + i * 0.25 * s], 0.14 * s);
  }
};

const rock = (color: number, moss: number | null = null): Adder => (m, x, z, s, r) => {
  m.add(GEO.dodeca(), color, [x, 0.35 * s, z], [1.0 * s, 0.7 * s, 0.9 * s], [r, r * 3, r * 2]);
  if (r > 0.6) m.add(GEO.dodeca(), color, [x + 0.9 * s, 0.2 * s, z + 0.4 * s], [0.45 * s, 0.35 * s, 0.4 * s], [r * 2, r, 0]);
  if (moss !== null) m.add(GEO.sphere(0), moss, [x, 0.72 * s, z], [0.75 * s, 0.18 * s, 0.65 * s], [0, r * 3, 0]);
};

const flowers: Adder = (m, x, z, s, r) => {
  const cols = [0xff6b81, 0xffd32a, 0xffffff, 0xa55eea, 0xff9f43];
  for (let i = 0; i < 6; i++) {
    const a = i * 1.3 + r * 6;
    const fx = x + Math.cos(a) * 0.7 * s;
    const fz = z + Math.sin(a) * 0.7 * s;
    m.add(GEO.cylinder(3), 0x3f9a35, [fx, 0, fz], [0.03 * s, 0.3 * s, 0.03 * s]);
    m.add(GEO.sphere(0), cols[(i + Math.floor(r * 5)) % 5], [fx, 0.32 * s, fz], [0.17 * s, 0.09 * s, 0.17 * s]);
  }
};

/** Toadstools – red caps with white dots. */
const mushrooms: Adder = (m, x, z, s, r) => {
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + r * 5;
    const k = (0.6 + (i === 0 ? 0.5 : hash01(r * 30 + i) * 0.3)) * s;
    const mx = x + Math.cos(a) * 0.5 * s * (i ? 1 : 0);
    const mz = z + Math.sin(a) * 0.5 * s * (i ? 1 : 0);
    m.add(GEO.cylinder(6), 0xf5ecd7, [mx, 0, mz], [0.12 * k, 0.55 * k, 0.12 * k]);
    m.add(GEO.sphere(1), r > 0.5 ? 0xe74c3c : 0xff8c42, [mx, 0.58 * k, mz], [0.42 * k, 0.26 * k, 0.42 * k]);
    m.add(GEO.sphere(0), 0xffffff, [mx + 0.18 * k, 0.74 * k, mz], 0.07 * k);
    m.add(GEO.sphere(0), 0xffffff, [mx - 0.12 * k, 0.76 * k, mz + 0.12 * k], 0.06 * k);
  }
};

const log: Adder = (m, x, z, s, r) => {
  const a = r * TAU;
  m.add(GEO.cylinder(7), 0x7a4f2c, [x, 0.3 * s, z], [0.32 * s, 3.2 * s, 0.32 * s], [0, -a, Math.PI / 2]);
  m.add(GEO.sphere(0), 0x4f9a35, [x, 0.62 * s, z], [0.5 * s, 0.15 * s, 0.4 * s]);
};

// --- swamp ----------------------------------------------------------------

/** Cypress with a flared base, a flat crown and hanging moss. */
const swampTree: Adder = (m, x, z, s, r) => {
  const h = (5 + r * 2.5) * s;
  m.add(GEO.cone(7), 0x5a4a35, [x, 0, z], [0.9 * s, 2.2 * s, 0.9 * s]);
  m.add(GEO.cylinder(6), 0x5e4d38, [x, 0, z], [0.32 * s, h, 0.32 * s], [0, 0, (r - 0.5) * 0.15]);
  m.add(GEO.ico(), 0x4d6b3a, [x, h, z], [2.6 * s, 0.9 * s, 2.6 * s], [0, r * 3, 0]);
  m.add(GEO.ico(), 0x5f7d45, [x + 0.8 * s, h + 0.5 * s, z - 0.4 * s], [1.6 * s, 0.7 * s, 1.6 * s]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + r * 2;
    const len = (1.2 + hash01(r * 40 + i) * 1.4) * s;
    m.add(GEO.cone(4), 0x9aa77a, [x + Math.cos(a) * 1.9 * s, h - 0.3 * s, z + Math.sin(a) * 1.9 * s], [0.18 * s, len, 0.18 * s], [Math.PI, 0, 0]);
  }
};

const reeds: Adder = (m, x, z, s, r) => {
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + r * 6;
    const rx = x + Math.cos(a) * 0.45 * s;
    const rz = z + Math.sin(a) * 0.45 * s;
    const h = (1.3 + hash01(r * 20 + i) * 0.9) * s;
    m.add(GEO.cylinder(3), i % 2 ? 0x7c9a3c : 0x95ad4c, [rx, 0, rz], [0.035 * s, h, 0.035 * s], [Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08]);
    if (i % 2 === 0) m.add(GEO.cylinder(5), 0x6b3f1f, [rx, h - 0.1 * s, rz], [0.08 * s, 0.38 * s, 0.08 * s]);
  }
};

const stump: Adder = (m, x, z, s, r) => {
  m.add(GEO.cylinder(7), 0x4f4130, [x, 0, z], [0.55 * s, 0.9 * s, 0.55 * s], [0, r, 0]);
  m.add(GEO.cylinder(7), 0xa88a60, [x, 0.9 * s, z], [0.5 * s, 0.02, 0.5 * s]);
  m.add(GEO.sphere(0), 0x6d8a45, [x + 0.4 * s, 0.25 * s, z], [0.4 * s, 0.25 * s, 0.4 * s]);
};

// --- canyon ---------------------------------------------------------------

/** Stacked sandstone tower with stripes. */
const hoodoo: Adder = (m, x, z, s, r) => {
  const n = 3 + Math.floor(r * 3);
  for (let i = 0; i < n; i++) {
    const j = hash01(r * 37 + i * 5);
    const w = (1.2 - i * 0.12 + (j - 0.5) * 0.35) * s;
    const h = (1.0 + j * 0.7) * s;
    m.add(GEO.cylinder(6), [0xc96a3a, 0xdc8a4e, 0xb85a30][(i + Math.floor(r * 3)) % 3], [x + (j - 0.5) * 0.3 * s, i * 1.3 * s, z], [w, h + 0.3 * s, w * (0.85 + j * 0.3)], [0, r * 3 + i, 0]);
  }
  m.add(GEO.dodeca(), 0xa85a32, [x, n * 1.3 * s + 0.2 * s, z], [1.2 * s, 0.5 * s, 1.1 * s], [0, r, 0]);
};

const sandstone: Adder = (m, x, z, s, r) => {
  m.add(GEO.dodeca(), r > 0.5 ? 0xcf7f48 : 0xb9663a, [x, 0.5 * s, z], [1.3 * s, 1.0 * s, 1.1 * s], [r, r * 3, 0]);
  m.add(GEO.dodeca(), 0xe3a066, [x + 0.7 * s, 0.25 * s, z + 0.6 * s], [0.6 * s, 0.45 * s, 0.55 * s], [r * 2, 0, r]);
};

const dryBush: Adder = (m, x, z, s, r) => {
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + r * 4;
    m.add(GEO.cylinder(3), 0x8a6a3a, [x, 0, z], [0.04 * s, 1.1 * s, 0.04 * s], [Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6]);
  }
  m.add(GEO.ico(), 0xb5a052, [x, 0.75 * s, z], [0.7 * s, 0.45 * s, 0.7 * s], [0, r, 0]);
};

/** A dinosaur skeleton half buried in the sand. */
const skeleton: Adder = (m, x, z, s, r) => {
  const rot = r * TAU;
  const dx = Math.cos(rot);
  const dz = Math.sin(rot);
  const bone = 0xf3ead6;
  const len = 4.2 * s;
  m.add(GEO.cylinder(5), bone, [x - dx * len * 0.5, 0.35 * s, z - dz * len * 0.5], [0.11 * s, len, 0.11 * s], [0, -rot, -Math.PI / 2]);
  for (let i = 0; i < 5; i++) {
    const t = 0.2 + i * 0.13;
    const k = (0.95 - Math.abs(i - 1.5) * 0.12) * s;
    m.add(GEO.arc(), bone, [x - dx * len * (0.5 - t), 0.3 * s, z - dz * len * (0.5 - t)], [k, k * 1.15, k], [0, -rot + Math.PI / 2, 0]);
  }
  m.add(GEO.dodeca(), bone, [x + dx * len * 0.58, 0.45 * s, z + dz * len * 0.58], [0.75 * s, 0.45 * s, 0.45 * s], [0, -rot, 0]);
  m.add(GEO.sphere(0), 0x5a4030, [x + dx * len * 0.62 - dz * 0.2 * s, 0.6 * s, z + dz * len * 0.62 + dx * 0.2 * s], 0.11 * s);
  // tail bones fading into the sand
  for (let i = 0; i < 4; i++) m.add(GEO.sphere(0), bone, [x - dx * (len * 0.55 + i * 0.5 * s), 0.12 * s, z - dz * (len * 0.55 + i * 0.5 * s)], 0.16 * s * (1 - i * 0.18));
};

// --- volcano --------------------------------------------------------------

const deadTree: Adder = (m, x, z, s, r) => {
  m.add(GEO.cylinder(5), 0x2b2220, [x, 0, z], [0.2 * s, 3 * s, 0.2 * s], [0, 0, (r - 0.5) * 0.3]);
  m.add(GEO.cylinder(4), 0x2b2220, [x, 2 * s, z], [0.1 * s, 1.4 * s, 0.1 * s], [0, r, 0.9]);
  m.add(GEO.cylinder(4), 0x2b2220, [x, 1.5 * s, z], [0.09 * s, 1.1 * s, 0.09 * s], [0, r, -0.8]);
};

const volcanoRock: Adder = (m, x, z, s, r) => {
  m.add(GEO.dodeca(), 0x4a3d39, [x, 0.6 * s, z], [1.3 * s, 1.2 * s, 1.1 * s], [r, r * 2, 0]);
  m.add(GEO.cone(5), 0x5a4a45, [x + 1 * s, 0, z + 0.5], [0.6 * s, 2.2 * s, 0.6 * s]);
};

/** Shiny black glass spikes. */
const obsidian: Adder = (m, x, z, s, r) => {
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6 + r * 5;
    m.add(GEO.cone(4), i % 2 ? 0x2a2233 : 0x3b3048, [x + Math.cos(a) * 0.5 * s, 0, z + Math.sin(a) * 0.5 * s], [0.45 * s, (1.6 + hash01(r * 9 + i) * 1.6) * s, 0.45 * s], [Math.cos(a) * 0.3, r * 3, Math.sin(a) * 0.3]);
  }
};

// --- ice ------------------------------------------------------------------

const pine = (snowy: boolean): Adder => (m, x, z, s) => {
  m.add(GEO.cylinder(5), 0x6b4423, [x, 0, z], [0.2 * s, 1.2 * s, 0.2 * s]);
  for (let i = 0; i < 3; i++) {
    const y = (1.0 + i * 1.1) * s;
    const rad = (1.4 - i * 0.35) * s;
    m.add(GEO.cone(7), 0x1f7a4a, [x, y, z], [rad, 1.6 * s, rad]);
    if (snowy) m.add(GEO.cone(7), 0xffffff, [x, y + 0.75 * s, z], [rad * 0.55, 0.85 * s, rad * 0.55]);
  }
};

const iceSpike: Adder = (m, x, z, s, r) => {
  m.add(GEO.cone(4), 0xbfeaff, [x, 0, z], [0.7 * s, 3.2 * s, 0.7 * s], [0, r * 3, (r - 0.5) * 0.3]);
  m.add(GEO.cone(4), 0x9fdcff, [x + 0.8 * s, 0, z + 0.4], [0.45 * s, 2.0 * s, 0.45 * s], [0, r, 0.2]);
};

const snowMound: Adder = (m, x, z, s, r) => {
  m.add(GEO.sphere(1), 0xffffff, [x, 0, z], [1.6 * s, 0.7 * s, 1.2 * s], [0, r * 3, 0]);
};

const iceBlock: Adder = (m, x, z, s, r) => {
  m.add(GEO.dodeca(), 0xa8dcf7, [x, 0.6 * s, z], [1.1 * s, 1.0 * s, 0.9 * s], [r, r * 2, r]);
  m.add(GEO.sphere(1), 0xffffff, [x, 1.25 * s, z], [0.8 * s, 0.25 * s, 0.7 * s]);
};

// --- islands --------------------------------------------------------------

const palm: Adder = (m, x, z, s, r) => {
  const lean = (r - 0.5) * 0.6;
  for (let i = 0; i < 5; i++) {
    m.add(GEO.cylinder(6), i % 2 ? 0xb07a3c : 0x9a6630, [x + lean * i * 0.4 * s, i * 0.95 * s, z], [0.22 * s, 1.0 * s, 0.22 * s], [0, 0, -lean * 0.3]);
  }
  const tx = x + lean * 2 * s;
  const ty = 4.8 * s;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + r;
    m.add(GEO.sphere(0), i % 2 ? 0x2fae52 : 0x4fd06a, [tx + Math.cos(a) * 1.3 * s, ty - 0.3 * s, z + Math.sin(a) * 1.3 * s], [1.6 * s, 0.14 * s, 0.4 * s], [0, -a, -0.5]);
  }
  m.add(GEO.sphere(0), 0x8a5a2b, [tx + 0.2, ty - 0.4 * s, z], 0.25 * s);
};

/** Big banana-like leaves. */
const bananaPlant: Adder = (m, x, z, s, r) => {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + r * 4;
    m.add(GEO.cylinder(3), 0x5a9a35, [x, 0, z], [0.05 * s, 1.3 * s, 0.05 * s], [Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35]);
    m.add(GEO.sphere(0), i % 2 ? 0x45b54a : 0x6fd060, [x + Math.cos(a) * 0.9 * s, 1.35 * s, z + Math.sin(a) * 0.9 * s], [1.0 * s, 0.07 * s, 0.42 * s], [0, -a, -0.25]);
  }
};

const beachShell: Adder = (m, x, z, s, r) => {
  m.add(GEO.sphere(0), r > 0.5 ? 0xff9f80 : 0xffffff, [x, 0.08, z], [0.3 * s, 0.12 * s, 0.25 * s]);
  m.add(GEO.sphere(0), 0xffc8a8, [x + 0.6, 0.06, z + 0.3], [0.2 * s, 0.08 * s, 0.18 * s]);
};

// ---------------------------------------------------------------------------
// Landscape recipes
// ---------------------------------------------------------------------------

interface SceneryStyle {
  /** Right beside the trail (small plants). */
  near: [Adder, number][];
  /** The valley floor (bushes, trees, rocks). */
  mid: [Adder, number][];
  /** Big things on the hills that frame the valley. */
  far: [Adder, number][];
  /** Counts per 30 m chunk for near / mid / far. */
  counts: [number, number, number];
  /** Grass blade colours next to the trail (null: bare). */
  tufts: number[] | null;
  /** Ground accents: lighter and darker patches. */
  light: number;
  dark: number;
  glow?: (m: Sink, x: number, z: number, r: number) => void;
}

const STYLES: Record<SceneryId, SceneryStyle> = {
  jungle: {
    near: [[fern, 4], [flowers, 3], [mushrooms, 1], [bush(0x3fae49, 0x58c45a, 0xff6b81), 2], [rock(0x8c8076, 0x5fae49), 1]],
    mid: [[tropicalTree, 3], [cycad(0x7a5a34, 0x3fae49, 0x5fcf4a), 3], [bush(0x3fae49, 0x58c45a, 0xff6b81), 2], [log, 1], [fern, 2], [rock(0x8c8076, 0x5fae49), 1]],
    far: [[giantTree, 5], [tropicalTree, 2], [cycad(0x7a5a34, 0x3fae49, 0x5fcf4a), 1]],
    counts: [16, 14, 12],
    tufts: [0x5fbf3c, 0x7ccf4a, 0x46a535],
    light: 0x8fd16a,
    dark: 0x2f7d32,
  },
  swamp: {
    near: [[reeds, 5], [mushrooms, 2], [fern, 2], [stump, 1]],
    mid: [[swampTree, 4], [reeds, 3], [stump, 2], [log, 2], [bush(0x4f6e3a, 0x5d7d45, null), 2]],
    far: [[swampTree, 6], [deadTree, 1], [reeds, 1]],
    counts: [16, 14, 12],
    tufts: [0x7c9a3c, 0x95ad4c, 0x6a8a35],
    light: 0x7d9a4c,
    dark: 0x3b4f2a,
  },
  canyon: {
    near: [[dryBush, 4], [sandstone, 3], [rock(0xc77b4a), 2], [skeleton, 1]],
    mid: [[sandstone, 3], [hoodoo, 2], [cycad(0x8a6a42, 0x8aa04a, 0xa9b65a), 2], [dryBush, 3], [skeleton, 1]],
    far: [[hoodoo, 5], [sandstone, 2], [cycad(0x8a6a42, 0x8aa04a, 0xa9b65a), 1]],
    counts: [12, 12, 10],
    tufts: [0xd9b45a, 0xc9a24a, 0xe6c86e],
    light: 0xf0c890,
    dark: 0xa85d34,
  },
  volcano: {
    near: [[volcanoRock, 3], [rock(0x5a4c47), 2], [obsidian, 2], [deadTree, 1]],
    mid: [[volcanoRock, 3], [deadTree, 2], [obsidian, 2], [rock(0x4a3e3a), 2]],
    far: [[volcanoRock, 3], [deadTree, 2], [obsidian, 2]],
    counts: [12, 12, 10],
    tufts: [0x6b5a3a, 0x5a4a30],
    light: 0x8a6f62,
    dark: 0x2a201e,
    glow: (m, x, z, r) => {
      m.add(GEO.disc(), r > 0.5 ? 0xff6a00 : 0xff9a1a, [x, 0.03, z], [2.2 + r * 2, 1, 1.4 + r]);
      m.add(GEO.disc(), 0xffd24a, [x, 0.05, z], [1 + r, 1, 0.6 + r * 0.5]);
    },
  },
  ice: {
    near: [[snowMound, 3], [iceSpike, 1], [iceBlock, 1], [pine(true), 1]],
    mid: [[pine(true), 4], [iceBlock, 2], [snowMound, 2], [iceSpike, 1]],
    far: [[pine(true), 6], [iceSpike, 2]],
    counts: [12, 14, 14],
    tufts: null,
    light: 0xffffff,
    dark: 0xbcd5ec,
  },
  islands: {
    near: [[beachShell, 3], [flowers, 2], [bananaPlant, 2], [rock(0xb8a68f), 1]],
    mid: [[palm, 4], [bananaPlant, 3], [bush(0x3fae49, 0x58c45a, 0xffd32a), 2], [rock(0xa89680, 0x5fae49), 1]],
    far: [[palm, 6], [bush(0x3fae49, 0x58c45a, null), 1]],
    counts: [12, 14, 12],
    tufts: [0x6dcf4a, 0x8fdc5a],
    light: 0xa8e07a,
    dark: 0x3f9a45,
  },
};

function pickAdder(list: [Adder, number][], r: number): Adder {
  const total = list.reduce((a, [, w]) => a + w, 0);
  let x = r * total;
  for (const [f, w] of list) {
    x -= w;
    if (x <= 0) return f;
  }
  return list[0][0];
}

const COLS = [-150, -110, -82, -62, -48, -38, -30, -24, -19, -15, -12, -9.5, -7.8, -6.8, -4, 0, 4, 6.8, 7.8, 9.5, 12, 15, 19, 24, 30, 38, 48, 62, 82, 110, 150];

/**
 * Streams the landscape along the curved track: a valley of rolling hills
 * (with basins where rivers and lakes cross), plants and rocks in three
 * bands (by the trail, on the valley floor, big ones on the hills), grass
 * along the trail, wandering herds and the far backdrop.
 */
export class WorldScenery {
  readonly group = new THREE.Group();
  readonly backdrop: Backdrop;
  private world: WorldDefinition;
  private scenery: SceneryId;
  private style: SceneryStyle;
  private ground = new Map<number, THREE.Mesh>();
  private chunks = new Map<number, THREE.Object3D>();
  private sea: THREE.Mesh | null = null;
  private weatherTimer = 0;
  private c1: THREE.Color;
  private c2: THREE.Color;
  private cLight: THREE.Color;
  private cDark: THREE.Color;
  private density: number;
  private lifeTimer = 0;

  constructor(
    world: WorldDefinition,
    scenery: SceneryId,
    private path: TrackPath,
    private field: TerrainField,
    quality: 'low' | 'high' = 'high',
    private time: TimeOfDay = 'day',
    calm = false,
  ) {
    this.world = world;
    this.scenery = scenery;
    this.style = STYLES[scenery] ?? STYLES.jungle;
    this.density = quality === 'high' ? 1 : 0.55;
    this.c1 = new THREE.Color(world.ground);
    this.c2 = new THREE.Color(world.ground2);
    this.cLight = new THREE.Color(this.style.light);
    this.cDark = new THREE.Color(this.style.dark);
    this.backdrop = new Backdrop(world, scenery, quality, time, calm);
    this.group.add(this.backdrop.group);
    if (world.id === 'islands') {
      this.sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), mat(0x1fc8db, { flat: false, emissive: 0x05303a }));
      this.sea.position.y = -0.6;
      this.group.add(this.sea);
    }
  }

  private groundColor(d: number, o: number, y: number): THREE.Color {
    const n1 = valueNoise(d * 0.045 + 3.1, o * 0.06);
    const n2 = valueNoise(d * 0.22, o * 0.22 + 7.7);
    const c = this.c1.clone().lerp(this.c2, 0.15 + n2 * 0.5);
    if (n1 > 0.56) c.lerp(this.cLight, Math.min(1, (n1 - 0.56) / 0.18) * 0.55);
    if (n1 < 0.4) c.lerp(this.cDark, Math.min(1, (0.4 - n1) / 0.18) * 0.45);
    const w = this.world.id;
    const sc = this.scenery;
    if (y < -0.15) c.lerp(new THREE.Color(w === 'volcano' ? 0x2a1d18 : sc === 'canyon' ? 0x8a4f2a : 0x6b5a3a), Math.min(1, -y * 1.6));
    if (y > 2) {
      const hill = Math.min(1, (y - 2) / 6);
      if (w === 'ice') c.lerp(new THREE.Color(0xffffff), hill * 0.6);
      else if (sc === 'canyon') c.lerp(new THREE.Color(0xb5562f), hill * 0.55);
      else if (w === 'volcano') c.lerp(new THREE.Color(0x3a2c28), hill * 0.7);
      else c.lerp(new THREE.Color(w === 'islands' ? 0x5cbf4a : sc === 'swamp' ? 0x4a6a35 : 0x2f8a3a), hill * 0.5);
    }
    if (w === 'islands' && y < -0.3 && Math.abs(o) > 30) c.copy(new THREE.Color(0xf6e27f));
    return c;
  }

  private buildGround(k: number): THREE.Mesh {
    const d0 = k * GROUND_CHUNK;
    const d1 = d0 + GROUND_CHUNK;
    const geo = ribbon(this.path, d0, d1, () => COLS, (d, o) => this.field.groundY(d, o) - (Math.abs(o) < PATH_HALF + 0.3 ? 0.03 : 0), {
      step: 2.5,
      color: (d, o) => this.groundColor(d, o, this.field.groundY(d, o)),
    });
    const mesh = new THREE.Mesh(geo, vertexColorMat());
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildChunk(k: number): THREE.Object3D {
    const near = new GeoMerger();
    const far = new GeoMerger();
    const glow = new GeoMerger();
    const rNear = new Raised(near);
    const rFar = new Raised(far);
    const seed = k * 31 + this.scenery.length * 1000;
    const p = new THREE.Vector3();
    const st = this.style;
    const bands: { list: [Adder, number][]; count: number; from: number; span: number; scale: [number, number]; sink: Raised }[] = [
      { list: st.near, count: st.counts[0], from: 1.4, span: 7, scale: [0.6, 0.6], sink: rNear },
      { list: st.mid, count: st.counts[1], from: 8, span: 22, scale: [0.8, 0.7], sink: rNear },
      { list: st.far, count: st.counts[2], from: 28, span: 50, scale: [1.0, 0.9], sink: rFar },
    ];
    let n = 0;
    for (const b of bands) {
      const count = Math.round(b.count * this.density);
      for (let i = 0; i < count; i++, n++) {
        const r1 = hash01(seed + n * 3.1);
        const r2 = hash01(seed + n * 5.7);
        const r3 = hash01(seed + n * 9.3);
        const side = i % 2 ? 1 : -1;
        const d = k * CHUNK + r2 * CHUNK;
        if (d < -60) continue;
        const edge = this.field.smoothEdge(d, side);
        const o = side * (edge + b.from + r1 * b.span);
        if (!this.field.isDry(d, o)) continue;
        this.path.sample(d, o, p);
        b.sink.y = this.field.groundY(d, o);
        if (b.sink.y < -0.25) continue;
        const s = b.scale[0] + r3 * b.scale[1];
        pickAdder(b.list, r3)(b.sink, p.x, p.z, s, r2);
      }
    }
    // grass blades along the trail
    if (st.tufts) {
      const count = Math.round(44 * this.density);
      for (let i = 0; i < count; i++) {
        const r1 = hash01(seed + 500 + i * 2.3);
        const r2 = hash01(seed + 700 + i * 4.1);
        const side = i % 2 ? 1 : -1;
        const d = k * CHUNK + r2 * CHUNK;
        if (d < -60) continue;
        const o = side * (this.field.smoothEdge(d, side) + 0.6 + r1 * r1 * 14);
        if (!this.field.isDry(d, o)) continue;
        this.path.sample(d, o, p);
        const y = this.field.groundY(d, o);
        if (y < -0.25) continue;
        for (let b = 0; b < 4; b++) {
          const a = b * 1.7 + r1 * 9;
          const h = 0.45 + hash01(i * 7 + b) * 0.5;
          far.add(GEO.blade(), st.tufts[(i + b) % st.tufts.length], [p.x + Math.cos(a) * 0.2, y - 0.02, p.z + Math.sin(a) * 0.2], [0.07, h, 0.07], [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3]);
        }
      }
    }
    // at night little lanterns light the way along the trail
    const halo = new GeoMerger();
    if (this.time === 'night') {
      for (const [k2, side] of [[6, -1], [21, 1]] as const) {
        const d = k * CHUNK + k2;
        if (d < 0) continue;
        const o = side * (this.field.smoothEdge(d, side) + 1.3);
        if (!this.field.isDry(d, o)) continue;
        this.path.sample(d, o, p);
        const y = this.field.groundY(d, o);
        rNear.y = y;
        rNear.add(GEO.cylinder(6), 0x5a3d22, [p.x, 0, p.z], [0.07, 1.65, 0.07]);
        rNear.add(GEO.box(), 0x3b2a1a, [p.x, 1.62, p.z], [0.36, 0.06, 0.36]);
        glow.add(GEO.sphere(1), 0xffd98a, [p.x, y + 1.82, p.z], 0.19);
        halo.add(GEO.sphere(1), 0xffb347, [p.x, y + 1.82, p.z], 0.7);
        halo.add(GEO.disc(), 0xffa733, [p.x, y + 0.04, p.z], 1.6);
      }
    }
    if (st.glow && hash01(seed + 99) > 0.35) {
      const side = hash01(seed + 7) > 0.5 ? 1 : -1;
      const d = k * CHUNK + hash01(seed + 9) * CHUNK;
      const o = side * (this.field.smoothEdge(d, side) + 6 + hash01(seed + 8) * 14);
      this.path.sample(d, o, p);
      const r = new Raised(glow);
      r.y = this.field.groundY(d, o) + 0.05;
      st.glow(r, p.x, p.z, hash01(seed + 10));
    }
    const g = new THREE.Group();
    // things near the trail cast shadows; far ones and grass do not need to
    const a = near.build(vertexColorMat());
    if (a) {
      a.castShadow = true;
      a.receiveShadow = true;
      g.add(a);
    }
    const f = far.build(vertexColorMat());
    if (f) {
      f.receiveShadow = true;
      g.add(f);
    }
    const b = glow.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
    if (b) g.add(b);
    const h = halo.build(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
    if (h) {
      h.renderOrder = 4;
      g.add(h);
    }
    return g;
  }

  /** Terrain changed (dynamic event) – rebuild the affected landscape. */
  invalidate(d0: number, d1: number) {
    for (const [k, obj] of [...this.ground]) {
      if (k * GROUND_CHUNK <= d1 + 15 && (k + 1) * GROUND_CHUNK >= d0 - 15) {
        this.group.remove(obj);
        disposeObject(obj);
        this.ground.delete(k);
      }
    }
    for (const [k, obj] of [...this.chunks]) {
      if (k * CHUNK <= d1 + 15 && (k + 1) * CHUNK >= d0 - 15) {
        this.group.remove(obj);
        disposeObject(obj);
        this.chunks.delete(k);
      }
    }
  }

  /** Stream around [from, to] (race distance). */
  update(from: number, to: number, camera: THREE.Camera, dt: number, time: number, particles: Particles | null, weather: boolean) {
    this.backdrop.update(camera, dt, time, weather ? particles : null);
    if (this.sea) {
      this.sea.position.x = camera.position.x;
      this.sea.position.z = camera.position.z;
      this.sea.position.y = -0.6 + Math.sin(time * 1.2) * 0.05;
    }
    const gFirst = Math.floor((from - 50) / GROUND_CHUNK);
    const gLast = Math.floor((to + 40) / GROUND_CHUNK);
    for (const [k, obj] of this.ground) {
      if (k < gFirst || k > gLast) {
        this.group.remove(obj);
        disposeObject(obj);
        this.ground.delete(k);
      }
    }
    for (let k = gFirst; k <= gLast; k++) {
      if (!this.ground.has(k)) {
        const g = this.buildGround(k);
        this.ground.set(k, g);
        this.group.add(g);
      }
    }
    const first = Math.floor((from - 40) / CHUNK);
    const last = Math.floor((to + 30) / CHUNK);
    for (const [k, obj] of this.chunks) {
      if (k < first || k > last) {
        this.group.remove(obj);
        disposeObject(obj);
        this.chunks.delete(k);
      }
    }
    for (let k = first; k <= last; k++) {
      if (!this.chunks.has(k)) {
        const c = this.buildChunk(k);
        this.chunks.set(k, c);
        this.group.add(c);
      }
    }
    if (!particles || !weather) return;
    const cx = camera.position.x;
    const cz = camera.position.z;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    this.weatherTimer += dt;
    this.lifeTimer += dt;
    // night life: fireflies over the meadows, sparks above the volcano's lava
    if (this.time === 'night' && this.scenery !== 'ice' && this.lifeTimer > 0.07) {
      this.lifeTimer = 0;
      const k = 6 + Math.random() * 40;
      const side = Math.random() > 0.5 ? 1 : -1;
      const off = 5 + Math.random() * 18;
      const x = cx + fwd.x * k - fwd.z * side * off;
      const z = cz + fwd.z * k + fwd.x * side * off;
      if (this.scenery === 'volcano') particles.emit('ember', x, 0.3, z, { count: 1 });
      else particles.emit('firefly', x, 0.6 + Math.random() * 2.2, z, { count: 1 });
    }
    if (this.world.weather === 'storm' && this.weatherTimer > 0.016) {
      this.weatherTimer = 0;
      for (let i = 0; i < 2; i++) {
        const k = 4 + Math.random() * 34;
        particles.emit('splash', cx + fwd.x * k + (Math.random() - 0.5) * 34, 10, cz + fwd.z * k + (Math.random() - 0.5) * 34, { count: 1, color: 0xc8e4f2, scale: 0.55 });
      }
    } else if (this.world.weather === 'snow' && this.weatherTimer > 0.05) {
      this.weatherTimer = 0;
      const k = 8 + Math.random() * 40;
      particles.emit('snow', cx + fwd.x * k + (Math.random() - 0.5) * 36, 6, cz + fwd.z * k + (Math.random() - 0.5) * 36, { count: 2 });
    } else if (this.world.weather === 'rain' && this.weatherTimer > 0.03) {
      this.weatherTimer = 0;
      const k = 6 + Math.random() * 30;
      particles.emit('splash', cx + fwd.x * k + (Math.random() - 0.5) * 30, 9, cz + fwd.z * k + (Math.random() - 0.5) * 30, { count: 1, color: 0xbfe9ff, scale: 0.6 });
    } else if (this.world.weather === 'sparkle' && this.weatherTimer > 0.2) {
      this.weatherTimer = 0;
      const k = 20 + Math.random() * 50;
      const side = Math.random() > 0.5 ? 1 : -1;
      particles.emit('sparkle', cx + fwd.x * k + fwd.z * side * 45, 0.1, cz + fwd.z * k - fwd.x * side * 45, { count: 1, color: 0xffffff });
    }
  }

  dispose() {
    this.backdrop.dispose();
    disposeObject(this.group);
    this.chunks.clear();
    this.ground.clear();
  }
}

/**
 * Sun (key light, casts the shadows), a sky/ground hemisphere fill and a
 * soft cool rim light from behind that outlines the dinosaurs.
 */
export function applyWorldLighting(
  scene: THREE.Scene,
  world: WorldDefinition,
  time: TimeOfDay = 'day',
): { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight; rim: THREE.DirectionalLight } {
  scene.fog = new THREE.Fog(world.fog, world.fogNear, world.fogFar);
  scene.background = new THREE.Color(world.fog);
  const skyTint = new THREE.Color(world.ambient).lerp(new THREE.Color(world.sky.top), 0.25);
  const storm = world.weather === 'storm';
  const dim = (time === 'night' ? 0.62 : time === 'sunset' ? 0.74 : 1) * (storm ? 0.8 : 1);
  const hemi = new THREE.HemisphereLight(skyTint, world.ground, (world.id === 'volcano' ? 2.0 : 1.55) * dim);
  const sun = new THREE.DirectionalLight(world.sun, world.sunIntensity * 1.15);
  const offset = sunOffsetFor(time);
  sun.position.copy(offset);
  let rim: THREE.DirectionalLight;
  if (time === 'day') {
    rim = new THREE.DirectionalLight(new THREE.Color(world.sky.top).lerp(new THREE.Color(0xffffff), 0.5), 0.7);
    rim.position.set(-offset.x, offset.y * 0.6, -offset.z);
  } else {
    // the low sun / moon is ahead: a soft fill from behind the camera keeps the racers readable
    rim = new THREE.DirectionalLight(time === 'night' ? 0x9db8ff : 0xffc6a6, time === 'night' ? 1.0 : 0.9);
    rim.position.set(10, 14, 40);
  }
  scene.add(hemi, sun, sun.target, rim);
  return { hemi, sun, rim };
}
