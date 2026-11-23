import * as THREE from 'three';
import type { SceneryId, WorldDefinition } from '../types';
import type { Particles } from './particles';
import { GeoMerger, GEO, hash01 } from './util';

/** Direction from the action towards the sun (also drives the shadows). */
export const SUN_OFFSET = new THREE.Vector3(-26, 34, 20);
const SUN_DIR = SUN_OFFSET.clone().normalize();

// ---------------------------------------------------------------------------
// Sky dome: gradient with a horizon haze band and a glowing sun
// ---------------------------------------------------------------------------

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec3 uHorizon;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uSunGlow;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uBottom, smoothstep(-0.02, 0.16, h));
  col = mix(col, uTop, smoothstep(0.1, 0.75, h));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSun * (pow(s, 6.0) * 0.22 + pow(s, 40.0) * 0.35) * uSunGlow;
  col = mix(col, vec3(1.0, 0.99, 0.94), smoothstep(0.9975, 0.999, s));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function skyDome(top: number, bottom: number, horizon: number, sun: number, glow: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uTop: { value: new THREE.Color(top) },
      uBottom: { value: new THREE.Color(bottom) },
      uHorizon: { value: new THREE.Color(horizon) },
      uSun: { value: new THREE.Color(sun) },
      uSunDir: { value: SUN_DIR.clone() },
      uSunGlow: { value: glow },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

// ---------------------------------------------------------------------------
// Clouds: soft painted billboards, merged into one draw call
// ---------------------------------------------------------------------------

let cloudTex: THREE.Texture | null = null;
/** 2×2 atlas of fluffy clouds with a slightly shaded underside. */
function cloudTexture(): THREE.Texture {
  if (cloudTex) return cloudTex;
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * 256;
    const oy = Math.floor(k / 2) * 128;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, 256, 128);
    ctx.clip();
    const puffs = 7 + k * 2;
    for (let i = 0; i < puffs; i++) {
      const t = (i + 0.5) / puffs;
      const x = ox + 30 + t * 196 + (hash01(k * 31 + i) - 0.5) * 20;
      const mid = 1 - Math.abs(t - 0.5) * 2;
      const r = 18 + mid * 26 + hash01(k * 7 + i * 3) * 12;
      const y = oy + 96 - r * 0.55 - mid * 10;
      const g = ctx.createRadialGradient(x, y - r * 0.2, r * 0.1, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.6, 'rgba(250,252,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // soft grey-blue belly
    ctx.globalCompositeOperation = 'source-atop';
    const sh = ctx.createLinearGradient(0, oy + 50, 0, oy + 110);
    sh.addColorStop(0, 'rgba(160,180,205,0)');
    sh.addColorStop(1, 'rgba(150,170,200,0.55)');
    ctx.fillStyle = sh;
    ctx.fillRect(ox, oy, 256, 128);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.shared = true;
  cloudTex = tex;
  return tex;
}

function cloudLayer(count: number, tint: number, seed: number, opacity: number): THREE.Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + hash01(seed + i * 5) * 0.5;
    const r = 210 + hash01(seed + i * 11) * 130;
    const y = 64 + hash01(seed + i * 3) * 66;
    const w = 55 + hash01(seed + i * 9) * 65;
    const h = w * 0.5;
    const cx = Math.sin(a) * r;
    const cz = -Math.cos(a) * r;
    // the quad faces the viewer at the centre
    const tx = Math.cos(a);
    const tz = Math.sin(a);
    const v0 = pos.length / 3;
    for (const [sx, sy] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) pos.push(cx + tx * sx * w * 0.5, y + sy * h - h * 0.35, cz + tz * sx * w * 0.5);
    const k = Math.floor(hash01(seed + i * 13) * 4);
    const u0 = (k % 2) * 0.5;
    const vTop = 1 - Math.floor(k / 2) * 0.5;
    uv.push(u0, vTop - 0.5, u0 + 0.5, vTop - 0.5, u0 + 0.5, vTop, u0, vTop);
    idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: cloudTexture(), color: tint, transparent: true, opacity, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  m.renderOrder = -8;
  m.frustumCulled = false;
  return m;
}

// ---------------------------------------------------------------------------
// Mountain ridges: rings of silhouettes fading into the haze
// ---------------------------------------------------------------------------

interface Ridge {
  r: number;
  base: number;
  amp: number;
  /** 0 = rounded hills, 1 = sharp peaks. */
  sharp: number;
  color: number;
  /** Lighter colour near the summits. */
  top?: number;
  /** Snow above this height. */
  snow?: number;
  /** Flat-topped mesas with rock strata. */
  mesa?: boolean;
  /** How much the haze swallows this layer (0..1). */
  haze: number;
  seed: number;
}

function ridgeHeight(a: number, L: Ridge): number {
  const s = L.seed;
  let smoothN = 0.5 + Math.sin(a * 3 + s) * 0.22 + Math.sin(a * 7 + s * 2.3) * 0.16 + Math.sin(a * 17 + s * 4.1) * 0.08;
  let sharpN = 0;
  let w = 0.5;
  for (const f of [5, 11, 23, 47]) {
    sharpN += (1 - Math.abs(Math.sin(a * f * 0.5 + s * f))) * w;
    w *= 0.5;
  }
  sharpN = sharpN / 0.94;
  if (L.mesa) {
    const t = smoothN;
    const step = (lo: number, hi: number, x: number) => {
      const k = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
      return k * k * (3 - 2 * k);
    };
    const n = 0.25 + step(0.5, 0.53, t) * 0.45 + step(0.66, 0.68, t) * 0.3;
    return L.base + L.amp * n + Math.sin(a * 90 + s) * 0.4;
  }
  smoothN = Math.max(0, Math.min(1, smoothN));
  const n = smoothN * (1 - L.sharp) + (smoothN * 0.45 + sharpN * 0.65) * L.sharp;
  return L.base + L.amp * n;
}

function ridgeMesh(L: Ridge, haze: THREE.Color, sunAz: number): THREE.Mesh {
  const N = L.mesa ? 420 : 260;
  const rows = L.mesa ? [0, 0.3, 0.46, 0.62, 0.78, 0.9, 1] : [0, 0.55, 0.82, 1];
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const base = new THREE.Color(L.color);
  const top = new THREE.Color(L.top ?? L.color);
  const snow = new THREE.Color(0xffffff);
  const c = new THREE.Color();
  const stripe = new THREE.Color(L.color).offsetHSL(0.01, 0.05, 0.08);
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const h = ridgeHeight(a, L);
    const slope = ridgeHeight(a + 0.01, L) - ridgeHeight(a - 0.01, L);
    // slopes turned to the sun are a little brighter
    const tangentDot = Math.cos(a - sunAz + Math.PI / 2);
    const light = 1 + Math.max(-1, Math.min(1, -Math.sign(slope) * tangentDot)) * Math.min(1, Math.abs(slope) * 0.8) * 0.16;
    const x = Math.sin(a) * L.r;
    const z = -Math.cos(a) * L.r;
    rows.forEach((f, ri) => {
      const y = ri === 0 ? -14 : h * f;
      pos.push(x, y, z);
      c.copy(base).lerp(top, f);
      if (L.mesa && ri > 0 && ri < rows.length - 1 && ri % 2 === 0) c.copy(stripe);
      if (L.snow !== undefined && y > L.snow) c.lerp(snow, Math.min(1, (y - L.snow) / 8 + 0.5));
      c.multiplyScalar(light);
      // haze: strongest at the foot of the mountains
      c.lerp(haze, Math.min(1, L.haze + (1 - f) * 0.35));
      col.push(c.r, c.g, c.b);
    });
  }
  const R = rows.length;
  for (let i = 0; i < N; i++) {
    for (let r = 0; r < R - 1; r++) {
      const a = i * R + r;
      const b = (i + 1) * R + r;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  m.renderOrder = -6;
  m.frustumCulled = false;
  return m;
}

// ---------------------------------------------------------------------------
// Per-scenery backdrop recipes
// ---------------------------------------------------------------------------

interface BackdropSpec {
  ridges: Omit<Ridge, 'seed'>[];
  clouds: number;
  cloudTint: number;
  cloudOpacity: number;
  sunGlow: number;
}

const BACKDROPS: Record<SceneryId, BackdropSpec> = {
  jungle: {
    ridges: [
      { r: 400, base: 40, amp: 90, sharp: 0.55, color: 0x5d8fb0, top: 0x8db6cf, haze: 0.45 },
      { r: 320, base: 18, amp: 46, sharp: 0.2, color: 0x2f7d4a, top: 0x4c9a5a, haze: 0.3 },
      { r: 250, base: 6, amp: 22, sharp: 0, color: 0x23703d, top: 0x3f8f45, haze: 0.12 },
    ],
    clouds: 16,
    cloudTint: 0xffffff,
    cloudOpacity: 0.95,
    sunGlow: 1,
  },
  swamp: {
    ridges: [
      { r: 380, base: 18, amp: 40, sharp: 0.1, color: 0x7d9488, top: 0x93a89a, haze: 0.55 },
      { r: 270, base: 6, amp: 16, sharp: 0, color: 0x4f6e4a, top: 0x5d7d54, haze: 0.35 },
    ],
    clouds: 20,
    cloudTint: 0xdfe6df,
    cloudOpacity: 0.85,
    sunGlow: 0.45,
  },
  canyon: {
    ridges: [
      { r: 400, base: 22, amp: 60, sharp: 0, color: 0xc77b52, top: 0xe0a272, haze: 0.42, mesa: true },
      { r: 300, base: 10, amp: 46, sharp: 0, color: 0xb5562f, top: 0xd9803f, haze: 0.2, mesa: true },
      { r: 235, base: 4, amp: 18, sharp: 0.1, color: 0xc9773d, top: 0xe39b55, haze: 0.08 },
    ],
    clouds: 9,
    cloudTint: 0xfff5e6,
    cloudOpacity: 0.9,
    sunGlow: 1.15,
  },
  volcano: {
    ridges: [
      { r: 400, base: 30, amp: 80, sharp: 0.85, color: 0x5a3a3a, top: 0x6e4644, haze: 0.4 },
      { r: 300, base: 14, amp: 48, sharp: 0.75, color: 0x3a2726, top: 0x4b3230, haze: 0.22 },
      { r: 235, base: 4, amp: 18, sharp: 0.5, color: 0x2e2220, top: 0x3d2c29, haze: 0.1 },
    ],
    clouds: 14,
    cloudTint: 0x8e7470,
    cloudOpacity: 0.9,
    sunGlow: 0.9,
  },
  ice: {
    ridges: [
      { r: 400, base: 44, amp: 110, sharp: 0.9, color: 0x5f86b0, top: 0x9fc0e0, haze: 0.26, snow: 118 },
      { r: 310, base: 20, amp: 60, sharp: 0.8, color: 0x6b93bb, top: 0xaecbe6, haze: 0.14, snow: 68 },
      { r: 240, base: 6, amp: 20, sharp: 0.3, color: 0xcfe2f3, top: 0xffffff, haze: 0.05 },
    ],
    clouds: 8,
    cloudTint: 0xffffff,
    cloudOpacity: 0.85,
    sunGlow: 1,
  },
  islands: {
    ridges: [
      { r: 390, base: -6, amp: 30, sharp: 0.15, color: 0x5fae80, top: 0x7cc493, haze: 0.5 },
      { r: 300, base: -10, amp: 24, sharp: 0, color: 0x3f9a55, top: 0x5cbf5a, haze: 0.3 },
    ],
    clouds: 14,
    cloudTint: 0xffffff,
    cloudOpacity: 0.95,
    sunGlow: 1.1,
  },
};

/** Sea-level islands sit lower; their ridges dip under the water often. */

let fallTex: THREE.CanvasTexture | null = null;
function waterfallTexture(): THREE.CanvasTexture {
  if (fallTex) return fallTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#bfe8ff';
  ctx.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 26; i++) {
    const x = hash01(i * 3) * 64;
    const y = hash01(i * 7) * 128;
    ctx.fillStyle = i % 3 ? 'rgba(255,255,255,0.8)' : 'rgba(120,200,240,0.6)';
    ctx.fillRect(x, y, 2 + hash01(i) * 4, 20 + hash01(i * 5) * 40);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.shared = true;
  fallTex = tex;
  return tex;
}

/**
 * Everything far away: sky, sun, clouds, rings of mountains and one big
 * landmark per landscape (volcano, waterfall, rock arch, ice spires…).
 * It moves with the camera, so it always sits on the horizon.
 */
export class Backdrop {
  readonly group = new THREE.Group();
  private sky: THREE.Mesh;
  private far = new THREE.Group();
  private clouds: THREE.Mesh | null = null;
  private fall: THREE.Texture | null = null;
  private smoke: THREE.Vector3[] = [];
  private smokeTimer = 0;
  private smokeColor: number[] = [];

  constructor(world: WorldDefinition, scenery: SceneryId, quality: 'low' | 'high') {
    const spec = BACKDROPS[scenery] ?? BACKDROPS.jungle;
    const haze = new THREE.Color(world.fog);
    this.sky = skyDome(world.sky.top, world.sky.bottom, world.fog, world.sun, spec.sunGlow);
    this.group.add(this.sky, this.far);
    const sunAz = Math.atan2(SUN_DIR.x, -SUN_DIR.z);
    spec.ridges.forEach((r, i) => this.far.add(ridgeMesh({ ...r, seed: i * 1.7 + scenery.length * 0.37 }, haze, sunAz)));
    const n = quality === 'high' ? spec.clouds : Math.ceil(spec.clouds * 0.6);
    this.clouds = cloudLayer(n, spec.cloudTint, scenery.length * 13, spec.cloudOpacity);
    this.group.add(this.clouds);
    this.landmark(scenery, haze);
  }

  private landmark(scenery: SceneryId, haze: THREE.Color) {
    const m = new GeoMerger();
    const glow = new GeoMerger();
    const tint = (c: number, k: number) => new THREE.Color(c).lerp(haze, k).getHex();
    const at = (az: number, r: number): [number, number] => [Math.sin(az) * r, -Math.cos(az) * r];
    if (scenery === 'volcano' || scenery === 'islands') {
      // the big volcano with a glowing crater and lava streams
      const big = scenery === 'volcano';
      const az = big ? 0.35 : -0.9;
      const r = big ? 280 : 330;
      const s = big ? 1 : 0.55;
      const [x, z] = at(az, r);
      const k = big ? 0.18 : 0.42;
      m.add(GEO.cone(9), tint(0x3b2624, k), [x, -10, z], [95 * s, 120 * s, 95 * s]);
      m.add(GEO.cone(9), tint(0x4a302c, k), [x, 60 * s, z], [42 * s, 52 * s, 42 * s]);
      if (!big) m.add(GEO.sphere(1), tint(0x3f9a55, k + 0.05), [x, -14, z], [120 * s, 28, 100 * s]);
      glow.add(GEO.cone(9), 0xff5a1a, [x, 96 * s, z], [17 * s, 14 * s, 17 * s]);
      if (big) {
        for (let i = 0; i < 5; i++) {
          const a = -1.1 + i * 0.5;
          const ox = Math.cos(az) * Math.sin(a) * 30;
          const oz = Math.sin(az) * Math.sin(a) * 30;
          glow.add(GEO.box(), i % 2 ? 0xff7a1a : 0xffa21a, [x + ox - Math.sin(az) * 26, 58, z + oz + Math.cos(az) * 26], [2.2, 70, 2.2], [0.35 * Math.cos(az), 0, -0.35 * Math.sin(a) + 0.1]);
        }
      }
      this.smoke.push(new THREE.Vector3(x, 110 * s, z));
      this.smokeColor = big ? [0x6d5a56, 0x8a7671, 0x4a3c3a] : [0xdedede, 0xf4f4f4];
    } else if (scenery === 'jungle') {
      // a tall cliff with a waterfall
      const az = -0.5;
      const [x, z] = at(az, 228);
      for (let i = 0; i < 5; i++) {
        const off = (i - 2) * 12 + (i === 2 ? 0 : Math.sign(i - 2) * 4);
        const h = (i === 2 ? 34 : 26) + hash01(i * 3) * 8;
        m.add(GEO.dodeca(), tint([0x8a8270, 0x7a7262, 0x948b77][i % 3], 0.35), [x + Math.cos(az) * off, h * 0.45 - 6, z + Math.sin(az) * off], [12, h * 0.55 + 6, 11], [0, i * 1.3, 0]);
        m.add(GEO.sphere(0), tint(i % 2 ? 0x3f9a45 : 0x2f8a3a, 0.35), [x + Math.cos(az) * off, h * 0.95, z + Math.sin(az) * off], [13, 5, 12]);
      }
      const tex = waterfallTexture();
      this.fall = tex;
      tex.repeat.set(1, 2.5);
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(10, 36), new THREE.MeshBasicMaterial({ map: tex, fog: false, transparent: true, opacity: 0.92, side: THREE.DoubleSide }));
      const [fx, fz] = at(az, 214);
      fall.position.set(fx, 16, fz);
      fall.rotation.y = -az;
      fall.renderOrder = -4;
      this.far.add(fall);
      const [mx, mz] = at(az, 212);
      glow.add(GEO.sphere(1), 0xeef9ff, [mx, -1, mz], [11, 5, 6]);
    } else if (scenery === 'canyon') {
      // a natural stone arch and lonely rock towers
      const [x, z] = at(0.6, 220);
      const arc = new THREE.TorusGeometry(26, 6, 6, 14, Math.PI);
      m.add(arc, tint(0xb8582f, 0.15), [x, 8, z], 1, [0, -0.6, 0]);
      m.add(GEO.box(), tint(0xa94e2a, 0.15), [x + Math.cos(0.6) * 26, -4, z + Math.sin(0.6) * 26], [12, 24, 12], [0, 0.6, 0]);
      m.add(GEO.box(), tint(0xa94e2a, 0.15), [x - Math.cos(0.6) * 26, -4, z - Math.sin(0.6) * 26], [12, 24, 12], [0, 0.6, 0]);
      for (let i = 0; i < 4; i++) {
        const [hx, hz] = at(-1.2 + i * 0.9, 200 + i * 12);
        for (let k = 0; k < 4; k++) m.add(GEO.cylinder(7), tint(k % 2 ? 0xc2683a : 0xa8532e, 0.18), [hx, k * 12 - 6, hz], [8 - k * 1.1, 12, 8 - k * 1.1]);
      }
      arc.dispose();
    } else if (scenery === 'ice') {
      // giant ice spires
      for (let i = 0; i < 6; i++) {
        const [x, z] = at(-0.3 + (i - 2.5) * 0.06, 220 + hash01(i) * 30);
        m.add(GEO.cone(5), i % 2 ? 0xbfe6ff : 0x9fd6ff, [x, -6, z], [10 + hash01(i * 7) * 6, 60 + hash01(i * 3) * 50, 10], [0, i, (hash01(i * 9) - 0.5) * 0.25]);
      }
    } else if (scenery === 'swamp') {
      // huge dead trees in the mist
      for (let i = 0; i < 7; i++) {
        const [x, z] = at(-2.6 + i * 0.85 + hash01(i) * 0.3, 190 + hash01(i * 5) * 40);
        const c = tint(0x3b3a33, 0.45);
        m.add(GEO.cylinder(5), c, [x, -4, z], [3, 50, 3], [0, 0, (hash01(i * 2) - 0.5) * 0.15]);
        m.add(GEO.cylinder(4), c, [x, 32, z], [1.4, 22, 1.4], [0, i, 0.9]);
        m.add(GEO.cylinder(4), c, [x, 26, z], [1.2, 18, 1.2], [0, i, -0.8]);
        m.add(GEO.sphere(0), tint(0x5d6e4f, 0.5), [x, 46, z], [14, 6, 14]);
      }
    }
    const a = m.build(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }));
    if (a) {
      a.renderOrder = -5;
      a.frustumCulled = false;
      this.far.add(a);
    }
    const g = glow.build(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    if (g) {
      g.renderOrder = -5;
      g.frustumCulled = false;
      this.far.add(g);
    }
  }

  update(camera: THREE.Camera, dt: number, time: number, particles: Particles | null) {
    this.sky.position.copy(camera.position);
    this.far.position.set(camera.position.x, 0, camera.position.z);
    if (this.clouds) {
      this.clouds.position.set(camera.position.x, 0, camera.position.z);
      this.clouds.rotation.y = time * 0.004;
    }
    if (this.fall) this.fall.offset.y = time * 0.9;
    this.smokeTimer += dt;
    if (particles && this.smoke.length && this.smokeTimer > 0.25) {
      this.smokeTimer = 0;
      // particles live in the world: put the plume between camera and volcano
      const t = this.smoke[Math.floor(Math.random() * this.smoke.length)];
      particles.emit('smoke', camera.position.x + t.x * 0.5, t.y * 0.5, camera.position.z + t.z * 0.5, { count: 1, scale: 4.5, color: this.smokeColor });
    }
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mt = m.material as THREE.Material;
      if (!mt.userData.shared) mt.dispose();
    });
  }
}
