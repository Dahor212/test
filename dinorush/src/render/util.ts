import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Cached flat-shaded Lambert materials keyed by colour + options. */
const matCache = new Map<string, THREE.Material>();

export function mat(color: number, opts: { flat?: boolean; emissive?: number; transparent?: boolean; opacity?: number; side?: THREE.Side } = {}): THREE.MeshLambertMaterial {
  const key = `${color}|${opts.flat ?? true}|${opts.emissive ?? 0}|${opts.opacity ?? 1}|${opts.side ?? 0}`;
  let m = matCache.get(key) as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color,
      flatShading: opts.flat ?? true,
      emissive: opts.emissive ?? 0x000000,
      transparent: opts.transparent ?? (opts.opacity !== undefined && opts.opacity < 1),
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
    });
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return m;
}

export function basicMat(color: number, opts: { transparent?: boolean; opacity?: number; depthWrite?: boolean } = {}): THREE.MeshBasicMaterial {
  const key = `basic|${color}|${opts.opacity ?? 1}|${opts.depthWrite ?? true}`;
  let m = matCache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: opts.transparent ?? (opts.opacity !== undefined && opts.opacity < 1),
      opacity: opts.opacity ?? 1,
      depthWrite: opts.depthWrite ?? true,
    });
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return m;
}

/** Shared unit geometries – scaled per mesh. */
const geoCache = new Map<string, THREE.BufferGeometry>();
function cachedGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g;
}

export const GEO = {
  sphere: (detail = 1) => cachedGeo(`sphere${detail}`, () => new THREE.IcosahedronGeometry(1, detail)),
  smoothSphere: () => cachedGeo('ssphere', () => new THREE.SphereGeometry(1, 16, 12)),
  cone: (seg = 6) => cachedGeo(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg).translate(0, 0.5, 0)),
  cylinder: (seg = 8) => cachedGeo(`cyl${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg).translate(0, 0.5, 0)),
  box: () => cachedGeo('box', () => new THREE.BoxGeometry(1, 1, 1)),
  dodeca: () => cachedGeo('dodeca', () => new THREE.DodecahedronGeometry(1, 0)),
  ico: () => cachedGeo('ico', () => new THREE.IcosahedronGeometry(1, 0)),
  torus: () => cachedGeo('torus', () => new THREE.TorusGeometry(1, 0.25, 6, 16)),
  ring: () => cachedGeo('ring', () => new THREE.RingGeometry(0.82, 1, 32).rotateX(-Math.PI / 2)),
  disc: () => cachedGeo('disc', () => new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2)),
  /** Half ring (ribs, arches). */
  arc: () => cachedGeo('arc', () => new THREE.TorusGeometry(1, 0.09, 4, 10, Math.PI)),
  /** Low-poly grass blade. */
  blade: () => cachedGeo('blade', () => new THREE.ConeGeometry(1, 1, 3).translate(0, 0.5, 0)),
};

export function mesh(geo: THREE.BufferGeometry, material: THREE.Material, pos?: [number, number, number], scale?: [number, number, number] | number, rot?: [number, number, number]): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (scale !== undefined) {
    if (typeof scale === 'number') m.scale.setScalar(scale);
    else m.scale.set(scale[0], scale[1], scale[2]);
  }
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  return m;
}

export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}

/**
 * Accumulates coloured primitives into one merged, vertex-coloured geometry
 * (one draw call per chunk of scenery).
 */
export class GeoMerger {
  private parts: THREE.BufferGeometry[] = [];
  private tmp = new THREE.Object3D();

  add(geo: THREE.BufferGeometry, color: number, pos: [number, number, number], scale: [number, number, number] | number = 1, rot: [number, number, number] = [0, 0, 0]) {
    const t = this.tmp;
    t.position.set(pos[0], pos[1], pos[2]);
    if (typeof scale === 'number') t.scale.setScalar(scale);
    else t.scale.set(scale[0], scale[1], scale[2]);
    t.rotation.set(rot[0], rot[1], rot[2]);
    t.updateMatrix();
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()) as THREE.BufferGeometry;
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    g.applyMatrix4(t.matrix);
    const c = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(g);
  }

  /** Add a geometry with an explicit transform matrix and colour. */
  addMatrix(geo: THREE.BufferGeometry, color: THREE.Color, matrix: THREE.Matrix4) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()) as THREE.BufferGeometry;
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    g.applyMatrix4(matrix);
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(g);
  }

  get empty() {
    return this.parts.length === 0;
  }

  build(material: THREE.Material): THREE.Mesh | null {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (!merged) return null;
    merged.computeBoundingSphere();
    return new THREE.Mesh(merged, material);
  }
}

const vcMats = new Map<number, THREE.MeshLambertMaterial>();
/** Shared vertex-coloured flat material (optionally with emissive glow). */
export function vertexColorMat(emissive = 0): THREE.MeshLambertMaterial {
  let m = vcMats.get(emissive);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive });
    m.userData.shared = true;
    vcMats.set(emissive, m);
  }
  return m;
}

/**
 * Let only the big parts of a model cast shadows: eyes, claws, teeth and
 * small spikes do not change the shadow but each would cost a draw call.
 */
export function castBigShadows(root: THREE.Object3D, minRadius = 0.3) {
  root.updateMatrixWorld(true);
  const s = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    m.getWorldScale(s);
    m.castShadow = (m.geometry.boundingSphere?.radius ?? 0) * Math.max(s.x, s.y, s.z) >= minRadius;
  });
}

/** Dispose non-shared geometries/materials/textures of a subtree. */
export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mt of mats) {
      if (mt.userData.shared) continue;
      const anyMt = mt as THREE.MeshBasicMaterial;
      if (anyMt.map && !anyMt.map.userData.shared) anyMt.map.dispose();
      mt.dispose();
    }
  });
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function clamp01(t: number) {
  return Math.max(0, Math.min(1, t));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Deterministic pseudo random from integer seed (for scenery). */
export function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Smooth 2D value noise in [0, 1]. */
export function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const h = (i: number, j: number) => hash01(i * 157.31 + j * 311.71 + (i * j) % 97);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * u;
  const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * u;
  return a + (b - a) * v;
}
