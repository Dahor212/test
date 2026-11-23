import * as THREE from 'three';
import type { TerrainId, TrackDefinition, WorldId } from '../types';
import { trailTextureArray, TRAIL_LAYERS, type TrailLayer } from './terrainArt';
import { PATH_HALF, TerrainField, TrackPath, zoneFor } from './trackPath';
import { GeoMerger, GEO, hash01, vertexColorMat } from './util';

/**
 * One continuous natural trail shared by all three racers. Terrains blend
 * smoothly into each other (shore lines, worn paths through meadows) and
 * the edges fade softly into the landscape. Rendered with a texture array
 * so any two terrains can be mixed in a single draw call per chunk.
 */

export const TRAIL_CHUNK = 40;
/** Length of the blend between two terrains (metres). */
const BLEND = 3.2;

export function layerOf(terrain: TerrainId, world: WorldId): number {
  if (terrain === 'bridge') return TRAIL_LAYERS.indexOf(world === 'volcano' ? 'lava' : 'water');
  if (terrain === 'chasm') return TRAIL_LAYERS.indexOf('scree');
  return TRAIL_LAYERS.indexOf(terrain as TrailLayer);
}

const WATERY = new Set([TRAIL_LAYERS.indexOf('water'), TRAIL_LAYERS.indexOf('deepWater'), TRAIL_LAYERS.indexOf('lava')]);

/** Per-world tint for each layer (multiplies the painted texture). */
function worldTints(world: WorldId): THREE.Color[] {
  const t = TRAIL_LAYERS.map(() => new THREE.Color(1, 1, 1));
  const set = (l: TrailLayer, c: number) => t[TRAIL_LAYERS.indexOf(l)].set(c);
  if (world === 'volcano') {
    set('sand', 0x8a7d75);
    set('path', 0xb39a88);
    set('mud', 0xe8c4a4);
    set('grass', 0xa8a870);
  } else if (world === 'ice') {
    set('path', 0xd2cbc4);
    set('grass', 0xc8e0c4);
  } else if (world === 'islands') {
    set('grass', 0xe6ffd0);
    set('water', 0xc8fff4);
  }
  return t;
}

const OPACITY = TRAIL_LAYERS.map((l) => (l === 'water' ? 0.86 : l === 'deepWater' ? 0.92 : 1));

const materials = new Map<WorldId, THREE.MeshLambertMaterial>();

