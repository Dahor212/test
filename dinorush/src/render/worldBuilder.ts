import * as THREE from 'three';
import type { WorldDefinition, WorldId } from '../types';
import type { Particles } from './particles';
import { disposeObject, GeoMerger, GEO, hash01, mat, mesh, vertexColorMat } from './util';

const CHUNK = 30;

// ---------------------------------------------------------------------------
// Scenery primitives (added into a GeoMerger)
// ---------------------------------------------------------------------------

type Adder = (m: GeoMerger, x: number, z: number, s: number, r: number) => void;

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
  glow?: (m: GeoMerger, x: number, z: number, r: number) => void;
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

/**
 * Builds and streams the environment around the track for one world.
 */
export class WorldScenery {
  readonly group = new THREE.Group();
  private world: WorldDefinition;
  private style: WorldStyle;
  private chunks = new Map<number, THREE.Object3D>();
  private follow = new THREE.Group();
  private sky: THREE.Mesh;
  private bg = new THREE.Group();
  private smokeTimer = 0;
  private weatherTimer = 0;
  private volcanoTops: THREE.Vector3[] = [];
  private seaPlanes: THREE.Mesh[] = [];

  constructor(world: WorldDefinition) {
    this.world = world;
    this.style = STYLES[world.id] ?? STYLES.jungle;
    this.sky = skyDome(world.sky.top, world.sky.bottom);
    this.group.add(this.sky, this.follow, this.bg);
    // ground + track bed + lane dividers (follow the camera focus)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500).rotateX(-Math.PI / 2), mat(world.ground));
    ground.position.y = -0.08;
    this.follow.add(ground);
    if (this.style.sideStrip) {
      for (const x of [-8.5, 8.5]) this.follow.add(mesh(new THREE.PlaneGeometry(7, 500).rotateX(-Math.PI / 2), mat(this.style.sideStrip), [x, -0.06, 0]));
    }
    if (world.id === 'islands') {
      for (const x of [-60, 60]) {
        const sea = mesh(new THREE.PlaneGeometry(90, 500).rotateX(-Math.PI / 2), mat(0x1fc8db, { flat: false, emissive: 0x05303a }), [x, -0.04, 0]);
        this.follow.add(sea);
        this.seaPlanes.push(sea);
      }
    }
    const bed = mesh(new THREE.PlaneGeometry(10.8, 500).rotateX(-Math.PI / 2), mat(world.ground2), [0, -0.02, 0]);
    this.follow.add(bed);
    for (const x of [-1.7, 1.7]) this.follow.add(mesh(GEO.box(), mat(0xffffff), [x, 0.05, 0], [0.12, 0.1, 500]));
    for (const x of [-5.35, 5.35]) this.follow.add(mesh(GEO.box(), mat(this.style.border), [x, 0.12, 0], [0.35, 0.3, 500]));
    this.buildBackground();
  }

