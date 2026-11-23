import * as THREE from 'three';

/**
 * Procedural creature toolkit: lofted organic bodies (one smooth surface
 * from snout to tail tip), simple skinning along the spine, merged rigid
 * parts per joint and a procedural scale normal map. No external assets.
 */

export interface BodyKey {
  /** Position along the body (forward = -z). */
  z: number;
  /** Height of the body centre line. */
  y: number;
  /** Half width. */
  w: number;
  /** Half height. */
  h: number;
}

export type ColorFn = (t: number, sinA: number, cosA: number, s: number) => THREE.Color;

/** Uniform Catmull–Rom interpolation of scalars (matches CatmullRomCurve3.getPoint). */
export function crScalar(vals: number[], t: number): number {
  const n = vals.length - 1;
  const x = Math.max(0, Math.min(1, t)) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const f = x - i;
  const p0 = vals[Math.max(0, i - 1)];
  const p1 = vals[i];
  const p2 = vals[i + 1];
  const p3 = vals[Math.min(n, i + 2)];
  return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
}

export interface Loft {
  geometry: THREE.BufferGeometry;
  ringT: number[];
  /** Centre line point at key index (rest pose). */
  keyPoint(k: number): THREE.Vector3;
  /** Surface point and outward normal at parameter t and angle (π/2 = top). */
  surface(t: number, angle: number): { p: THREE.Vector3; n: THREE.Vector3 };
  tOfKey(k: number): number;
}

export interface LoftOptions {
  rings?: number;
  radial?: number;
  /** 2 = ellipse, larger = boxier. */
  squareness?: number;
  /** Multiplier for the lower half (flatter belly). */
  bellyFlat?: number;
  color: ColorFn;
  /** Scale-texture repeats. */
  uvU?: number;
  uvV?: number;
}

function superPow(v: number, e: number) {
  return Math.sign(v) * Math.pow(Math.abs(v), e);
}

