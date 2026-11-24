import * as THREE from 'three';
import { particleTexture } from './textures';

export type ParticleKind = 'dust' | 'splash' | 'sparkle' | 'debris' | 'confetti' | 'snow' | 'smoke' | 'coin' | 'mud' | 'ring' | 'firefly' | 'ember';

interface Spawn {
  color: number | number[];
  count: number;
  speed: [number, number];
  up: [number, number];
  size: [number, number];
  life: [number, number];
  gravity: number;
  drag: number;
  spread: number;
}

const PRESETS: Record<ParticleKind, Spawn> = {
  dust: { color: [0xd9b98c, 0xc9a77a, 0xe8d2b0], count: 2, speed: [0.3, 1.2], up: [0.4, 1.2], size: [0.5, 0.9], life: [0.5, 0.9], gravity: -0.5, drag: 1.5, spread: 0.6 },
  mud: { color: [0x6b4423, 0x5e3b1e, 0x8a5a30], count: 2, speed: [0.5, 1.5], up: [1, 2.5], size: [0.25, 0.45], life: [0.5, 0.8], gravity: 9, drag: 0.5, spread: 0.5 },
  splash: { color: [0xffffff, 0xbfefff, 0x7fdcff], count: 6, speed: [1, 3], up: [2, 5], size: [0.25, 0.5], life: [0.5, 0.9], gravity: 12, drag: 0.4, spread: 0.6 },
  sparkle: { color: [0xffffff, 0xffe066], count: 14, speed: [1.5, 4], up: [0.5, 3], size: [0.25, 0.5], life: [0.4, 0.8], gravity: 0, drag: 2.5, spread: 0.8 },
  debris: { color: [0x8c8076, 0xa59a8f, 0x6e655f], count: 10, speed: [2, 5], up: [3, 6], size: [0.3, 0.55], life: [0.6, 1.0], gravity: 14, drag: 0.3, spread: 0.6 },
  confetti: { color: [0xff4757, 0x2ed573, 0x1e90ff, 0xffa502, 0xa55eea, 0xffd32a], count: 30, speed: [2, 6], up: [4, 9], size: [0.25, 0.45], life: [1.2, 2.0], gravity: 6, drag: 1.2, spread: 1.5 },
  snow: { color: 0xffffff, count: 1, speed: [0, 0.4], up: [-1.6, -0.8], size: [0.18, 0.32], life: [3, 5], gravity: 0, drag: 0, spread: 30 },
  smoke: { color: [0x8a8a8a, 0x6b6b6b, 0xa0a0a0], count: 1, speed: [0.2, 0.6], up: [1.5, 2.5], size: [2.5, 4], life: [2.5, 4], gravity: -0.2, drag: 0.2, spread: 1.5 },
  coin: { color: [0xffd32a, 0xffe066, 0xffffff], count: 10, speed: [1, 3], up: [1, 3], size: [0.2, 0.4], life: [0.4, 0.7], gravity: 2, drag: 2, spread: 0.3 },
  ring: { color: 0xffffff, count: 18, speed: [5, 6], up: [0, 0.2], size: [0.35, 0.5], life: [0.35, 0.45], gravity: 0, drag: 3, spread: 0.2 },
  // night: slow glowing fireflies drifting near the trail
  firefly: { color: [0xeaff6a, 0xd4ff4a, 0xfff38a], count: 1, speed: [0.2, 0.6], up: [-0.2, 0.4], size: [0.22, 0.34], life: [2.5, 4.5], gravity: -0.05, drag: 0.2, spread: 0.3 },
  // volcano at night: sparks rising from the lava
  ember: { color: [0xff8a1a, 0xffb43a, 0xff5a1a], count: 1, speed: [0.2, 0.7], up: [1.2, 2.6], size: [0.16, 0.26], life: [1.6, 2.8], gravity: -0.3, drag: 0.4, spread: 0.6 },
};

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  float a = t.a * vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor * t.rgb, a);
}`;

/**
 * Pooled particle system rendered as a single THREE.Points draw call.
 */
export class Particles {
  readonly points: THREE.Points;
  private readonly max: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private baseSize: Float32Array;
  private alpha: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private cursor = 0;
  private geo: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  enabled = true;
  /** Multiplier for spawn counts (reduced motion / low quality). */
  density = 1;

  constructor(max = 1500) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uMap: { value: particleTexture() }, uScale: { value: 300 } },
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  /** Point size is given in metres; convert using viewport height and FOV. */
  setViewport(heightPx: number, fovDeg: number) {
    this.material.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  emit(kind: ParticleKind, x: number, y: number, z: number, opts: { count?: number; color?: number | number[]; dirZ?: number; scale?: number } = {}) {
    if (!this.enabled) return;
    const p = PRESETS[kind];
    const count = Math.max(1, Math.round((opts.count ?? p.count) * this.density));
    const colors = opts.color ?? p.color;
    const tmp = new THREE.Color();
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const r = (a: [number, number]) => a[0] + Math.random() * (a[1] - a[0]);
      const ang = kind === 'ring' ? (n / count) * Math.PI * 2 : Math.random() * Math.PI * 2;
      const sp = r(p.speed);
      this.pos[i * 3] = x + (kind === 'ring' ? 0 : (Math.random() - 0.5) * p.spread);
      this.pos[i * 3 + 1] = y + (kind === 'snow' ? Math.random() * 12 : 0);
      this.pos[i * 3 + 2] = z + (kind === 'ring' ? 0 : (Math.random() - 0.5) * p.spread);
      this.vel[i * 3] = Math.cos(ang) * sp;
      this.vel[i * 3 + 1] = r(p.up);
      this.vel[i * 3 + 2] = Math.sin(ang) * sp + (opts.dirZ ?? 0);
      const c = Array.isArray(colors) ? colors[Math.floor(Math.random() * colors.length)] : colors;
      tmp.set(c);
      this.col[i * 3] = tmp.r;
      this.col[i * 3 + 1] = tmp.g;
      this.col[i * 3 + 2] = tmp.b;
      const s = r(p.size) * (opts.scale ?? 1);
      this.baseSize[i] = s;
      this.size[i] = s;
      this.alpha[i] = 1;
      const l = r(p.life);
      this.life[i] = l;
      this.maxLife[i] = l;
      this.grav[i] = p.gravity;
      this.drag[i] = p.drag;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) {
          this.alpha[i] = 0;
          this.size[i] = 0;
        }
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 2] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < -0.6 && this.grav[i] > 0) {
        this.pos[i * 3 + 1] = -0.6;
        this.vel[i * 3 + 1] *= -0.3;
      }
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, t * 2.5);
      this.size[i] = this.baseSize[i] * (0.6 + 0.4 * t);
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.material.dispose();
  }
}
