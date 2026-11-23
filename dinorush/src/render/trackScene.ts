import * as THREE from 'three';
import { ARCHETYPE_INFO } from '../config/dinosaurs';
import { GAME_CONFIG } from '../config/gameConfig';
import type { DynamicEventType, ObstacleKind, TrackDefinition, TrackSegment, WorldId } from '../types';
import { bannerTexture, checkerTexture, signTexture, terrainTexture } from './textures';
import { PATH_HALF, racerLateral, TerrainField, TrackPath, zoneFor, type Zone } from './trackPath';
import { TRAIL_CHUNK, TrailBuilder, updateTrailMaterials } from './trail';
import { disposeObject, easeOutBack, GeoMerger, GEO, hash01, mat, mesh, vertexColorMat } from './util';

export function laneX(lane: number): number {
  return (lane - (GAME_CONFIG.laneCount - 1) / 2) * GAME_CONFIG.laneSpacing;
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

let deckMat: THREE.Material | null = null;
function bridgeDeckMaterial(): THREE.Material {
  if (!deckMat) {
    deckMat = new THREE.MeshLambertMaterial({ map: terrainTexture('bridge') });
    deckMat.userData.shared = true;
  }
  return deckMat;
}

// ---------------------------------------------------------------------------
// Barriers across the whole trail
// ---------------------------------------------------------------------------

const BW = PATH_HALF - 0.1;

function rock(color: number, size: number, x: number, y: number, z: number, r: number) {
  const m = mesh(GEO.dodeca(), mat(color), [x, y, z], [size, size * 0.78, size * 0.95], [r * 3, r * 5, r * 2]);
  m.userData.lx = x;
  return m;
}

/**
 * One obstacle spanning the full trail width, made of pieces so every racer
 * can break through it at the place where it runs.
 */
export function buildBarrier(kind: ObstacleKind, world: WorldId, seed: number): THREE.Object3D[] {
  const pieces: THREE.Object3D[] = [];
  const dark = world === 'volcano';
  const r = (k: number) => hash01(seed * 17.3 + k * 3.7);
  const tag = (m: THREE.Object3D, x: number) => {
    m.userData.lx = x;
    pieces.push(m);
  };
  switch (kind) {
    case 'rockPile': {
      const cols = dark ? [0x3d3533, 0x544a46, 0x2f2826] : [0x8c8076, 0xa59a8f, 0x77695f];
      for (let x = -BW; x <= BW; x += 1.05) {
        const s = 0.45 + r(x) * 0.35;
        pieces.push(rock(cols[Math.floor(r(x + 1) * 3)], s, x, s * 0.6, (r(x + 2) - 0.5) * 0.5, r(x + 3)));
        if (r(x + 4) > 0.45) pieces.push(rock(cols[Math.floor(r(x + 5) * 3)], s * 0.7, x + 0.3, s * 1.3, 0.1, r(x + 6)));
      }
      break;
    }
    case 'boulder': {
      const c = dark ? 0x463b37 : 0x968a80;
      for (const x of [-4.7, -1.6, 1.5, 4.6]) {
        const s = 0.85 + r(x) * 0.3;
        const b = mesh(GEO.ico(), mat(c), [x + (r(x + 1) - 0.5) * 0.4, s * 0.85, 0], [s, s * 0.9, s * 0.9], [r(x) * 2, r(x + 2) * 3, 0]);
        tag(b, x);
        if (!dark) tag(mesh(GEO.sphere(0), mat(0x7bc043), [x + 0.2, s * 1.65, 0.15], [0.35, 0.1, 0.3]), x);
      }
      for (const x of [-3.1, 0, 3.05]) pieces.push(rock(c, 0.45, x, 0.3, 0.3, r(x + 9)));
      break;
    }
    case 'woodWall': {
      const posts = [-6, -3, 0, 3, 6];
      for (const x of posts) tag(mesh(GEO.box(), mat(0x6e4218), [x, 0.85, 0], [0.24, 1.7, 0.24]), x);
      for (let i = 0; i < posts.length - 1; i++) {
        const cx = (posts[i] + posts[i + 1]) / 2;
        for (let k = 0; k < 3; k++) {
          tag(mesh(GEO.box(), mat(k % 2 ? 0xb07a3c : 0xc48a4c), [cx, 0.35 + k * 0.45, 0.06], [2.95, 0.32, 0.13], [0, 0, (r(i * 3 + k) - 0.5) * 0.08]), cx);
        }
      }
      break;
    }
    case 'fallenTree': {
      const trunk = world === 'islands' ? 0xa0703c : 0x7a4a24;
      for (let i = 0; i < 6; i++) {
        const x = -BW + 1.05 + i * 2.1;
        const rad = 0.42 - i * 0.025;
        tag(mesh(GEO.cylinder(10), mat(trunk), [x - 1.05, rad, 0], [rad, 2.12, rad], [0, 0, -Math.PI / 2]), x);
        if (i % 2 === 1) tag(mesh(GEO.cylinder(5), mat(trunk), [x, rad + 0.35, 0.1], [0.07, 0.7, 0.07], [0.5, 0, 0.5]), x);
      }
      tag(mesh(GEO.cylinder(10), mat(0xd9a86c), [-BW - 0.05, 0.44, 0], [0.45, 0.06, 0.45], [0, 0, Math.PI / 2]), -BW);
      for (const [x, y, s] of [[BW - 0.6, 0.9, 0.9], [BW - 1.6, 1.0, 0.7], [BW - 0.4, 1.4, 0.6]] as [number, number, number][]) {
        tag(mesh(GEO.sphere(1), mat(world === 'islands' ? 0x4fd06a : 0x3fa34d), [x, y, 0.2], [s, s * 0.8, s]), x);
      }
      break;
    }
    case 'iceBlock': {
      const m1 = mat(0xbfeaff, { opacity: 0.88 });
      const m2 = mat(0x9fdcff, { opacity: 0.88 });
      for (let x = -BW + 0.6; x <= BW; x += 1.25) {
        const h = 0.9 + r(x) * 0.7;
        tag(mesh(GEO.box(), r(x + 1) > 0.5 ? m1 : m2, [x, h / 2, (r(x + 2) - 0.5) * 0.4], [1.15, h, 1.0], [0, (r(x + 3) - 0.5) * 0.5, (r(x + 4) - 0.5) * 0.15]), x);
      }
      break;
    }
    case 'stoneWall': {
      const c = dark ? [0x4a403c, 0x5c514c] : [0x9a9088, 0xb1a79e];
      for (let row = 0; row < 3; row++) {
        for (let x = -BW + (row % 2) * 0.35; x <= BW; x += 0.7) {
          tag(mesh(GEO.box(), mat(c[(Math.round(x * 2) + row) % 2 === 0 ? 0 : 1]), [x, 0.25 + row * 0.45, 0], [0.66, 0.42, 0.6]), x);
        }
      }
      break;
    }
  }
  for (const p of pieces) p.castShadow = true;
  return pieces;
}

interface Flying {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  t: number;
}

interface BarrierVisual {
  group: THREE.Group;
  pieces: THREE.Object3D[];
  flying: Flying[];
  wobble: { mesh: THREE.Object3D; t: number }[];
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
  terrain: TrackSegment['terrain'];
  group: THREE.Group;
  barriers: BarrierVisual[];
  coins: CoinSet[];
  sign: THREE.Sprite | null;
  signBase: number;
  signY: number;
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
 * The visible stretch of the track: one natural trail shared by all
 * racers, terrain decorations, gates with signs, barriers and coins.
 */
export class TrackScene {
  readonly group = new THREE.Group();
  private visuals = new Map<number, SegVisual>();
  private trail = new Map<number, THREE.Group>();
  private trailBuilder: TrailBuilder;
  private extras: THREE.Object3D[] = [];

  constructor(
    private track: TrackDefinition,
    private path: TrackPath,
    private field: TerrainField,
    private world: WorldId,
    private showDinoOnSigns: boolean,
    private lanes: number[],
  ) {
    this.trailBuilder = new TrailBuilder(track, path, field, world);
    this.buildStartFinish();
  }

  private place(obj: THREE.Object3D, d: number, o: number, y = 0) {
    this.path.sample(d, o, obj.position);
    obj.position.y = y;
    obj.rotation.y = -this.path.heading(d);
  }

  private arch(d: number, text: string, color: string, post: number): THREE.Group {
    const g = new THREE.Group();
    for (const x of [-PATH_HALF - 1.3, PATH_HALF + 1.3]) {
      const p = mesh(GEO.cylinder(10), mat(post), [x, 0, 0], [0.32, 5.4, 0.32]);
      p.castShadow = true;
      g.add(p);
      g.add(mesh(GEO.sphere(1), mat(0xffd32a), [x, 5.5, 0], 0.48));
    }
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.0), new THREE.MeshBasicMaterial({ map: bannerTexture(text, color), side: THREE.DoubleSide }));
    banner.position.set(0, 4.5, 0);
    g.add(banner);
    this.place(g, d, 0);
    return g;
  }

  private buildStartFinish() {
    const startArch = this.arch(9, 'START', '#2ed573', 0x2ed573);
    this.group.add(startArch);
    this.extras.push(startArch);
    if (this.track.endless) return;
    const len = this.track.length;
    const checkerMat = new THREE.MeshBasicMaterial({ map: checkerTexture(), transparent: true, opacity: 0.92 });
    const fin = new THREE.Mesh(ribbon(this.path, len, len + 1.6, () => spread(-PATH_HALF - 0.5, PATH_HALF + 0.5, 5), () => 0.06, { uvScale: 0.8 }), checkerMat);
    fin.renderOrder = 3;
    const finArch = this.arch(len, 'CÍL', '#ff4757', 0xff4757);
    this.group.add(fin, finArch);
    this.extras.push(fin, finArch);
    // the finale is dressed up: strings of colourful pennants over the trail
    const finale = this.track.segments.find((s) => s.finale)?.start ?? len * 0.8;
    const m = new GeoMerger();
    const cols = [0xff4757, 0xffd32a, 0x2ed573, 0x1e90ff, 0xa55eea, 0xff9f43];
    const p = new THREE.Vector3();
    for (let d = finale + 6, k = 0; d < len - 4; d += 26, k++) {
      const h = -this.path.heading(d);
      const cx = Math.cos(h);
      const cz = -Math.sin(h);
      const half = PATH_HALF + 1.1;
      for (const side of [-1, 1]) {
        this.path.sample(d, side * half, p);
        m.add(GEO.cylinder(6), 0x8a5a2b, [p.x, 0, p.z], [0.14, 5.2, 0.14]);
        m.add(GEO.sphere(0), cols[k % cols.length], [p.x, 5.3, p.z], 0.26);
      }
      // rope sagging between the poles, flags hanging from it
      const n = 13;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const o = -half + t * half * 2;
        const y = 4.9 - Math.sin(t * Math.PI) * 0.9;
        this.path.sample(d, o, p);
        if (i < n) m.add(GEO.box(), 0xf5f0e6, [p.x + (cx * half * 2) / n / 2, y, p.z + (cz * half * 2) / n / 2], [(half * 2) / n + 0.05, 0.05, 0.05], [0, h, 0]);
        if (i > 0 && i < n) m.add(GEO.cone(3), cols[(i + k) % cols.length], [p.x, y - 0.02, p.z], [0.32, 0.62, 0.06], [0, h, Math.PI]);
      }
    }
    const flags = m.build(vertexColorMat());
    if (flags) {
      flags.castShadow = true;
      this.group.add(flags);
      this.extras.push(flags);
    }
  }

  /** Terrain changed (dynamic event): rebuild the trail there. */
  invalidate(d0: number, d1: number) {
    for (const [k, g] of [...this.trail]) {
      if (k * TRAIL_CHUNK <= d1 + 5 && (k + 1) * TRAIL_CHUNK >= d0 - 5) {
        this.group.remove(g);
        disposeObject(g);
        this.trail.delete(k);
      }
    }
  }

  updateWindow(from: number, to: number) {
    // trail chunks
    const c0 = Math.floor((from - 10) / TRAIL_CHUNK);
    const c1 = Math.floor((to + 10) / TRAIL_CHUNK);
    for (const [k, g] of this.trail) {
      if (k < c0 || k > c1) {
        this.group.remove(g);
        disposeObject(g);
        this.trail.delete(k);
      }
    }
    for (let k = Math.max(-2, c0); k <= c1; k++) {
      if (!this.trail.has(k)) {
        const g = this.trailBuilder.build(k * TRAIL_CHUNK, (k + 1) * TRAIL_CHUNK);
        this.trail.set(k, g);
        this.group.add(g);
      }
    }
    // segment visuals
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
        this.invalidate(s.start - 4, s.end + 4);
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

  private at(d: number, o: number, y: number): [number, number, number] {
    this.path.sample(d, o, tmpV);
    return [tmpV.x, y, tmpV.z];
  }

  // -------------------------------------------------------------------------

  private build(seg: TrackSegment, appear: boolean, eventType?: DynamicEventType): SegVisual {
    const g = new THREE.Group();
    const zone = zoneFor(seg.terrain, this.world);
    const d0 = seg.start;
    const d1 = seg.end;
    const deco = new GeoMerger();
    const glow = new GeoMerger();
    const rnd = (k: number) => hash01(seg.index * 131 + k * 7.13 + d0);
    this.decorate(seg, zone, deco, glow, rnd);
    if (seg.terrain === 'bridge') this.bridge(g, deco, d0, d1);

    // gate + sign where a different dino is needed
    let sign: THREE.Sprite | null = null;
    let signBase = 0;
    let signY = 0;
    const prev = this.track.segments[seg.index - 1];
    if (prev && prev.recommended !== seg.recommended) {
      const color = new THREE.Color(ARCHETYPE_INFO[seg.recommended].color).getHex();
      for (const side of [-1, 1]) {
        const p = this.at(d0, side * (PATH_HALF + 1.4), 0);
        deco.add(GEO.cylinder(8), 0x7a4a24, p, [0.15, 4.9, 0.15]);
        deco.add(GEO.cone(3), color, [p[0], 3.9, p[2]], [0.55, 1.1, 0.08], [0, -this.path.heading(d0) + Math.PI / 2, (-Math.PI / 2) * side]);
        deco.add(GEO.sphere(1), color, [p[0], 5.0, p[2]], 0.28);
      }
      // a row of small coloured marker stones across the trail
      for (let o = -PATH_HALF + 0.4; o <= PATH_HALF - 0.4; o += 1.6) deco.add(GEO.sphere(0), color, this.at(d0, o, 0.06), [0.16, 0.08, 0.16]);
      const spMat = new THREE.SpriteMaterial({ map: signTexture(seg.terrain, this.showDinoOnSigns), depthWrite: false, transparent: true });
      sign = new THREE.Sprite(spMat);
      signBase = 2.3;
      const h = this.showDinoOnSigns ? 1.5 : 1;
      sign.scale.set(signBase, signBase * h, 1);
      signY = 4.5;
      const sp = this.at(d0, 0, signY);
      sign.position.set(sp[0], sp[1], sp[2]);
      sign.renderOrder = 5;
      g.add(sign);
    }

    // one barrier across the trail for every obstacle position
    const barriers: BarrierVisual[] = seg.obstacles.map((o, i) => {
      const bg = new THREE.Group();
      const pieces = buildBarrier(o.kind, this.world, seg.index * 10 + i);
      for (const p of pieces) bg.add(p);
      this.place(bg, o.at, 0, 0);
      g.add(bg);
      return { group: bg, pieces, flying: [], wobble: [], appear: appear ? 0 : 1, kind: o.kind };
    });

    // coins on each racer's running line (instanced)
    const coins: CoinSet[] = [];
    if (seg.coins.length) {
      for (const lane of this.lanes) {
        const m = new THREE.InstancedMesh(coinGeometry(), mat(0xffd32a, { emissive: 0x6b4a00 }), seg.coins.length);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        g.add(m);
        coins.push({
          mesh: m,
          base: seg.coins.map((c) => this.path.sample(c, racerLateral(this.path, lane, c), new THREE.Vector3())),
          state: seg.coins.map(() => 'idle'),
          t: seg.coins.map(() => 0),
        });
      }
    }

    const decoMesh = deco.build(vertexColorMat());
    if (decoMesh) {
      decoMesh.castShadow = true;
      decoMesh.receiveShadow = true;
      g.add(decoMesh);
    }
    const glowMesh = glow.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
    if (glowMesh) g.add(glowMesh);
    this.group.add(g);
    return { seg, terrain: seg.terrain, group: g, barriers, coins, sign, signBase, signY, eventType };
  }

  /** Terrain-specific decorations around the trail. */
  private decorate(seg: TrackSegment, zone: Zone, deco: GeoMerger, glow: GeoMerger, rnd: (k: number) => number) {
    const f = this.field;
    const d0 = seg.start;
    const d1 = seg.end;
    switch (zone.kind) {
      case 'water':
      case 'deep':
      case 'lava': {
        for (const bank of [d0 + 0.6, d1 - 0.6]) {
          for (let k = 0; k < 20; k++) {
            const side = k % 2 ? 1 : -1;
            const o = side * (PATH_HALF + 1.2 + rnd(k + bank) * (f.edge(zone, bank, side) - PATH_HALF - 1.5));
            if (zone.kind === 'lava') {
              deco.add(GEO.dodeca(), 0x2a2322, this.at(bank, o, 0.15), [0.6 + rnd(k) * 0.6, 0.4, 0.6], [rnd(k), rnd(k + 1), 0]);
            } else if (rnd(k + 3) > 0.4) {
              const p = this.at(bank, o, 0);
              for (let r = 0; r < 5; r++) deco.add(GEO.cone(4), r % 2 ? 0x3f8f3a : 0x5fb04a, [p[0] + (rnd(r + k) - 0.5) * 0.7, -0.1, p[2] + (rnd(r * 3 + k) - 0.5) * 0.7], [0.05, 1.0 + rnd(r) * 0.7, 0.05]);
              deco.add(GEO.sphere(0), 0x7a4a24, [p[0], 1.05 + rnd(k) * 0.4, p[2]], [0.06, 0.18, 0.06]);
            } else {
              deco.add(GEO.dodeca(), 0x8c8076, this.at(bank, o, 0.02), [0.45 + rnd(k) * 0.5, 0.28, 0.4], [rnd(k), rnd(k + 2), 0]);
            }
          }
        }
        if (zone.kind !== 'lava') {
          const pads = Math.floor((d1 - d0) / 2.5);
          for (let k = 0; k < pads; k++) {
            const side = k % 2 ? 1 : -1;
            const d = d0 + 2 + rnd(k + 40) * (d1 - d0 - 4);
            const o = side * (PATH_HALF + 1.5 + rnd(k + 41) * 14);
            deco.add(GEO.disc(), 0x3fae49, this.at(d, o, 0.06), [0.5 + rnd(k) * 0.3, 1, 0.45]);
            if (rnd(k + 9) > 0.7) deco.add(GEO.sphere(0), 0xff9ff3, this.at(d, o, 0.12), 0.12);
          }
        } else {
          for (let k = 0; k < 8; k++) glow.add(GEO.sphere(0), 0xffd24a, this.at(d0 + rnd(k) * (d1 - d0), (k % 2 ? 1 : -1) * (PATH_HALF + 2 + rnd(k + 5) * 20), 0.05), [0.5, 0.1, 0.5]);
        }
        break;
      }
      case 'mud':
      case 'sand':
      case 'snow':
      case 'ice': {
        const n = Math.floor((d1 - d0) / 2);
        for (let k = 0; k < n; k++) {
          const side = k % 2 ? 1 : -1;
          const d = d0 + 1 + rnd(k) * (d1 - d0 - 2);
          const e = f.edge(zone, d, side);
          const o = side * (PATH_HALF + 1.0 + rnd(k + 1) * Math.max(0.5, e - PATH_HALF - 2));
          const s = 0.4 + rnd(k + 2) * 0.8;
          if (zone.kind === 'mud') {
            deco.add(GEO.disc(), 0x2e1c0c, this.at(d, o, 0.04), [s * 1.6, 1, s]);
            if (rnd(k + 5) > 0.7) deco.add(GEO.cylinder(4), 0x4a3320, this.at(d, o, -0.05), [0.04, 0.9, 0.04], [0.3, 0, 0.2]);
          } else if (zone.kind === 'sand') {
            deco.add(GEO.sphere(1), this.world === 'volcano' ? 0x7d716a : 0xe8c45c, this.at(d, o, -0.25), [s * 2.4, s * 0.7, s * 1.8]);
            if (rnd(k + 6) > 0.85) deco.add(GEO.sphere(0), rnd(k) > 0.5 ? 0xff9f80 : 0xffffff, this.at(d, o, 0.06), 0.12);
          } else if (zone.kind === 'snow') {
            deco.add(GEO.sphere(1), 0xffffff, this.at(d, o, -0.18), [s * 2.2, s * 0.8, s * 1.6]);
          } else {
            deco.add(GEO.box(), rnd(k) > 0.5 ? 0xbfeaff : 0x9fdcff, this.at(d, side * (e - 0.5 + rnd(k + 3)), 0.2), [s, s * 0.6, s * 0.8], [0, rnd(k) * 3, 0.2]);
          }
        }
        if (zone.kind === 'ice') {
          for (let d = d0; d < d1; d += 3) {
            for (const side of [-1, 1]) deco.add(GEO.sphere(1), 0xffffff, this.at(d, side * (f.edge(zone, d, side) + 0.5), -0.1), [1.5, 0.45, 1.7]);
          }
        }
        break;
      }
      case 'rock': {
        const dark = this.world === 'volcano';
        const n = Math.floor((d1 - d0) / 1.4);
        for (let k = 0; k < n; k++) {
          const side = k % 2 ? 1 : -1;
          const d = d0 + rnd(k) * (d1 - d0);
          const o = side * (PATH_HALF + 1.8 + rnd(k + 1) * 7);
          const s = 0.25 + rnd(k + 2) * 0.55;
          deco.add(GEO.dodeca(), dark ? 0x4a3d39 : rnd(k) > 0.5 ? 0x8c8076 : 0xa59a8f, this.at(d, o, s * 0.35), [s, s * 0.75, s * 0.9], [rnd(k), rnd(k + 3) * 3, 0]);
        }
        break;
      }
      case 'wood': {
        for (let k = 0; k < 6; k++) {
          const side = k % 2 ? 1 : -1;
          const d = d0 + rnd(k) * (d1 - d0);
          const p = this.at(d, side * (PATH_HALF + 1.6 + rnd(k + 1) * 2), 0.3);
          const yaw = -this.path.heading(d) + 1.4 + rnd(k) * 0.3;
          for (let l = 0; l < 3; l++) deco.add(GEO.cylinder(7), l % 2 ? 0x8a5a28 : 0xa0703c, [p[0], p[1] + l * 0.32, p[2]], [0.18, 2.2, 0.18], [0, yaw, Math.PI / 2]);
        }
        break;
      }
      default:
        break;
    }
  }

  /** Wooden bridge with ramps, rails and posts standing in the water. */
  private bridge(g: THREE.Group, deco: GeoMerger, d0: number, d1: number) {
    const H = 0.6;
    const deckY = (d: number) => {
      const t0 = Math.min(1, Math.max(0, (d - d0) / 3));
      const t1 = Math.min(1, Math.max(0, (d1 - d) / 3));
      return 0.05 + H * Math.min(t0, t1);
    };
    const deck = new THREE.Mesh(ribbon(this.path, d0, d1, () => spread(-PATH_HALF - 0.4, PATH_HALF + 0.4, 5), (d) => deckY(d), { step: 1, uvScale: 3 }), bridgeDeckMaterial());
    deck.receiveShadow = true;
    deck.castShadow = true;
    g.add(deck);
    for (let d = d0 + 1; d < d1; d += 2.4) {
      for (const side of [-1, 1]) {
        const p = this.at(d, side * (PATH_HALF + 0.35), 0);
        const top = deckY(d) + 1.0;
        deco.add(GEO.cylinder(6), 0x5c3512, [p[0], -0.6, p[2]], [0.13, top + 0.6, 0.13]);
        const q = this.at(Math.min(d1 - 0.5, d + 2.4), side * (PATH_HALF + 0.35), 0);
        const len = Math.hypot(q[0] - p[0], q[2] - p[2]);
        const yaw = Math.atan2(q[0] - p[0], q[2] - p[2]);
        deco.add(GEO.box(), 0x7d4a1f, [(p[0] + q[0]) / 2, top, (p[2] + q[2]) / 2], [0.12, 0.12, len], [0, yaw, 0]);
      }
    }
  }

  // -------------------------------------------------------------------------

  private hitPoint(b: BarrierVisual, lateral: number): THREE.Vector3 {
    const p = new THREE.Vector3(lateral, 0.8, 0);
    b.group.updateMatrixWorld();
    return p.applyMatrix4(b.group.matrixWorld);
  }

  /** A racer running at `lateral` smashes through its part of the barrier. */
  smash(segIndex: number, obsIndex: number, lateral: number, power: boolean): THREE.Vector3 | null {
    const b = this.visuals.get(segIndex)?.barriers[obsIndex];
    if (!b) return null;
    for (const p of b.pieces) {
      if (p.userData.broken || Math.abs((p.userData.lx ?? 0) - lateral) > 1.75) continue;
      p.userData.broken = true;
      b.flying.push({
        mesh: p,
        vel: new THREE.Vector3(((p.userData.lx ?? 0) - lateral) * 3 + (Math.random() - 0.5) * 3, 3 + Math.random() * 4 + (power ? 2 : 0), -4 - Math.random() * 5),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
        t: 0,
      });
    }
    return this.hitPoint(b, lateral);
  }

  climb(segIndex: number, obsIndex: number, lateral: number): THREE.Vector3 | null {
    const b = this.visuals.get(segIndex)?.barriers[obsIndex];
    if (!b) return null;
    for (const p of b.pieces) {
      if (!p.userData.broken && Math.abs((p.userData.lx ?? 0) - lateral) < 1.9) b.wobble.push({ mesh: p, t: 0 });
    }
    return this.hitPoint(b, lateral);
  }

  coin(lane: number, segIndex: number, coinIndex: number, taken: boolean): THREE.Vector3 | null {
    const set = this.visuals.get(segIndex)?.coins[this.lanes.indexOf(lane)];
    if (!set || set.state[coinIndex] !== 'idle') return null;
    set.state[coinIndex] = taken ? 'taken' : 'missed';
    set.t[coinIndex] = 0;
    return set.base[coinIndex].clone().setY(1);
  }

  update(dt: number, time: number, focusPos: number, speed: number, warnTime: number, cameraPos = focusPos) {
    updateTrailMaterials(time);
    for (const v of this.visuals.values()) {
      if (v.sign) {
        const ttc = (v.seg.start - focusPos) / Math.max(speed, 4);
        const near = ttc > 0 && ttc < warnTime;
        const pulse = near ? 1.15 + Math.sin(time * 10) * 0.07 : 1;
        const h = this.showDinoOnSigns ? 1.5 : 1;
        v.sign.scale.set(v.signBase * pulse, v.signBase * pulse * h, 1);
        v.sign.position.y = v.signY + Math.sin(time * 2 + v.seg.index) * 0.06;
        const ahead = v.seg.start - cameraPos;
        const op = Math.max(0, Math.min(1, (ahead - 6) / 8));
        (v.sign.material as THREE.SpriteMaterial).opacity = op;
        v.sign.visible = op > 0.01;
      }
      for (const b of v.barriers) {
        if (b.appear < 1) {
          b.appear = Math.min(1, b.appear + dt * 1.8);
          const e = easeOutBack(b.appear);
          if (b.kind === 'fallenTree') b.group.position.y = (1 - e) * 4;
          else b.group.position.y = (1 - Math.min(1, b.appear * 1.3)) * 9;
        }
        for (let i = b.flying.length - 1; i >= 0; i--) {
          const a = b.flying[i];
          a.t += dt;
          a.vel.y -= 16 * dt;
          a.mesh.position.addScaledVector(a.vel, dt);
          if (a.mesh.position.y < 0.2) {
            a.mesh.position.y = 0.2;
            a.vel.multiplyScalar(0.5);
            a.vel.y = Math.abs(a.vel.y) * 0.3;
          }
          a.mesh.rotation.x += a.spin.x * dt;
          a.mesh.rotation.y += a.spin.y * dt;
          if (a.t > 0.5) a.mesh.scale.multiplyScalar(Math.pow(0.03, dt));
          if (a.t > 1.4) {
            a.mesh.visible = false;
            b.flying.splice(i, 1);
          }
        }
        for (let i = b.wobble.length - 1; i >= 0; i--) {
          const w = b.wobble[i];
          w.t += dt;
          w.mesh.rotation.z = (w.mesh.userData.rz0 ??= w.mesh.rotation.z) + Math.sin(w.t * 30) * 0.06 * Math.max(0, 1 - w.t * 2);
          if (w.t > 0.5) {
            w.mesh.rotation.z = w.mesh.userData.rz0;
            b.wobble.splice(i, 1);
          }
        }
      }
      for (const set of v.coins) {
        set.base.forEach((base, i) => {
          tmpObj.position.copy(base);
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
  }

  dispose() {
    for (const k of [...this.visuals.keys()]) this.remove(k);
    for (const [k, g] of this.trail) {
      disposeObject(g);
      this.trail.delete(k);
    }
    for (const e of this.extras) disposeObject(e);
  }
}