  private buildBackground() {
    const w = this.world.id;
    const m = new GeoMerger();
    const glow = new GeoMerger();
    for (let i = 0; i < 18; i++) {
      const r = hash01(i * 7 + w.length);
      const side = i % 2 ? 1 : -1;
      const x = side * (60 + r * 90);
      const z = -40 - (i / 18) * 260;
      const s = 0.7 + hash01(i * 13) * 0.8;
      if (w === 'jungle') {
        m.add(GEO.cone(7), 0x2f8a4a, [x, 0, z], [30 * s, 26 * s, 30 * s]);
        m.add(GEO.cone(7), 0x3fa35a, [x * 0.8, 0, z - 20], [20 * s, 18 * s, 20 * s]);
      } else if (w === 'volcano') {
        m.add(GEO.cone(8), 0x3a2a28, [x, 0, z], [30 * s, 38 * s, 30 * s]);
        if (i % 3 === 0) {
          glow.add(GEO.cone(8), 0xff5a1a, [x, 33 * s, z], [8 * s, 6 * s, 8 * s]);
          this.volcanoTops.push(new THREE.Vector3(x, 39 * s, z));
        }
      } else if (w === 'ice') {
        m.add(GEO.cone(5), 0xdcefff, [x, 0, z], [26 * s, 42 * s, 26 * s], [0, r, 0]);
        m.add(GEO.cone(5), 0xffffff, [x, 26 * s, z], [10 * s, 16 * s, 10 * s], [0, r, 0]);
      } else {
        m.add(GEO.sphere(1), 0x6fcf6a, [x * 1.3, -6, z], [26 * s, 14 * s, 22 * s]);
        m.add(GEO.sphere(1), 0xf6e27f, [x * 1.3, -7.5, z], [30 * s, 8 * s, 26 * s]);
      }
    }
    const a = m.build(vertexColorMat());
    if (a) {
      a.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: true });
      this.bg.add(a);
    }
    const g = glow.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
    if (g) this.bg.add(g);
  }

  private buildChunk(k: number): THREE.Object3D {
    const m = new GeoMerger();
    const glow = new GeoMerger();
    const z0 = -k * CHUNK;
    const seed = k * 31 + this.world.id.length * 1000;
    for (let i = 0; i < 16; i++) {
      const r1 = hash01(seed + i * 3.1);
      const r2 = hash01(seed + i * 5.7);
      const r3 = hash01(seed + i * 9.3);
      const side = i % 2 ? 1 : -1;
      const near = i < 8;
      const x = side * (near ? 6.5 + r1 * 5 : 12 + r1 * 22);
      const z = z0 - r2 * CHUNK;
      const s = near ? 0.6 + r3 * 0.6 : 0.8 + r3 * 0.7;
      const adder = pickAdder(near ? this.style.near : this.style.far, r3);
      adder(m, x, z, s, r2);
    }
    if (this.style.glow && hash01(seed + 99) > 0.4) {
      const side = hash01(seed + 7) > 0.5 ? 1 : -1;
      this.style.glow(glow, side * (9 + hash01(seed + 8) * 8), z0 - hash01(seed + 9) * CHUNK, hash01(seed + 10));
    }
    const g = new THREE.Group();
    const a = m.build(vertexColorMat());
    if (a) g.add(a);
    const b = glow.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
    if (b) g.add(b);
    return g;
  }

  /** Stream chunks and move follow-objects. `focusZ` = world z of the camera focus. */
  update(focusPos: number, camera: THREE.Camera, dt: number, time: number, particles: Particles | null, weather: boolean) {
    const fz = -focusPos;
    this.follow.position.z = Math.round(fz / 20) * 20;
    this.sky.position.copy(camera.position);
    this.bg.position.z = fz;
    const first = Math.floor((focusPos - 40) / CHUNK);
    const last = Math.floor((focusPos + 220) / CHUNK);
    for (const [k, obj] of this.chunks) {
      if (k < first || k > last) {
        this.group.remove(obj);
        disposeObject(obj);
        this.chunks.delete(k);
      }
    }
    for (let k = Math.max(-1, first); k <= last; k++) {
      if (!this.chunks.has(k)) {
        const c = this.buildChunk(k);
        this.chunks.set(k, c);
        this.group.add(c);
      }
    }
    for (const s of this.seaPlanes) s.position.y = -0.04 + Math.sin(time * 1.5) * 0.03;
    if (!particles || !weather) return;
    // weather
    this.weatherTimer += dt;
    if (this.world.weather === 'snow' && this.weatherTimer > 0.05) {
      this.weatherTimer = 0;
      particles.emit('snow', (Math.random() - 0.5) * 40, 6, fz - 10 - Math.random() * 50, { count: 2 });
    } else if (this.world.weather === 'sparkle' && this.weatherTimer > 0.15) {
      this.weatherTimer = 0;
      const side = Math.random() > 0.5 ? 1 : -1;
      particles.emit('sparkle', side * (20 + Math.random() * 30), 0.2, fz - 10 - Math.random() * 60, { count: 1, color: 0xffffff });
    }
    this.smokeTimer += dt;
    if (this.volcanoTops.length && this.smokeTimer > 0.35) {
      this.smokeTimer = 0;
      const t = this.volcanoTops[Math.floor(Math.random() * this.volcanoTops.length)];
      particles.emit('smoke', t.x, t.y, fz + t.z, { count: 1, scale: 3 });
    }
  }

  dispose() {
    disposeObject(this.group);
    this.chunks.clear();
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

