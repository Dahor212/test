import * as THREE from 'three';
import type { WorldDefinition, WorldId } from '../types';
import type { Particles } from './particles';
import { PATH_HALF, TerrainField, TrackPath } from './trackPath';
import { ribbon } from './trackScene';
import { disposeObject, GeoMerger, GEO, hash01, mat, vertexColorMat } from './util';

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

const tropicalTree: Adder = (m, x, z, s, r) => {
  const h = 4.5 * s;
  m.add(GEO.cylinder(6), 0x8a5a2b, [x, 0, z], [0.25 * s, h, 0.25 * s], [0, 0, (r - 0.5) * 0.2]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r;
    m.add(GEO.sphere(0), i % 2 ? 0x2e9e44 : 0x46c35a, [x + Math.cos(a) * 1.1 * s, h + 0.1, z + Math.sin(a) * 1.1 * s], [1.4 * s, 0.25 * s, 0.55 * s], [0, -a, -0.35]);
  }
  m.add(GEO.sphere(0), 0x3cb04f, [x, h + 0.35 * s, z], 0.6 * s);
};

const fern: Adder = (m, x, z, s, r) => {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r * 3;
    m.add(GEO.sphere(0), i % 2 ? 0x2f9e3a : 0x5fcf4a, [x + Math.cos(a) * 0.8 * s, 0.55 * s, z + Math.sin(a) * 0.8 * s], [1.0 * s, 0.12 * s, 0.32 * s], [0, -a, 0.55]);
  }
};

const bush: Adder = (m, x, z, s, r) => {
  m.add(GEO.ico(), 0x3fae49, [x, 0.6 * s, z], [1.0 * s, 0.8 * s, 1.0 * s], [r, r * 2, 0]);
  m.add(GEO.ico(), 0x58c45a, [x + 0.7 * s, 0.45 * s, z + 0.3 * s], 0.65 * s);
  if (r > 0.5) m.add(GEO.sphere(0), 0xff6b81, [x + 0.3 * s, 1.1 * s, z - 0.3], 0.15 * s);
};

const rock = (color: number): Adder => (m, x, z, s, r) => {
  m.add(GEO.dodeca(), color, [x, 0.35 * s, z], [1.0 * s, 0.7 * s, 0.9 * s], [r, r * 3, r * 2]);
};

const flowers: Adder = (m, x, z, s, r) => {
  const cols = [0xff6b81, 0xffd32a, 0xffffff, 0xa55eea];
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3 + r * 6;
    m.add(GEO.sphere(0), cols[(i + Math.floor(r * 4)) % 4], [x + Math.cos(a) * 0.7, 0.2, z + Math.sin(a) * 0.7], 0.16 * s);
  }
};

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

const palm: Adder = (m, x, z, s, r) => {
  const lean = (r - 0.5) * 0.6;
  for (let i = 0; i < 5; i++) {
    m.add(GEO.cylinder(6), i % 2 ? 0xb07a3c : 0x9a6630, [x + lean * i * 0.4 * s, i * 0.95 * s, z], [0.22 * s, 1.0 * s, 0.22 * s], [0, 0, -lean * 0.3]);
  }
  const tx = x + lean * 2 * s;
  const ty = 4.8 * s;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r;
    m.add(GEO.sphere(0), i % 2 ? 0x2fae52 : 0x4fd06a, [tx + Math.cos(a) * 1.3 * s, ty - 0.3 * s, z + Math.sin(a) * 1.3 * s], [1.6 * s, 0.14 * s, 0.4 * s], [0, -a, -0.5]);
  }
  m.add(GEO.sphere(0), 0x8a5a2b, [tx + 0.2, ty - 0.4 * s, z], 0.25 * s);
};

const deadTree: Adder = (m, x, z, s, r) => {
  m.add(GEO.cylinder(5), 0x2b2220, [x, 0, z], [0.2 * s, 3 * s, 0.2 * s], [0, 0, (r - 0.5) * 0.3]);
  m.add(GEO.cylinder(4), 0x2b2220, [x, 2 * s, z], [0.1 * s, 1.4 * s, 0.1 * s], [0, r, 0.9]);
  m.add(GEO.cylinder(4), 0x2b2220, [x, 1.5 * s, z], [0.09 * s, 1.1 * s, 0.09 * s], [0, r, -0.8]);
};