export function trailMaterial(world: WorldId): THREE.MeshLambertMaterial {
  let m = materials.get(world);
  if (m) return m;
  const uniforms = {
    uTerrain: { value: trailTextureArray() },
    uTint: { value: worldTints(world) },
    uOpacity: { value: OPACITY },
    uTime: { value: 0 },
  };
  m = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  m.userData.shared = true;
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 aLayer;
attribute float aBlend;
varying vec2 vLayer;
varying float vBlend;
varying vec2 vTrailUv;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
vLayer = aLayer;
vBlend = aBlend;
vTrailUv = uv;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray uTerrain;
uniform vec3 uTint[${TRAIL_LAYERS.length}];
uniform float uOpacity[${TRAIL_LAYERS.length}];
uniform float uTime;
varying vec2 vLayer;
varying float vBlend;
varying vec2 vTrailUv;
float trailLum;
float lavaGlow;
bool isWet(int l) { return l == 2 || l == 3 || l == 11; }
vec2 flowUv(int l) {
  if (l == 2) return vec2(0.0, -uTime * 0.12);
  if (l == 3) return vec2(0.0, -uTime * 0.07);
  if (l == 11) return vec2(uTime * 0.01, -uTime * 0.02);
  return vec2(0.0);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `int la = int(floor(vLayer.x + 0.5));
int lb = int(floor(vLayer.y + 0.5));
vec4 ta = texture(uTerrain, vec3(vTrailUv + flowUv(la), float(la)));
vec4 tb = texture(uTerrain, vec3(vTrailUv + flowUv(lb), float(lb)));
vec3 ca = ta.rgb * uTint[la];
vec3 cb = tb.rgb * uTint[lb];
vec3 trailCol = mix(ca, cb, vBlend);
// foam where water meets land
if (isWet(la) != isWet(lb) && la != 11 && lb != 11) {
  float foam = exp(-pow((vBlend - 0.5) / 0.16, 2.0));
  float n = fract(sin(dot(floor(vTrailUv * 40.0), vec2(12.9898, 78.233))) * 43758.5453);
  trailCol = mix(trailCol, vec3(1.0), foam * (0.55 + 0.45 * n));
}
diffuseColor.rgb *= trailCol;
diffuseColor.a *= mix(uOpacity[la], uOpacity[lb], vBlend);
trailLum = dot(mix(ta.rgb, tb.rgb, vBlend), vec3(0.333));
lavaGlow = (la == 11 ? 1.0 - vBlend : 0.0) + (lb == 11 ? vBlend : 0.0);`,
      )
      .replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>
// organic edge: vertex alpha shaped by texture detail
float edgeA = vColor.a;
diffuseColor.a = diffuseColor.a / max(edgeA, 0.0001) * clamp(edgeA * 1.7 - 0.35 + (trailLum - 0.45) * 0.8, 0.0, 1.0);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * lavaGlow * 0.9;`,
      );
  };
  materials.set(world, m);
  return m;
}

/** Advance animated water. */
export function updateTrailMaterials(time: number) {
  for (const m of materials.values()) m.userData.uniforms.uTime.value = time;
}

function smooth(e0: number, e1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

interface Band {
  d0: number;
  d1: number;
  a: number;
  b: number;
  /** blend weight at d (along the trail) */
  w: (d: number, o: number) => number;
}

/**
 * Builds trail chunks. A chunk is split into bands with a constant pair of
 * layers so the shader can interpolate the blend weight safely.
 */
export class TrailBuilder {
  constructor(
    private track: TrackDefinition,
    private path: TrackPath,
    private field: TerrainField,
    private world: WorldId,
  ) {}

  private segAt(d: number) {
    return this.field.segmentAt(Math.max(0, d));
  }

  private bands(c0: number, c1: number): Band[] {
    const segs = this.track.segments;
    const cuts: { d: number; kind: 'blend0' | 'blend1' }[] = [];
    for (const s of segs) {
      if (s.index === 0) continue;
      const b = s.start;
      if (b < c0 - BLEND || b > c1 + BLEND) continue;
      const prev = segs[s.index - 1];
      if (layerOf(prev.terrain, this.world) === layerOf(s.terrain, this.world)) continue;
      cuts.push({ d: b - BLEND / 2, kind: 'blend0' }, { d: b + BLEND / 2, kind: 'blend1' });
    }
    const points = [c0, ...cuts.map((c) => c.d).filter((d) => d > c0 && d < c1), c1].sort((a, b) => a - b);
    const out: Band[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const d0 = points[i];
      const d1 = points[i + 1];
      if (d1 - d0 < 0.05) continue;
      const mid = (d0 + d1) / 2;
      // is the middle inside a blend zone?
      const blendSeg = segs.find((s) => s.index > 0 && Math.abs(mid - s.start) < BLEND / 2 && layerOf(segs[s.index - 1].terrain, this.world) !== layerOf(s.terrain, this.world));
      if (blendSeg) {
        const a = layerOf(segs[blendSeg.index - 1].terrain, this.world);
        const b = layerOf(blendSeg.terrain, this.world);
        const z0 = blendSeg.start - BLEND / 2;
        out.push({ d0, d1, a, b, w: (d) => smooth(z0, z0 + BLEND, d) });
      } else {
        const seg = this.segAt(mid);
        const l = layerOf(seg.terrain, this.world);
        if (seg.terrain === 'grass') {
          // a worn dirt trail through the meadow, fading out near the ends
          const path = TRAIL_LAYERS.indexOf('path');
          const s0 = seg.start;
          const s1 = seg.end;
          out.push({
            d0,
            d1,
            a: l,
            b: path,
            w: (d, o) => {
              const along = smooth(s0 + BLEND / 2, s0 + BLEND / 2 + 6, d) * (1 - smooth(s1 - BLEND / 2 - 6, s1 - BLEND / 2, d));
              const wiggle = Math.sin(d * 0.21) * 0.9;
              const across = 1 - smooth(2.2, 4.6, Math.abs(o - wiggle));
              const patchy = 0.75 + 0.25 * Math.sin(d * 0.9 + o * 1.7);
              return 0.62 * along * across * patchy;
            },
          });
        } else {
          out.push({ d0, d1, a: l, b: l, w: () => 0 });
        }
      }
    }
    return out;
  }

  /** Half width of the trail at d on one side (includes terrain zones). */
  extent(d: number, side: number): number {
    const base = PATH_HALF + 0.9 + Math.sin(d * 0.13 + side * 1.7) * 0.45 + Math.sin(d * 0.41 + side * 4.2) * 0.25;
    return Math.max(base, this.field.smoothEdge(d, side) + 1.2);
  }

  build(c0: number, c1: number): THREE.Group {
    const bands = this.bands(c0, c1);
    const COLS = 23;
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const lay: number[] = [];
    const bl: number[] = [];
    const idx: number[] = [];
    const v = new THREE.Vector3();
    const UV = 5;
    for (const band of bands) {
      const rows = Math.max(2, Math.ceil((band.d1 - band.d0) / 1.0) + 1);
      const base = pos.length / 3;
      for (let r = 0; r < rows; r++) {
        const d = band.d0 + ((band.d1 - band.d0) * r) / (rows - 1);
        const eL = this.extent(d, -1);
        const eR = this.extent(d, 1);
        const zone = zoneFor(this.segAt(d).terrain, this.world);
        const wide = zone.kind !== 'none' && zone.kind !== 'wood';
        for (let c = 0; c < COLS; c++) {
          const u = (c / (COLS - 1)) * 2 - 1;
          // denser columns near the edges where the fade happens
          const k = Math.sign(u) * (1 - Math.pow(1 - Math.abs(u), 1.35));
          const o = k < 0 ? k * eL : k * eR;
          const e = o < 0 ? eL : eR;
          this.path.sample(d, o, v);
          const w = band.w(d, o);
          const wet = (WATERY.has(band.a) ? 1 - w : 0) + (WATERY.has(band.b) ? w : 0);
          // in a gorge the trail follows the ground down and up again
          pos.push(v.x, zone.kind === 'chasm' ? Math.min(0.02, this.field.groundY(d, o) + 0.02) : 0.02 + wet * 0.016, v.z);
          uv.push(o / UV, d / UV);
          const fade = wide ? 3.2 : 1.8;
          const alpha = 1 - smooth(e - fade, e, Math.abs(o));
          const macro = 0.86 + 0.26 * hash01(Math.round(d / 7) * 31 + Math.round(o / 7) * 7) * 0.5 + 0.13 * Math.sin(d * 0.05 + o * 0.11);
          col.push(macro, macro, macro, alpha);
          lay.push(band.a, band.b);
          bl.push(w);
        }
      }
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < COLS - 1; c++) {
          const a = base + r * COLS + c;
          const b = a + COLS;
          idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setAttribute('aLayer', new THREE.Float32BufferAttribute(lay, 2));
    g.setAttribute('aBlend', new THREE.Float32BufferAttribute(bl, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, trailMaterial(this.world));
    mesh.renderOrder = 1;
    mesh.receiveShadow = true;
    const grp = new THREE.Group();
    grp.add(mesh);
    const deco = this.edgeDecor(c0, c1);
    if (deco) {
      deco.castShadow = false;
      deco.receiveShadow = true;
      grp.add(deco);
    }
    return grp;
  }

  /** Grass tufts, pebbles and flowers lining the trail. */
  private edgeDecor(c0: number, c1: number): THREE.Mesh | null {
    const m = new GeoMerger();
    const v = new THREE.Vector3();
    const w = this.world;
    const grass = w === 'volcano' ? [0x6b6a3a, 0x8a7a4a] : w === 'ice' ? [0x9fb89a, 0xffffff] : [0x3f9a35, 0x6cc24a];
    for (let d = Math.ceil(c0 / 1.3) * 1.3; d < c1; d += 1.3) {
      const seg = this.segAt(d);
      const zone = zoneFor(seg.terrain, w);
      if (zone.kind === 'water' || zone.kind === 'deep' || zone.kind === 'lava' || zone.kind === 'ice' || zone.kind === 'chasm') continue;
      for (const side of [-1, 1]) {
        const r = hash01(d * 3.7 + side * 11);
        const e = this.extent(d, side);
        const o = side * (e - 1.2 - r * 1.6);
        this.path.sample(d, o, v);
        const y = Math.max(0.02, this.field.groundY(d, o));
        if (w === 'ice' && (zone.kind === 'snow' || r > 0.5)) {
          m.add(GEO.sphere(1), 0xffffff, [v.x, y - 0.02, v.z], [0.32 + r * 0.3, 0.24 + r * 0.14, 0.3 + r * 0.28]);
          continue;
        }
        if (zone.kind === 'rock' || w === 'volcano' || r < 0.25) {
          m.add(GEO.dodeca(), w === 'volcano' ? 0x4a3d39 : 0x9a8f84, [v.x, y + 0.08, v.z], [0.18 + r * 0.25, 0.12 + r * 0.12, 0.16 + r * 0.2], [r * 3, r * 5, 0]);
        }
        if (zone.kind === 'sand') {
          if (r > 0.6) m.add(GEO.cone(4), 0x9aa84a, [v.x, y, v.z], [0.05, 0.6, 0.05], [0.2, 0, 0.3]);
          continue;
        }
        if (zone.kind === 'mud') {
          if (r > 0.5) for (let k = 0; k < 3; k++) m.add(GEO.cone(4), 0x5a7a3a, [v.x + (k - 1) * 0.12, y - 0.05, v.z], [0.05, 0.9 + r * 0.4, 0.05], [0, 0, (k - 1) * 0.2]);
          continue;
        }
        // grass tuft
        const n = 4 + Math.floor(r * 4);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + r * 6;
          const h = 0.35 + hash01(d + k) * 0.35;
          m.add(GEO.cone(3), grass[k % 2], [v.x + Math.cos(a) * 0.18, y - 0.03, v.z + Math.sin(a) * 0.18], [0.07, h, 0.07], [Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35]);
        }
        if ((w === 'jungle' || w === 'islands') && r > 0.72) {
          const fc = [0xffffff, 0xffd32a, 0xff6b81, 0xa55eea][Math.floor(r * 13) % 4];
          m.add(GEO.cylinder(4), 0x3f9a35, [v.x + 0.25, y, v.z], [0.025, 0.32, 0.025]);
          m.add(GEO.sphere(0), fc, [v.x + 0.25, y + 0.36, v.z], 0.09);
        }
      }
    }
    return m.build(vertexColorMat());
  }
}