/** Smooth tube along keys lying in the YZ plane (x = 0, symmetric). */
export function loftBody(keys: BodyKey[], opts: LoftOptions): Loft {
  const pts = keys.map((k) => new THREE.Vector3(0, k.y, k.z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  const ws = keys.map((k) => k.w);
  const hs = keys.map((k) => k.h);
  const R = opts.rings ?? 64;
  const M = opts.radial ?? 16;
  const e = 2 / (opts.squareness ?? 2);
  const belly = opts.bellyFlat ?? 0.9;
  const uvU = opts.uvU ?? 10;
  const uvV = opts.uvV ?? 11;
  const pos: number[] = [];
  const uvs: number[] = [];
  const cols: number[] = [];
  const idx: number[] = [];
  const ringT: number[] = [];
  const X = new THREE.Vector3(1, 0, 0);
  const U = new THREE.Vector3();
  const C = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const T = new THREE.Vector3();
  let s = 0;

  const frameAt = (t: number) => {
    curve.getPoint(t, C);
    curve.getTangent(t, T).normalize();
    U.crossVectors(T, X).normalize();
    return { w: Math.max(0.004, crScalar(ws, t)), h: Math.max(0.004, crScalar(hs, t)) };
  };

  for (let i = 0; i < R; i++) {
    const t = i / (R - 1);
    const { w, h } = frameAt(t);
    if (i > 0) s += C.distanceTo(prev);
    prev.copy(C);
    ringT.push(t);
    for (let j = 0; j <= M; j++) {
      const a = -Math.PI / 2 + (j / M) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const ex = superPow(ca, e);
      let ey = superPow(sa, e);
      if (ey < 0) ey *= belly;
      pos.push(C.x + X.x * w * ex + U.x * h * ey, C.y + X.y * w * ex + U.y * h * ey, C.z + X.z * w * ex + U.z * h * ey);
      uvs.push((j / M) * uvU, s * uvV);
      const c = opts.color(t, sa, ca, s);
      cols.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < R - 1; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j;
      const b = a + M + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // weld seam normals (j = 0 and j = M are the same point)
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < R; i++) {
    const a = i * (M + 1);
    const b = a + M;
    const nx = n.getX(a) + n.getX(b);
    const ny = n.getY(a) + n.getY(b);
    const nz = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    n.setXYZ(a, nx / l, ny / l, nz / l);
    n.setXYZ(b, nx / l, ny / l, nz / l);
  }

  return {
    geometry: g,
    ringT,
    keyPoint: (k) => pts[k].clone(),
    tOfKey: (k) => k / (keys.length - 1),
    surface: (t, angle) => {
      const { w, h } = frameAt(t);
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const ex = superPow(ca, e);
      let ey = superPow(sa, e);
      if (ey < 0) ey *= belly;
      const p = C.clone().addScaledVector(X, w * ex).addScaledVector(U, h * ey);
      const nrm = X.clone()
        .multiplyScalar(ca / w)
        .addScaledVector(U, sa / h)
        .normalize();
      return { p, n: nrm };
    },
  };
}

/** Skin weights from ring parameter t → two nearest bones (sorted by t). */
export function skinByRings(loft: Loft, radial: number, boneT: number[]) {
  const g = loft.geometry;
  const count = g.getAttribute('position').count;
  const si = new Uint16Array(count * 4);
  const sw = new Float32Array(count * 4);
  const per = radial + 1;
  loft.ringT.forEach((t, ring) => {
    let i0 = 0;
    let i1 = 0;
    let w = 0;
    if (t <= boneT[0]) {
      i0 = i1 = 0;
    } else if (t >= boneT[boneT.length - 1]) {
      i0 = i1 = boneT.length - 1;
    } else {
      for (let k = 0; k < boneT.length - 1; k++) {
        if (t >= boneT[k] && t <= boneT[k + 1]) {
          i0 = k;
          i1 = k + 1;
          w = (t - boneT[k]) / (boneT[k + 1] - boneT[k]);
          // smoothstep for nicer bends
          w = w * w * (3 - 2 * w);
          break;
        }
      }
    }
    for (let j = 0; j < per; j++) {
      const v = ring * per + j;
      si[v * 4] = i0;
      si[v * 4 + 1] = i1;
      sw[v * 4] = 1 - w;
      sw[v * 4 + 1] = w;
    }
  });
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
}

// ---------------------------------------------------------------------------
// Materials and the scale normal map
// ---------------------------------------------------------------------------

let scaleNormal: THREE.Texture | null = null;

/** Procedural tiling normal map of reptile scales. */
export function scaleNormalMap(): THREE.Texture {
  if (scaleNormal) return scaleNormal;
  const S = 128;
  const height = new Float32Array(S * S);
  const rows = 8;
  const cell = S / rows;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let best = 9;
      for (let ry = -1; ry <= rows; ry++) {
        const off = ry % 2 ? cell / 2 : 0;
        const cy = ry * cell + cell / 2;
        for (let rx = -1; rx <= rows; rx++) {
          const cx = rx * cell + cell / 2 + off;
          const dx = (((x - cx) % S) + S + S / 2) % S - S / 2;
          const dy = (((y - cy) % S) + S + S / 2) % S - S / 2;
          const d = Math.hypot(dx, dy * 1.1) / (cell * 0.62);
          if (d < best) best = d;
        }
      }
      height[y * S + x] = Math.max(0, 1 - best * best);
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const h = (xx: number, yy: number) => height[((yy + S) % S) * S + ((xx + S) % S)];
      const dx = (h(x + 1, y) - h(x - 1, y)) * 2.2;
      const dy = (h(x, y + 1) - h(x, y - 1)) * 2.2;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  scaleNormal = new THREE.CanvasTexture(c);
  scaleNormal.wrapS = scaleNormal.wrapT = THREE.RepeatWrapping;
  scaleNormal.userData.shared = true;
  return scaleNormal;
}

const matCache = new Map<string, THREE.Material>();

export type Channel = 'skin' | 'gloss' | 'membrane';

/** Shared creature materials (vertex coloured, physically based). */
export function creatureMaterial(channel: Channel, emissive = 0): THREE.MeshStandardMaterial {
  const key = `${channel}|${emissive}`;
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    const hasDoc = typeof document !== 'undefined';
    m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: channel === 'gloss' ? 0.2 : 0.68,
      metalness: 0,
      emissive,
      side: channel === 'membrane' ? THREE.DoubleSide : THREE.FrontSide,
      normalMap: channel !== 'gloss' && hasDoc ? scaleNormalMap() : null,
      normalScale: new THREE.Vector2(0.4, 0.4),
    });
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Rigid parts merged per joint
// ---------------------------------------------------------------------------

export type PartColor = THREE.ColorRepresentation | ((p: THREE.Vector3) => THREE.Color);

const tmpObj = new THREE.Object3D();

function prepare(geo: THREE.BufferGeometry, color: PartColor, matrix: THREE.Matrix4, uvScale?: [number, number]): THREE.BufferGeometry {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone()) as THREE.BufferGeometry;
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  }
  if (!g.getAttribute('uv')) {
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (uvScale) {
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1]);
  }
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const cols = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  const fixed = typeof color === 'function' ? null : new THREE.Color(color);
  for (let i = 0; i < p.count; i++) {
    const c = fixed ?? (color as (p: THREE.Vector3) => THREE.Color)(v.fromBufferAttribute(p, i));
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.applyMatrix4(matrix);
  return g;
}