const volcanoRock: Adder = (m, x, z, s, r) => {
  m.add(GEO.dodeca(), 0x4a3d39, [x, 0.6 * s, z], [1.3 * s, 1.2 * s, 1.1 * s], [r, r * 2, 0]);
  m.add(GEO.cone(5), 0x5a4a45, [x + 1 * s, 0, z + 0.5], [0.6 * s, 2.2 * s, 0.6 * s]);
};

const beachShell: Adder = (m, x, z, s, r) => {
  m.add(GEO.sphere(0), r > 0.5 ? 0xff9f80 : 0xffffff, [x, 0.08, z], [0.3 * s, 0.12 * s, 0.25 * s]);
};

interface WorldStyle {
  near: [Adder, number][];
  far: [Adder, number][];
  border: number;
  sideStrip?: number;
  glow?: (m: Sink, x: number, z: number, r: number) => void;
}

const STYLES: Record<WorldId, WorldStyle> = {
  jungle: {
    near: [[fern, 3], [bush, 2], [flowers, 2], [rock(0x8c8076), 1]],
    far: [[tropicalTree, 4], [fern, 2], [bush, 1]],
    border: 0x8a5a2b,
  },
  volcano: {
    near: [[volcanoRock, 3], [rock(0x5a4c47), 2], [deadTree, 1]],
    far: [[volcanoRock, 3], [deadTree, 2], [rock(0x4a3e3a), 2]],
    border: 0xd35400,
    glow: (m, x, z, r) => {
      m.add(GEO.disc(), r > 0.5 ? 0xff6a00 : 0xff9a1a, [x, 0.03, z], [2.2 + r * 2, 1, 1.4 + r]);
      m.add(GEO.disc(), 0xffd24a, [x, 0.05, z], [1 + r, 1, 0.6 + r * 0.5]);
    },
  },
  ice: {
    near: [[snowMound, 3], [iceSpike, 1], [pine(true), 1]],
    far: [[pine(true), 4], [iceSpike, 2], [snowMound, 2]],
    border: 0xbfe0f5,
  },
  islands: {
    near: [[beachShell, 3], [bush, 1], [flowers, 1], [rock(0xb8a68f), 1]],
    far: [[palm, 4], [bush, 1], [rock(0xa89680), 1]],
    border: 0xe8c45c,
    sideStrip: 0xf6e27f,
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

function skyDome(top: number, bottom: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(400, 24, 12);
  const colors = new Float32Array(geo.getAttribute('position').count * 3);
  const ct = new THREE.Color(top);
  const cb = new THREE.Color(bottom);
  const pos = geo.getAttribute('position');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 400;
    c.copy(cb).lerp(ct, Math.max(0, Math.min(1, y * 1.6 + 0.1)));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10;
  return m;
}

const COLS = [-150, -110, -82, -62, -48, -38, -30, -24, -19, -15, -12, -9.5, -7.8, -6.8, -4, 0, 4, 6.8, 7.8, 9.5, 12, 15, 19, 24, 30, 38, 48, 62, 82, 110, 150];

/**
 * Streams the landscape along the curved track: a valley of rolling hills
 * (with basins where rivers and lakes cross), vegetation and rocks placed
 * on the slopes, a far mountain ring, sky and weather.
 */
export class WorldScenery {
  readonly group = new THREE.Group();
  private world: WorldDefinition;
  private style: WorldStyle;
  private ground = new Map<number, THREE.Mesh>();
  private chunks = new Map<number, THREE.Object3D>();
  private sky: THREE.Mesh;
  private bg = new THREE.Group();
  private sea: THREE.Mesh | null = null;
  private smokeTimer = 0;
  private weatherTimer = 0;
  private volcanoTops: THREE.Vector3[] = [];
  private c1: THREE.Color;
  private c2: THREE.Color;

  constructor(
    world: WorldDefinition,
    private path: TrackPath,
    private field: TerrainField,
  ) {
    this.world = world;
    this.style = STYLES[world.id] ?? STYLES.jungle;
    this.sky = skyDome(world.sky.top, world.sky.bottom);
    this.c1 = new THREE.Color(world.ground);
    this.c2 = new THREE.Color(world.ground2);
    this.group.add(this.sky, this.bg);
    if (world.id === 'islands') {
      this.sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), mat(0x1fc8db, { flat: false, emissive: 0x05303a }));
      this.sea.position.y = -0.6;
      this.group.add(this.sea);
    }
    this.buildBackground();
  }

  private buildBackground() {
    const w = this.world.id;
    const m = new GeoMerger();
    const glow = new GeoMerger();
    const fog = new THREE.Color(this.world.fog);
    const tint = (c: number, k = 0.45) => new THREE.Color(c).lerp(fog, k).getHex();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + hash01(i * 3) * 0.2;
      const r = 230 + hash01(i * 7 + w.length) * 90;
      const x = Math.sin(a) * r;
      const z = -Math.cos(a) * r;
      const s = 0.8 + hash01(i * 13) * 0.9;
      if (w === 'jungle') {
        m.add(GEO.cone(7), tint(0x2f8a4a), [x, -2, z], [45 * s, 46 * s, 45 * s]);
      } else if (w === 'volcano') {
        m.add(GEO.cone(8), tint(0x3a2a28, 0.35), [x, -2, z], [48 * s, 62 * s, 48 * s]);
        if (i % 4 === 0) {
          glow.add(GEO.cone(8), 0xff5a1a, [x, 52 * s, z], [12 * s, 9 * s, 12 * s]);
          this.volcanoTops.push(new THREE.Vector3(x, 61 * s, z));
        }
      } else if (w === 'ice') {
        m.add(GEO.cone(5), tint(0xdcefff, 0.3), [x, -2, z], [40 * s, 66 * s, 40 * s], [0, a, 0]);
        m.add(GEO.cone(5), 0xffffff, [x, 38 * s, z], [16 * s, 26 * s, 16 * s], [0, a, 0]);
      } else {
        m.add(GEO.sphere(1), tint(0x6fcf6a), [x, -8, z], [36 * s, 22 * s, 30 * s]);
        m.add(GEO.cone(6), tint(0x4caf50), [x, 0, z], [18 * s, 34 * s, 18 * s]);
      }
    }
    const mtn = m.build(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }));
    if (mtn) this.bg.add(mtn);
    // soft clouds
    const cl = new GeoMerger();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + hash01(i * 5) * 0.4;
      const r = 150 + hash01(i * 11) * 110;
      const x = Math.sin(a) * r;
      const z = -Math.cos(a) * r;
      const y = 55 + hash01(i * 3) * 35;
      const s = 6 + hash01(i * 9) * 6;
      const white = w === 'volcano' ? 0x9a8a8a : 0xffffff;
      for (let k = 0; k < 5; k++) cl.add(GEO.sphere(1), k % 2 ? white : (w === 'volcano' ? 0x7a6a6a : 0xf1f6fb), [x + (k - 2) * s * 0.9, y + Math.sin(k * 1.7) * s * 0.3, z + Math.cos(k) * s * 0.4], [s * (1.1 - Math.abs(k - 2) * 0.18), s * 0.62, s * 0.8]);
    }
    const clouds = cl.build(new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, emissive: 0x606060 }));
    if (clouds) this.bg.add(clouds);
    const g = glow.build(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    if (g) this.bg.add(g);
  }

  private groundColor(d: number, o: number, y: number): THREE.Color {
    const n = hash01(Math.round(d / 3) * 17 + Math.round(o / 3) * 3);
    const c = this.c1.clone().lerp(this.c2, 0.25 + n * 0.35);
    const w = this.world.id;
    if (y < -0.15) c.lerp(new THREE.Color(w === 'volcano' ? 0x2a1d18 : 0x6b5a3a), Math.min(1, -y * 1.6));
    if (y > 2) {
      const hill = Math.min(1, (y - 2) / 6);
      if (w === 'ice') c.lerp(new THREE.Color(0xffffff), hill * 0.6);
      else if (w === 'volcano') c.lerp(new THREE.Color(0x3a2c28), hill * 0.7);
      else c.lerp(new THREE.Color(w === 'islands' ? 0x5cbf4a : 0x2f8a3a), hill * 0.5);
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
    const m = new GeoMerger();
    const raised = new Raised(m);
    const glow = new GeoMerger();
    const seed = k * 31 + this.world.id.length * 1000;
    const p = new THREE.Vector3();
    for (let i = 0; i < 26; i++) {
      const r1 = hash01(seed + i * 3.1);
      const r2 = hash01(seed + i * 5.7);
      const r3 = hash01(seed + i * 9.3);
      const side = i % 2 ? 1 : -1;
      const near = i < 12;
      const d = k * CHUNK + r2 * CHUNK;
      if (d < -60) continue;
      const edge = this.field.smoothEdge(d, side);
      const o = side * (near ? edge + 1.6 + r1 * 7 : edge + 9 + r1 * 55);
      if (!this.field.isDry(d, o)) continue;
      this.path.sample(d, o, p);
      raised.y = this.field.groundY(d, o);
      if (raised.y < -0.25) continue;
      const s = near ? 0.6 + r3 * 0.6 : 0.9 + r3 * 0.9;
      const adder = pickAdder(near ? this.style.near : this.style.far, r3);
      adder(raised, p.x, p.z, s, r2);
    }
    if (this.style.glow && hash01(seed + 99) > 0.35) {
      const side = hash01(seed + 7) > 0.5 ? 1 : -1;
      const d = k * CHUNK + hash01(seed + 9) * CHUNK;
      const o = side * (this.field.smoothEdge(d, side) + 6 + hash01(seed + 8) * 14);
      this.path.sample(d, o, p);
      const r = new Raised(glow);
      r.y = this.field.groundY(d, o) + 0.05;
      this.style.glow(r, p.x, p.z, hash01(seed + 10));
    }
    const g = new THREE.Group();
    const a = m.build(vertexColorMat());
    if (a) {
      a.castShadow = true;
      a.receiveShadow = true;
      g.add(a);
    }
    const b = glow.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
    if (b) g.add(b);
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
    this.sky.position.copy(camera.position);
    this.bg.position.set(camera.position.x, 0, camera.position.z);
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
    if (this.world.weather === 'snow' && this.weatherTimer > 0.05) {
      this.weatherTimer = 0;
      const k = 8 + Math.random() * 40;
      particles.emit('snow', cx + fwd.x * k + (Math.random() - 0.5) * 36, 6, cz + fwd.z * k + (Math.random() - 0.5) * 36, { count: 2 });
    } else if (this.world.weather === 'sparkle' && this.weatherTimer > 0.2) {
      this.weatherTimer = 0;
      const k = 20 + Math.random() * 50;
      const side = Math.random() > 0.5 ? 1 : -1;
      particles.emit('sparkle', cx + fwd.x * k + fwd.z * side * 45, 0.1, cz + fwd.z * k - fwd.x * side * 45, { count: 1, color: 0xffffff });
    }
    this.smokeTimer += dt;
    if (this.volcanoTops.length && this.smokeTimer > 0.3) {
      this.smokeTimer = 0;
      const t = this.volcanoTops[Math.floor(Math.random() * this.volcanoTops.length)];
      particles.emit('smoke', cx + t.x * 0.55, t.y * 0.6, cz + t.z * 0.55, { count: 1, scale: 4 });
    }
  }

  dispose() {
    disposeObject(this.group);
    this.chunks.clear();
    this.ground.clear();
  }
}

export function applyWorldLighting(scene: THREE.Scene, world: WorldDefinition): { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight } {
  scene.fog = new THREE.Fog(world.fog, world.fogNear, world.fogFar);
  scene.background = new THREE.Color(world.sky.bottom);
  const hemi = new THREE.HemisphereLight(world.ambient, world.ground, world.id === 'volcano' ? 2.5 : 1.9);
  const sun = new THREE.DirectionalLight(world.sun, world.sunIntensity);
  sun.position.set(-6, 12, 4);
  scene.add(hemi, sun, sun.target);
  return { hemi, sun };
}

