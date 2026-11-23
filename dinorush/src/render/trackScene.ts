import * as THREE from 'three';
import { ARCHETYPE_INFO } from '../config/dinosaurs';
import { GAME_CONFIG } from '../config/gameConfig';
import { TERRAINS } from '../config/terrain';
import type { DynamicEventType, ObstacleKind, TerrainId, TrackDefinition, TrackSegment, WorldId } from '../types';
import { bannerTexture, checkerTexture, signTexture, terrainTexture } from './textures';
import { PATH_HALF, TerrainField, TrackPath, zoneFor, type Zone } from './trackPath';
import { basicMat, disposeObject, easeOutBack, GeoMerger, GEO, hash01, mat, mesh, vertexColorMat } from './util';

export function laneX(lane: number): number {
  return (lane - 1) * GAME_CONFIG.laneSpacing;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const tmpV = new THREE.Vector3();

/**
 * Ribbon following the path between d0 and d1; columns at lateral offsets.
 * UVs are in world metres / uvScale so textures tile seamlessly.
 */
export function ribbon(
  path: TrackPath,
  d0: number,
  d1: number,
  offsets: (d: number) => number[],
  y: (d: number, o: number) => number,
  opts: { step?: number; uvScale?: number; color?: (d: number, o: number) => THREE.Color } = {},
): THREE.BufferGeometry {
  const step = opts.step ?? 2;
  const uvs = opts.uvScale ?? 4;
  const rows = Math.max(2, Math.ceil((d1 - d0) / step) + 1);
  const first = offsets(d0);
  const cols = first.length;
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  const col = opts.color ? new Float32Array(rows * cols * 3) : null;
  for (let r = 0; r < rows; r++) {
    const d = d0 + ((d1 - d0) * r) / (rows - 1);
    const offs = r === 0 ? first : offsets(d);
    for (let c = 0; c < cols; c++) {
      const o = offs[c];
      path.sample(d, o, tmpV);
      const i = r * cols + c;
      pos[i * 3] = tmpV.x;
      pos[i * 3 + 1] = y(d, o);
      pos[i * 3 + 2] = tmpV.z;
      uv[i * 2] = o / uvs;
      uv[i * 2 + 1] = d / uvs;
      if (col) {
        const cc = opts.color!(d, o);
        col[i * 3] = cc.r;
        col[i * 3 + 1] = cc.g;
        col[i * 3 + 2] = cc.b;
      }
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + cols;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function spread(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/** Per-world tint of terrain textures (e.g. dark volcanic sand). */
const WORLD_TINT: Partial<Record<WorldId, Partial<Record<TerrainId, number>>>> = {
  volcano: { sand: 0x9a8a80, path: 0xb8a090, mud: 0xb09078, grass: 0x9aa070 },
  ice: { path: 0xd8d0c8, grass: 0xc8e0c0 },
};

const matCache = new Map<string, THREE.Material>();
function surfaceMat(id: TerrainId | 'lava', world: WorldId = 'jungle'): THREE.Material {
  const tint = id === 'lava' ? undefined : WORLD_TINT[world]?.[id];
  const key = `${id}|${tint ?? ''}`;
  let m = matCache.get(key);
  if (m) return m;
  if (id === 'lava') {
    m = new THREE.MeshBasicMaterial({ color: 0xffffff, map: makeLavaTexture() });
  } else {
    const cat = TERRAINS[id].category;
    const water = cat === 'water';
    m = new THREE.MeshLambertMaterial({
      map: terrainTexture(id),
      transparent: water,
      opacity: water ? 0.9 : 1,
      emissive: id === 'ice' ? 0x1c3d4a : water ? 0x062838 : 0x000000,
      depthWrite: !water,
      color: tint ?? 0xffffff,
    });
  }
  m.userData.shared = true;
  matCache.set(key, m);
  return m;
}

let lavaTex: THREE.Texture | null = null;
function makeLavaTexture(): THREE.Texture {
  if (lavaTex) return lavaTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ff5a00';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = i % 3 ? 'rgba(255,210,60,0.8)' : 'rgba(120,20,0,0.6)';
    ctx.beginPath();
    ctx.ellipse(Math.random() * 128, Math.random() * 128, 6 + Math.random() * 16, 3 + Math.random() * 8, Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  lavaTex = new THREE.CanvasTexture(c);
  lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;
  lavaTex.colorSpace = THREE.SRGBColorSpace;
  lavaTex.userData.shared = true;
  return lavaTex;
}

// ---------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------

function stone(color: number, size: number, pos: [number, number, number]) {
  return mesh(GEO.dodeca(), mat(color), pos, [size, size * 0.8, size], [Math.random(), Math.random(), Math.random()]);
}

export function buildObstacle(kind: ObstacleKind, world: WorldId): THREE.Object3D[] {
  const pieces: THREE.Object3D[] = [];
  const dark = world === 'volcano';
  switch (kind) {
    case 'rockPile': {
      const c = dark ? [0x3d3533, 0x544a46, 0x2f2826] : [0x8c8076, 0xa59a8f, 0x77695f];
      pieces.push(stone(c[0], 0.62, [-0.75, 0.45, 0]), stone(c[1], 0.7, [0.65, 0.5, 0.1]), stone(c[2], 0.55, [0, 0.5, -0.15]), stone(c[1], 0.45, [-0.1, 1.05, 0.05]), stone(c[0], 0.35, [0.95, 0.3, -0.3]));
      break;
    }
    case 'boulder': {
      const c = dark ? 0x463b37 : 0x968a80;
      pieces.push(mesh(GEO.ico(), mat(c), [0, 0.85, 0], [0.95, 0.85, 0.85], [0.3, 0.5, 0]));
      pieces.push(stone(c, 0.38, [-1.0, 0.3, 0.2]), stone(c, 0.3, [1.05, 0.25, -0.2]));
      pieces.push(mesh(GEO.sphere(0), mat(0x7bc043), [0.2, 1.55, 0.2], [0.35, 0.12, 0.3]));
      break;
    }
    case 'woodWall': {
      const w = 0xb07a3c;
      const d = 0x7a4a1c;
      pieces.push(mesh(GEO.box(), mat(d), [-1.25, 0.8, 0], [0.22, 1.6, 0.22]));
      pieces.push(mesh(GEO.box(), mat(d), [1.25, 0.8, 0], [0.22, 1.6, 0.22]));
      for (let i = 0; i < 3; i++) pieces.push(mesh(GEO.box(), mat(i % 2 ? w : 0xc48a4c), [0, 0.35 + i * 0.45, 0.05], [2.6, 0.32, 0.14], [0, 0, (i - 1) * 0.04]));
      pieces.push(mesh(GEO.box(), mat(0xc48a4c), [0, 0.8, 0.13], [0.2, 1.3, 0.1], [0, 0, 0.7]));
      break;
    }
    case 'fallenTree': {
      const trunkColor = world === 'islands' ? 0xa0703c : 0x7a4a24;
      pieces.push(mesh(GEO.cylinder(8), mat(trunkColor), [-1.4, 0.4, 0], [0.38, 2.8, 0.38], [0, 0, -Math.PI / 2]));
      pieces.push(mesh(GEO.cylinder(8), mat(0xd9a86c), [1.42, 0.4, 0], [0.34, 0.04, 0.34], [0, 0, -Math.PI / 2]));
      pieces.push(mesh(GEO.sphere(1), mat(0x3fa34d), [-1.3, 0.75, 0.1], [0.7, 0.6, 0.7]));
      pieces.push(mesh(GEO.sphere(1), mat(0x4cbb5a), [-0.8, 0.9, -0.3], [0.5, 0.45, 0.5]));
      pieces.push(mesh(GEO.cylinder(5), mat(trunkColor), [0.3, 0.7, 0], [0.08, 0.6, 0.08], [0.4, 0, 0.3]));
      break;
    }
    case 'iceBlock': {
      const m1 = mat(0xbfeaff, { opacity: 0.85 });
      const m2 = mat(0x9fdcff, { opacity: 0.85 });
      pieces.push(mesh(GEO.box(), m1, [-0.6, 0.55, 0], [1.1, 1.1, 1.0], [0, 0.2, 0]));
      pieces.push(mesh(GEO.box(), m2, [0.65, 0.45, 0.1], [1.0, 0.9, 0.9], [0, -0.3, 0]));
      pieces.push(mesh(GEO.box(), m1, [0, 1.3, 0], [0.8, 0.6, 0.7], [0.2, 0.5, 0.1]));
      break;
    }
    case 'stoneWall': {
      const c = dark ? [0x4a403c, 0x5c514c] : [0x9a9088, 0xb1a79e];
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 4; i++) {
          const x = -1.05 + i * 0.7 + (row % 2) * 0.35 - 0.17;
          if (x > 1.2) continue;
          pieces.push(mesh(GEO.box(), mat(c[(i + row) % 2]), [x, 0.25 + row * 0.45, 0], [0.66, 0.42, 0.6]));
        }
      }
      break;
    }
  }
  return pieces;
}

interface ObstacleVisual {
  group: THREE.Group;
  pieces: THREE.Object3D[];
  state: 'intact' | 'broken' | 'climbed';
  t: number;
  anims: { mesh: THREE.Object3D; vel: THREE.Vector3; spin: THREE.Vector3 }[];
  appear: number;
  kind: ObstacleKind;
}

interface CoinSet {
  mesh: THREE.InstancedMesh;
  base: THREE.Vector3[];
  state: ('idle' | 'taken' | 'missed' | 'gone')[];
  t: number[];
}

interface SegVisual {
  seg: TrackSegment;
  terrain: TerrainId;
  group: THREE.Group;
  /** obstacles[lane][index] */
  obstacles: ObstacleVisual[][];
  coins: CoinSet[];
  sign: THREE.Sprite | null;
  signBase: number;
  signY: number;
  appear: number;
  lift: THREE.Object3D | null;
  eventType?: DynamicEventType;
}

let coinGeo: THREE.BufferGeometry | null = null;
function coinGeometry(): THREE.BufferGeometry {
  if (!coinGeo) {
    coinGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.09, 16).rotateX(Math.PI / 2);
    coinGeo.userData.shared = true;
  }
  return coinGeo;
}
const tmpObj = new THREE.Object3D();

// ---------------------------------------------------------------------------

/**
 * Builds the visible stretch of the track: one wide natural path shared by
 * the three lanes, terrain zones spilling into the landscape, gates with
 * signs, obstacles and coins per lane.
 */
export class TrackScene {
  readonly group = new THREE.Group();
  private visuals = new Map<number, SegVisual>();
  private extras: THREE.Object3D[] = [];

  constructor(
    private track: TrackDefinition,
    private path: TrackPath,
    private field: TerrainField,
    private world: WorldId,
    private showDinoOnSigns: boolean,
    private lanes: number[],
  ) {
    this.buildStartFinish();
  }

  private place(obj: THREE.Object3D, d: number, o: number, y = 0) {
    this.path.sample(d, o, obj.position);
    obj.position.y = y;
    obj.rotation.y = -this.path.heading(d);
  }

  private arch(d: number, text: string, color: string, post: number): THREE.Group {
    const g = new THREE.Group();
    for (const x of [-PATH_HALF - 1, PATH_HALF + 1]) {
      g.add(mesh(GEO.cylinder(10), mat(post), [x, 0, 0], [0.32, 5.4, 0.32]));
      g.add(mesh(GEO.sphere(1), mat(0xffd32a), [x, 5.5, 0], 0.48));
    }
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 2.0), new THREE.MeshBasicMaterial({ map: bannerTexture(text, color), side: THREE.DoubleSide }));
    banner.position.set(0, 4.5, 0);
    g.add(banner);
    this.place(g, d, 0);
    return g;
  }

  private buildStartFinish() {
    const startLine = new THREE.Mesh(
      ribbon(this.path, -0.3, 0.3, () => spread(-PATH_HALF, PATH_HALF, 5), () => 0.05),
      basicMat(0xffffff),
    );
    const startArch = this.arch(9, 'START', '#2ed573', 0x2ed573);
    this.group.add(startLine, startArch);
    this.extras.push(startLine, startArch);
    if (this.track.endless) return;
    const len = this.track.length;
    const checkerMat = new THREE.MeshBasicMaterial({ map: checkerTexture() });
    const fin = new THREE.Mesh(ribbon(this.path, len, len + 1.6, () => spread(-PATH_HALF, PATH_HALF, 5), () => 0.05, { uvScale: 0.8 }), checkerMat);
    const finArch = this.arch(len, 'CÍL', '#ff4757', 0xff4757);
    this.group.add(fin, finArch);
    this.extras.push(fin, finArch);
  }

  updateWindow(from: number, to: number) {
    const segs = this.track.segments;
    for (const [idx, v] of this.visuals) {
      if (v.seg.end < from - 10 || v.seg.start > to + 10) this.remove(idx);
    }
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.end < from) continue;
      if (s.start > to) break;
      const v = this.visuals.get(i);
      if (!v) this.visuals.set(i, this.build(s, false));
      else if (v.terrain !== s.terrain) {
        this.remove(i);
        this.visuals.set(i, this.build(s, true, s.event?.type));
      }
    }
  }

  private remove(idx: number) {
    const v = this.visuals.get(idx);
    if (!v) return;
    this.group.remove(v.group);
    disposeObject(v.group);
    this.visuals.delete(idx);
  }

  // -------------------------------------------------------------------------

  private build(seg: TrackSegment, appear: boolean, eventType?: DynamicEventType): SegVisual {
    const g = new THREE.Group();
    const zone = zoneFor(seg.terrain, this.world);
    const d0 = seg.start;
    const d1 = seg.end;
    const f = this.field;
    const deco = new GeoMerger();
    const glow = new GeoMerger();
    const rnd = (k: number) => hash01(seg.index * 131 + k * 7.13 + d0);
    let lift: THREE.Object3D | null = null;

    const zoneOffsets = (z: Zone, n: number) => (d: number) => {
      const l = f.edge(z, d, -1);
      const r = f.edge(z, d, 1);
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        out.push(t < 0.5 ? -l + (l - 0) * (t * 2) : r * ((t - 0.5) * 2));
      }
      return out;
    };
    const pathOffsets = () => spread(-PATH_HALF - 0.3, PATH_HALF + 0.3, 7);

    switch (zone.kind) {
      case 'water':
      case 'deep':
      case 'lava': {
        const surfaceY = zone.kind === 'lava' ? 0.0 : 0.035;
        const mat0 = zone.kind === 'lava' ? surfaceMat('lava') : surfaceMat(seg.terrain === 'deepWater' ? 'deepWater' : 'water', this.world);
        const water = new THREE.Mesh(ribbon(this.path, d0 - 0.2, d1 + 0.2, zoneOffsets(zone, 17), () => surfaceY, { step: 2.5, uvScale: 5 }), mat0);
        water.renderOrder = 2;
        g.add(water);
        lift = water;
        if (seg.terrain === 'bridge') this.bridge(g, deco, d0, d1);
        // banks: reeds, rocks and lily pads
        for (const bank of [d0 + 0.4, d1 - 0.4]) {
          for (let k = 0; k < 18; k++) {
            const side = k % 2 ? 1 : -1;
            const o = side * (PATH_HALF + 0.6 + rnd(k + bank) * (f.edge(zone, bank, side) - PATH_HALF - 1));
            if (zone.kind === 'lava') {
              deco.add(GEO.dodeca(), 0x2a2322, this.at(bank, o, 0.15), [0.6 + rnd(k) * 0.6, 0.4, 0.6], [rnd(k), rnd(k + 1), 0]);
            } else if (rnd(k + 3) > 0.45) {
              const p = this.at(bank, o, 0);
              for (let r = 0; r < 4; r++) deco.add(GEO.cone(4), r % 2 ? 0x3f8f3a : 0x5fb04a, [p[0] + (rnd(r + k) - 0.5) * 0.6, -0.1, p[2] + (rnd(r * 3 + k) - 0.5) * 0.6], [0.06, 1.1 + rnd(r) * 0.6, 0.06]);
              deco.add(GEO.sphere(0), 0x8a5a2b, [p[0], 1.0 + rnd(k) * 0.4, p[2]], [0.07, 0.2, 0.07]);
            } else {
              deco.add(GEO.dodeca(), 0x8c8076, this.at(bank, o, 0.05), [0.5 + rnd(k) * 0.5, 0.3, 0.45], [rnd(k), rnd(k + 2), 0]);
            }
          }
        }
        if (zone.kind !== 'lava') {
          const pads = Math.floor((d1 - d0) / 3);
          for (let k = 0; k < pads; k++) {
            const side = k % 2 ? 1 : -1;
            const d = d0 + 2 + rnd(k + 40) * (d1 - d0 - 4);
            const o = side * (PATH_HALF + 1.5 + rnd(k + 41) * 12);
            deco.add(GEO.disc(), 0x3fae49, this.at(d, o, 0.05), [0.5 + rnd(k) * 0.3, 1, 0.45]);
            if (rnd(k + 9) > 0.7) deco.add(GEO.sphere(0), 0xff9ff3, this.at(d, o, 0.12), 0.12);
          }
        } else {
          for (let k = 0; k < 6; k++) glow.add(GEO.disc(), 0xffd24a, this.at(d0 + rnd(k) * (d1 - d0), (k % 2 ? 1 : -1) * (PATH_HALF + 2 + rnd(k + 5) * 20), 0.02), [1 + rnd(k + 1) * 2, 1, 0.6 + rnd(k + 2)]);
        }
        break;
      }
      case 'mud':
      case 'sand':
      case 'snow':
      case 'ice': {
        const y0 = zone.kind === 'ice' ? 0.03 : 0.022;
        const surf = new THREE.Mesh(ribbon(this.path, d0 - 0.1, d1 + 0.1, zoneOffsets(zone, 15), () => y0, { step: 2.5 }), surfaceMat(seg.terrain, this.world));
        g.add(surf);
        lift = surf;
        const n = Math.floor((d1 - d0) / 2.2);
        for (let k = 0; k < n; k++) {
          const side = k % 2 ? 1 : -1;
          const d = d0 + 1 + rnd(k) * (d1 - d0 - 2);
          const e = f.edge(zone, d, side);
          const o = side * (PATH_HALF + 0.8 + rnd(k + 1) * (e - PATH_HALF - 1.5));
          const s = 0.4 + rnd(k + 2) * 0.8;
          if (zone.kind === 'mud') {
            deco.add(GEO.disc(), 0x3e2610, this.at(d, o, 0.03), [s * 1.6, 1, s]);
            if (rnd(k + 5) > 0.75) deco.add(GEO.cylinder(4), 0x4a3320, this.at(d, o, -0.05), [0.04, 0.9, 0.04], [0.3, 0, 0.2]);
          } else if (zone.kind === 'sand') {
            deco.add(GEO.sphere(1), 0xe8c45c, this.at(d, o, -0.2), [s * 2.2, s * 0.7, s * 1.6]);
            if (rnd(k + 6) > 0.85) deco.add(GEO.sphere(0), rnd(k) > 0.5 ? 0xff9f80 : 0xffffff, this.at(d, o, 0.06), 0.12);
          } else if (zone.kind === 'snow') {
            deco.add(GEO.sphere(1), 0xffffff, this.at(d, o, -0.15), [s * 2, s * 0.8, s * 1.5]);
          } else {
            deco.add(GEO.box(), rnd(k) > 0.5 ? 0xbfeaff : 0x9fdcff, this.at(d, side * (e - 0.5 + rnd(k + 3)), 0.2), [s, s * 0.6, s * 0.8], [0, rnd(k) * 3, 0.2]);
          }
        }
        // rim of snow / reeds along the zone edge
        if (zone.kind === 'ice') {
          for (let d = d0; d < d1; d += 3) {
            for (const side of [-1, 1]) deco.add(GEO.sphere(1), 0xffffff, this.at(d, side * f.edge(zone, d, side), -0.1), [1.4, 0.45, 1.6]);
          }
        }
        break;
      }
      case 'rock': {
        const surf = new THREE.Mesh(ribbon(this.path, d0 - 0.1, d1 + 0.1, zoneOffsets(zone, 11), () => 0.022, { step: 2.5 }), surfaceMat(seg.terrain, this.world));
        g.add(surf);
        lift = surf;
        const dark = this.world === 'volcano';
        const n = Math.floor((d1 - d0) / 1.6);
        for (let k = 0; k < n; k++) {
          const side = k % 2 ? 1 : -1;
          const d = d0 + rnd(k) * (d1 - d0);
          const o = side * (PATH_HALF + 0.7 + rnd(k + 1) * 6);
          const s = 0.3 + rnd(k + 2) * 0.9;
          deco.add(GEO.dodeca(), dark ? 0x4a3d39 : rnd(k) > 0.5 ? 0x8c8076 : 0xa59a8f, this.at(d, o, s * 0.35), [s, s * 0.75, s * 0.9], [rnd(k), rnd(k + 3) * 3, 0]);
        }
        break;
      }
      case 'wood': {
        const surf = new THREE.Mesh(ribbon(this.path, d0 - 0.1, d1 + 0.1, pathOffsets, () => 0.02, { step: 2.5 }), surfaceMat(seg.terrain, this.world));
        g.add(surf);
        lift = surf;
        for (let k = 0; k < 6; k++) {
          const side = k % 2 ? 1 : -1;
          const d = d0 + rnd(k) * (d1 - d0);
          const p = this.at(d, side * (PATH_HALF + 1.2 + rnd(k + 1) * 2), 0.3);
          const yaw = -this.path.heading(d) + 1.4 + rnd(k) * 0.3;
          for (let l = 0; l < 3; l++) deco.add(GEO.cylinder(7), l % 2 ? 0x8a5a28 : 0xa0703c, [p[0], p[1] + l * 0.32, p[2]], [0.18, 2.2, 0.18], [0, yaw, Math.PI / 2]);
        }
        break;
      }
      default: {
        const surf = new THREE.Mesh(ribbon(this.path, d0 - 0.1, d1 + 0.1, pathOffsets, () => 0.018, { step: 2.5 }), surfaceMat(seg.terrain, this.world));
        g.add(surf);
        lift = surf;
      }
    }

    // gate + sign where a different dino is needed
    let sign: THREE.Sprite | null = null;
    let signBase = 0;
    let signY = 0;
    const prev = this.track.segments[seg.index - 1];
    if (prev && prev.recommended !== seg.recommended) {
      const color = new THREE.Color(ARCHETYPE_INFO[seg.recommended].color).getHex();
      const stripe = new THREE.Mesh(ribbon(this.path, d0, d0 + 0.5, () => spread(-PATH_HALF, PATH_HALF, 5), () => (seg.terrain === 'bridge' ? 0.6 : 0.06)), basicMat(color));
      g.add(stripe);
      for (const side of [-1, 1]) {
        const p = this.at(d0, side * (PATH_HALF + 0.9), 0);
        deco.add(GEO.cylinder(8), 0x8a5a28, p, [0.16, 4.6, 0.16]);
        deco.add(GEO.cone(3), color, [p[0], 3.6, p[2]], [0.5, 1.0, 0.08], [0, -this.path.heading(d0) + Math.PI / 2, -Math.PI / 2 * side]);
        deco.add(GEO.sphere(1), color, [p[0], 4.7, p[2]], 0.26);
      }
      const spMat = new THREE.SpriteMaterial({ map: signTexture(seg.terrain, this.showDinoOnSigns), depthWrite: false });
      sign = new THREE.Sprite(spMat);
      signBase = 2.3;
      const h = this.showDinoOnSigns ? 1.5 : 1;
      sign.scale.set(signBase, signBase * h, 1);
      signY = 4.3;
      const sp = this.at(d0, 0, signY);
      sign.position.set(sp[0], sp[1], sp[2]);
      sign.renderOrder = 5;
      g.add(sign);
    }

    // obstacles per lane
    const obstacles: ObstacleVisual[][] = this.lanes.map((lane) =>
      seg.obstacles.map((o) => {
        const og = new THREE.Group();
        const pieces = buildObstacle(o.kind, this.world);
        for (const p of pieces) og.add(p);
        this.place(og, o.at, laneX(lane), 0);
        og.userData.baseY = 0;
        g.add(og);
        return { group: og, pieces, state: 'intact' as const, t: 0, anims: [], appear: appear ? 0 : 1, kind: o.kind };
      }),
    );

    // coins per lane (instanced)
    const coins: CoinSet[] = [];
    if (seg.coins.length) {
      for (const lane of this.lanes) {
        const m = new THREE.InstancedMesh(coinGeometry(), mat(0xffd32a, { emissive: 0x6b4a00 }), seg.coins.length);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        g.add(m);
        coins.push({
          mesh: m,
          base: seg.coins.map((c, i) => this.path.sample(c, laneX(lane) + Math.sin(i * 0.9) * 0.5, new THREE.Vector3())),
          state: seg.coins.map(() => 'idle'),
          t: seg.coins.map(() => 0),
        });
      }
    }

    const decoMesh = deco.build(vertexColorMat());
    if (decoMesh) g.add(decoMesh);
    const glowMesh = glow.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
    if (glowMesh) g.add(glowMesh);
    this.group.add(g);
    const v: SegVisual = { seg, terrain: seg.terrain, group: g, obstacles, coins, sign, signBase, signY, appear: appear ? 0 : 1, lift, eventType };
    if (appear && lift) lift.position.y = -0.8;
    return v;
  }

  private at(d: number, o: number, y: number): [number, number, number] {
    this.path.sample(d, o, tmpV);
    return [tmpV.x, y, tmpV.z];
  }

  /** Wooden bridge with ramps, rails and posts standing in the water. */
  private bridge(g: THREE.Group, deco: GeoMerger, d0: number, d1: number) {
    const H = 0.6;
    const deckY = (d: number) => {
      const t0 = Math.min(1, Math.max(0, (d - d0) / 3));
      const t1 = Math.min(1, Math.max(0, (d1 - d) / 3));
      return 0.04 + H * Math.min(t0, t1);
    };
    const deck = new THREE.Mesh(ribbon(this.path, d0, d1, () => spread(-PATH_HALF - 0.5, PATH_HALF + 0.5, 5), (d) => deckY(d), { step: 1, uvScale: 3 }), surfaceMat('bridge'));
    g.add(deck);
    for (let d = d0 + 1; d < d1; d += 2.4) {
      for (const side of [-1, 1]) {
        const p = this.at(d, side * (PATH_HALF + 0.45), 0);
        const top = deckY(d) + 1.0;
        deco.add(GEO.cylinder(6), 0x5c3512, [p[0], -0.6, p[2]], [0.13, top + 0.6, 0.13]);
        const q = this.at(Math.min(d1 - 0.5, d + 2.4), side * (PATH_HALF + 0.45), 0);
        const len = Math.hypot(q[0] - p[0], q[2] - p[2]);
        const yaw = Math.atan2(q[0] - p[0], q[2] - p[2]);
        deco.add(GEO.box(), 0x7d4a1f, [(p[0] + q[0]) / 2, top, (p[2] + q[2]) / 2], [0.12, 0.12, len], [0, yaw, 0]);
      }
    }
  }

  // -------------------------------------------------------------------------

  smash(lane: number, segIndex: number, obsIndex: number, power: boolean): THREE.Vector3 | null {
    const o = this.visuals.get(segIndex)?.obstacles[this.lanes.indexOf(lane)]?.[obsIndex];
    if (!o || o.state === 'broken') return null;
    o.state = 'broken';
    o.t = 0;
    o.anims = o.pieces.map((p) => ({
      mesh: p,
      vel: new THREE.Vector3((Math.random() - 0.5) * 7 + p.position.x * 2.5, 3 + Math.random() * 4 + (power ? 2 : 0), -4 - Math.random() * 5),
      spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
    }));
    return o.group.getWorldPosition(new THREE.Vector3());
  }

  climb(lane: number, segIndex: number, obsIndex: number): THREE.Vector3 | null {
    const o = this.visuals.get(segIndex)?.obstacles[this.lanes.indexOf(lane)]?.[obsIndex];
    if (!o) return null;
    o.state = 'climbed';
    o.t = 0;
    return o.group.getWorldPosition(new THREE.Vector3());
  }

  coin(lane: number, segIndex: number, coinIndex: number, taken: boolean): THREE.Vector3 | null {
    const set = this.visuals.get(segIndex)?.coins[this.lanes.indexOf(lane)];
    if (!set || set.state[coinIndex] !== 'idle') return null;
    set.state[coinIndex] = taken ? 'taken' : 'missed';
    set.t[coinIndex] = 0;
    return set.base[coinIndex].clone().setY(1);
  }

  update(dt: number, time: number, focusPos: number, speed: number, warnTime: number, cameraPos = focusPos) {
    for (const v of this.visuals.values()) {
      if (v.appear < 1) {
        v.appear = Math.min(1, v.appear + dt * 1.4);
        if (v.lift) v.lift.position.y = -0.8 * (1 - easeOutBack(v.appear));
      }
      if (v.sign) {
        const ttc = (v.seg.start - focusPos) / Math.max(speed, 4);
        const near = ttc > 0 && ttc < warnTime;
        const pulse = near ? 1.15 + Math.sin(time * 10) * 0.07 : 1;
        const h = this.showDinoOnSigns ? 1.5 : 1;
        v.sign.scale.set(v.signBase * pulse, v.signBase * pulse * h, 1);
        v.sign.position.y = v.signY + Math.sin(time * 2 + v.seg.index) * 0.06;
        // fade out once the camera gets close so it never blocks the view
        const ahead = v.seg.start - cameraPos;
        const op = Math.max(0, Math.min(1, (ahead - 6) / 8));
        (v.sign.material as THREE.SpriteMaterial).opacity = op;
        v.sign.visible = op > 0.01;
      }
      for (const lane of v.obstacles) {
        for (const o of lane) {
          if (o.appear < 1) {
            o.appear = Math.min(1, o.appear + dt * 1.8);
            const e = easeOutBack(o.appear);
            if (o.kind === 'fallenTree') {
              o.group.rotation.z = (1 - e) * (Math.PI / 2);
            } else {
              o.group.position.y = (1 - Math.min(1, o.appear * 1.3)) * 9;
            }
          }
          if (o.state === 'broken') {
            o.t += dt;
            for (const a of o.anims) {
              a.vel.y -= 16 * dt;
              a.mesh.position.addScaledVector(a.vel, dt);
              if (a.mesh.position.y < 0.2) {
                a.mesh.position.y = 0.2;
                a.vel.multiplyScalar(0.5);
                a.vel.y = Math.abs(a.vel.y) * 0.3;
              }
              a.mesh.rotation.x += a.spin.x * dt;
              a.mesh.rotation.y += a.spin.y * dt;
              if (o.t > 0.5) a.mesh.scale.multiplyScalar(Math.pow(0.03, dt));
            }
            if (o.t > 1.4) o.group.visible = false;
          } else if (o.state === 'climbed') {
            o.t += dt;
            o.group.rotation.z = Math.sin(o.t * 30) * 0.06 * Math.max(0, 1 - o.t * 2);
          }
        }
      }
      for (const set of v.coins) {
        set.base.forEach((b, i) => {
          tmpObj.position.copy(b);
          tmpObj.rotation.set(0, 0, 0);
          tmpObj.scale.setScalar(1);
          const st = set.state[i];
          if (st === 'idle') {
            tmpObj.position.y = 1.1 + Math.sin(time * 4 + i) * 0.1;
            tmpObj.rotation.y = time * 3 + i;
          } else if (st === 'taken') {
            set.t[i] += dt;
            tmpObj.position.y = 1.1 + set.t[i] * 6;
            tmpObj.scale.setScalar(Math.max(0.001, 1 - set.t[i] / 0.35));
            if (set.t[i] > 0.35) set.state[i] = 'gone';
          } else if (st === 'missed') {
            set.t[i] += dt;
            tmpObj.position.y = Math.max(0.05, 1.1 - set.t[i] * 3);
            tmpObj.rotation.x = Math.min(1, set.t[i] * 3) * (Math.PI / 2);
            if (set.t[i] > 1.2) set.state[i] = 'gone';
          } else {
            tmpObj.scale.setScalar(0.0001);
          }
          tmpObj.updateMatrix();
          set.mesh.setMatrixAt(i, tmpObj.matrix);
        });
        set.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    // flowing water / lava
    const water = terrainTexture('water');
    water.offset.y = -time * 0.15;
    const deep = terrainTexture('deepWater');
    deep.offset.y = -time * 0.1;
    if (lavaTex) lavaTex.offset.set(time * 0.03, -time * 0.05);
  }

  dispose() {
    for (const k of [...this.visuals.keys()]) this.remove(k);
    for (const e of this.extras) disposeObject(e);
  }
}
