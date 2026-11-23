import * as THREE from 'three';
import { TERRAINS } from '../config/terrain';
import type { TerrainId, TrackDefinition, WorldId } from '../types';

/**
 * Visual course of the track: maps the 1-D race distance (metres) onto a
 * gently meandering 3-D path. Game logic still only knows distances.
 */
export class TrackPath {
  private xs: number[] = [0];
  private zs: number[] = [0];
  private readonly A: [number, number, number];
  private readonly L: [number, number, number];
  private readonly P: [number, number, number];
  readonly step = 1;

  constructor(seed: number) {
    const r = (k: number) => {
      const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    this.A = [0.42 + r(1) * 0.1, 0.18 + r(2) * 0.06, 0.07];
    this.L = [480 + r(3) * 120, 220 + r(4) * 60, 110 + r(5) * 20];
    this.P = [r(6) * Math.PI * 2, r(7) * Math.PI * 2, r(8) * Math.PI * 2];
  }

  /** Heading in radians (0 = towards -Z, positive turns right towards +X). */
  heading(d: number): number {
    if (d <= 0) return 0;
    const ramp = d >= 140 ? 1 : (() => {
      const t = d / 140;
      return t * t * (3 - 2 * t);
    })();
    let h = 0;
    for (let i = 0; i < 3; i++) h += this.A[i] * (Math.sin((2 * Math.PI * d) / this.L[i] + this.P[i]) - Math.sin(this.P[i]));
    return h * ramp;
  }

  private extend(to: number) {
    let i = this.xs.length - 1;
    while (i < to + 2) {
      const h = this.heading(i + 0.5);
      this.xs.push(this.xs[i] + Math.sin(h));
      this.zs.push(this.zs[i] - Math.cos(h));
      i++;
    }
  }

  /** World position at distance d with a lateral offset (positive = right). */
  sample(d: number, lateral = 0, out = new THREE.Vector3()): THREE.Vector3 {
    let x: number;
    let z: number;
    if (d <= 0) {
      x = 0;
      z = -d;
    } else {
      this.extend(d + 1);
      const i = Math.floor(d);
      const f = d - i;
      x = this.xs[i] + (this.xs[i + 1] - this.xs[i]) * f;
      z = this.zs[i] + (this.zs[i + 1] - this.zs[i]) * f;
    }
    const h = this.heading(d);
    out.set(x + Math.cos(h) * lateral, 0, z + Math.sin(h) * lateral);
    return out;
  }
}

/** Half width of the running path. */
export const PATH_HALF = 6.4;

/**
 * Where a racer runs across the shared trail: everybody keeps a loose
 * left / middle / right position, weaves a little and the whole pack cuts
 * to the inside of curves. Deterministic in d so coins can be placed on it.
 */
export function racerLateral(path: TrackPath, lane: number, d: number): number {
  const base = (lane - 1) * 3.4 * 0.85;
  const weave = 0.38 * Math.sin(d / 17 + lane * 2.1) + 0.18 * Math.sin(d / 43 + lane * 0.7);
  const curv = (path.heading(d + 5) - path.heading(d - 5)) / 10;
  const inside = Math.max(-1.3, Math.min(1.3, curv * 140));
  return base + weave + inside;
}

/** Heading of a racer including the small sideways drift of its line. */
export function racerHeading(path: TrackPath, lane: number, d: number): number {
  const drift = (racerLateral(path, lane, d + 1) - racerLateral(path, lane, d - 1)) / 2;
  return path.heading(d) + Math.atan(drift);
}

export type ZoneKind = 'none' | 'water' | 'deep' | 'lava' | 'mud' | 'sand' | 'snow' | 'ice' | 'rock' | 'wood';

export interface Zone {
  kind: ZoneKind;
  /** Half width of the zone around the path centre. */
  ext: number;
  /** Ground basin depth (rivers, lakes). */
  basin: number;
}

export function zoneFor(terrain: TerrainId, world: WorldId): Zone {
  switch (terrain) {
    case 'water':
      return { kind: 'water', ext: 34, basin: 0.55 };
    case 'deepWater':
      return { kind: 'deep', ext: 42, basin: 0.9 };
    case 'bridge':
      return world === 'volcano' ? { kind: 'lava', ext: 38, basin: 0.9 } : { kind: 'water', ext: 38, basin: 0.9 };
    case 'mud':
      return { kind: 'mud', ext: 15, basin: 0.12 };
    case 'sand':
      return { kind: 'sand', ext: 18, basin: 0 };
    case 'snow':
      return { kind: 'snow', ext: 22, basin: 0 };
    case 'ice':
      return { kind: 'ice', ext: 28, basin: 0.25 };
    case 'stones':
    case 'scree':
      return { kind: 'rock', ext: 10.5, basin: 0 };
    case 'woodBarrier':
      return { kind: 'wood', ext: PATH_HALF, basin: 0 };
    default:
      return { kind: 'none', ext: PATH_HALF, basin: 0 };
  }
}

function smooth(e0: number, e1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Terrain heights and zones around the path. The path runs through a
 * valley; rivers and lakes sit in basins that cross the whole valley.
 */
export class TerrainField {
  private hint = 0;
  constructor(
    private track: TrackDefinition,
    private world: WorldId,
    private seed: number,
  ) {}

  segmentAt(d: number) {
    const segs = this.track.segments;
    let i = Math.max(0, Math.min(this.hint, segs.length - 1));
    while (i < segs.length - 1 && d >= segs[i].end) i++;
    while (i > 0 && d < segs[i].start) i--;
    this.hint = i;
    return segs[i];
  }

  zoneAt(d: number): Zone & { d0: number; d1: number } {
    const s = this.segmentAt(Math.max(0, d));
    return { ...zoneFor(s.terrain, this.world), d0: s.start, d1: s.end };
  }

  /** Irregular half width of a zone at distance d on one side. */
  edge(zone: Zone, d: number, side: number): number {
    if (zone.kind === 'none' || zone.kind === 'wood') return PATH_HALF;
    const n = Math.sin(d * 0.19 + side * 2.1 + this.seed) * 0.12 + Math.sin(d * 0.53 + side * 5.3) * 0.06;
    return Math.max(PATH_HALF + 0.5, zone.ext * (1 + n));
  }

  /** How much the basin applies at distance d (0 outside, 1 inside, smooth banks). */
  basinFactor(z: { d0: number; d1: number }, d: number) {
    return smooth(z.d0 - 0.5, z.d0 + 2.5, d) * (1 - smooth(z.d1 - 2.5, z.d1 + 0.5, d));
  }

  hillHeight(d: number, side: number): number {
    const base = this.world === 'volcano' ? 6 : this.world === 'ice' ? 5 : this.world === 'islands' ? 1.4 : 4;
    return base * (0.75 + 0.35 * Math.sin(d / 47 + side * 1.3 + this.seed) + 0.25 * Math.sin(d / 19 + side * 4.1));
  }

  /**
   * Zone half width blended over neighbouring segments so the valley walls
   * never form cliffs at segment boundaries.
   */
  smoothEdge(d: number, side: number): number {
    const segs = this.track.segments;
    const s = this.segmentAt(Math.max(0, d));
    let best = PATH_HALF;
    for (let i = Math.max(0, s.index - 1); i <= Math.min(segs.length - 1, s.index + 1); i++) {
      const g = segs[i];
      const z = zoneFor(g.terrain, this.world);
      if (z.kind === 'none' || z.kind === 'wood') continue;
      const dist = d < g.start ? g.start - d : d > g.end ? d - g.end : 0;
      const w = 1 - smooth(0, 12, dist);
      best = Math.max(best, PATH_HALF + (this.edge(z, d, side) - PATH_HALF) * w);
    }
    return best;
  }

  /** Ground height at (d, lateral o). */
  groundY(d: number, o: number): number {
    const a = Math.abs(o);
    const side = o < 0 ? -1 : 1;
    const z = this.zoneAt(d);
    let y = 0;
    if (z.basin > 0) {
      const e = this.edge(z, d, side);
      const inside = 1 - smooth(e - 4, e, a);
      y -= z.basin * inside * this.basinFactor(z, d);
    }
    const hillStart = Math.max(PATH_HALF + 2.5, this.smoothEdge(d, side) + 1.5);
    y += smooth(hillStart, hillStart + 38, a) * this.hillHeight(d, side);
    if (this.world === 'islands') y -= smooth(48, 75, a) * 4.5;
    if (a < PATH_HALF + 0.3) y = Math.min(y, -0.02);
    return y;
  }

  isDry(d: number, o: number): boolean {
    const z = this.zoneAt(d);
    if (z.kind === 'none' || z.kind === 'wood' || z.kind === 'rock') return Math.abs(o) > PATH_HALF + 0.8;
    return Math.abs(o) > this.edge(z, d, o < 0 ? -1 : 1) + 1.2;
  }

  terrainColor(terrain: TerrainId): number {
    return TERRAINS[terrain].color;
  }
}