/**
 * Collects rigid parts for one joint and merges them into one mesh per
 * material channel.
 */
export class Parts {
  private lists: Record<Channel, THREE.BufferGeometry[]> = { skin: [], gloss: [], membrane: [] };

  add(
    geo: THREE.BufferGeometry,
    color: PartColor,
    pos: [number, number, number] = [0, 0, 0],
    rot: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] | number = 1,
    channel: Channel = 'skin',
    uvScale?: [number, number],
  ): this {
    tmpObj.position.set(...pos);
    tmpObj.rotation.set(rot[0], rot[1], rot[2]);
    if (typeof scale === 'number') tmpObj.scale.setScalar(scale);
    else tmpObj.scale.set(...scale);
    tmpObj.updateMatrix();
    this.lists[channel].push(prepare(geo, color, tmpObj.matrix, uvScale));
    return this;
  }

  addMatrix(geo: THREE.BufferGeometry, color: PartColor, m: THREE.Matrix4, channel: Channel = 'skin', uvScale?: [number, number]): this {
    this.lists[channel].push(prepare(geo, color, m, uvScale));
    return this;
  }

  /** Adds merged meshes to `target`. */
  build(target: THREE.Object3D, emissive = 0, skinOverride?: THREE.Material) {
    for (const ch of ['skin', 'gloss', 'membrane'] as Channel[]) {
      const list = this.lists[ch];
      if (!list.length) continue;
      const merged = mergeList(list);
      if (!merged) continue;
      const mat = ch === 'skin' && skinOverride ? skinOverride : creatureMaterial(ch, ch === 'gloss' ? 0 : emissive);
      const mesh = new THREE.Mesh(merged, mat);
      target.add(mesh);
    }
    this.lists = { skin: [], gloss: [], membrane: [] };
  }
}

function mergeList(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  let count = 0;
  for (const g of list) count += g.getAttribute('position').count;
  const out = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const col = new Float32Array(count * 3);
  let o = 0;
  for (const g of list) {
    const n = g.getAttribute('position').count;
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    uv.set(g.getAttribute('uv').array as Float32Array, o * 2);
    col.set(g.getAttribute('color').array as Float32Array, o * 3);
    o += n;
    g.dispose();
  }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export const PG = {
  sphere: (w = 14, h = 10) => cached(`s${w}x${h}`, () => new THREE.SphereGeometry(1, w, h)),
  /** Cone along +Y with the base at origin. */
  cone: (seg = 8) => cached(`c${seg}`, () => new THREE.ConeGeometry(1, 1, seg).translate(0, 0.5, 0)),
  cyl: (seg = 10) => cached(`y${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg).translate(0, 0.5, 0)),
};

/**
 * Limb segment with rounded (capsule) ends hanging from the origin along -Y.
 * Absolute size in metres, so joints overlap as smooth "knees".
 */
export function limbGeometry(L: number, rTop: number, rBottom: number, bulge = 0, bulgeAt = 0.3): THREE.BufferGeometry {
  const key = `limb${L.toFixed(3)}|${rTop.toFixed(3)}|${rBottom.toFixed(3)}|${bulge.toFixed(3)}|${bulgeAt}`;
  return cached(key, () => {
    const pts: THREE.Vector2[] = [];
    const capSteps = 5;
    for (let i = 0; i <= capSteps; i++) {
      const a = (Math.PI / 2) * (1 - i / capSteps);
      pts.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * rTop), Math.sin(a) * rTop));
    }
    const N = 10;
    for (let i = 1; i < N; i++) {
      const t = i / N;
      const r = rTop + (rBottom - rTop) * t + bulge * Math.exp(-Math.pow((t - bulgeAt) / 0.25, 2));
      pts.push(new THREE.Vector2(r, -t * L));
    }
    for (let i = 0; i <= capSteps; i++) {
      const a = (Math.PI / 2) * (i / capSteps);
      pts.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * rBottom), -L - Math.sin(a) * rBottom));
    }
    return new THREE.LatheGeometry(pts, 16);
  });
}

/** Curved horn / claw: tapered tube growing along +Y and bending toward -Z. */
export function hornGeometry(length: number, radius: number, curve: number, seg = 8): THREE.BufferGeometry {
  return cached(`horn${length}|${radius}|${curve}|${seg}`, () => {
    const N = 6;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts.push(new THREE.Vector3(0, t * length, -curve * t * t * length));
    }
    const path = new THREE.CatmullRomCurve3(pts);
    const TS = 8;
    const geo = new THREE.TubeGeometry(path, TS, 1, seg, false);
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const tmp = new THREE.Vector3();
    const per = seg + 1;
    for (let i = 0; i < p.count; i++) {
      const t = Math.floor(i / per) / TS;
      const c = path.getPoint(t);
      const r = Math.max(0.004, radius * (1 - t * 0.96));
      tmp.fromBufferAttribute(p, i).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    geo.computeVertexNormals();
    return geo;
  });
}

/**
 * Fan-shaped sheet in the XY plane (frills): radius(a) gives the outline for
 * angles a0..a1; edges curve back by `dome`. Use with the 'membrane' channel.
 */
export function fanGeometry(radius: (a: number) => number, a0: number, a1: number, rings = 8, segs = 28, dome = 0.1): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const rho = 0.08 + (0.92 * i) / rings;
    for (let j = 0; j <= segs; j++) {
      const a = a0 + ((a1 - a0) * j) / segs;
      const r = radius(a) * rho;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      pos.push(x, y, dome * rho * rho);
      uv.push(x * 9, y * 9);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j;
      const b = a + segs + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Sheet in the XY plane between y = 0 and y = height(x) (sails). */
export function sheetGeometry(x0: number, x1: number, height: (x: number) => number, cols = 26, rows = 10, wave = 0.02): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= cols; i++) {
    const x = x0 + ((x1 - x0) * i) / cols;
    const h = Math.max(0.01, height(x));
    for (let j = 0; j <= rows; j++) {
      const y = (h * j) / rows;
      pos.push(x, y, Math.sin(x * 9) * wave * (j / rows));
      uv.push(x * 9, y * 9);
    }
  }
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j;
      const b = a + rows + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Thin extruded plate from a 2D shape (sails, frills, wings). */
export function plateGeometry(shape: THREE.Shape, depth: number, bevel = 0.015): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 18 }).translate(0, 0, -depth / 2);
}

export function shade(c: THREE.ColorRepresentation, k: number): THREE.Color {
  return new THREE.Color(c).multiplyScalar(k);
}

export function mix(a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t)));
}

export function smooth(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Cheap deterministic value noise for mottled skin. */
export function noise3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
