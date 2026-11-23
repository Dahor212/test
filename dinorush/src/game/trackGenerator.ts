import { Rng } from '../core/rng';
import { DIFFICULTIES } from '../config/difficulty';
import { GAME_CONFIG } from '../config/gameConfig';
import { TERRAINS } from '../config/terrain';
import { WORLDS } from '../config/worlds';
import type {
  Archetype,
  DifficultyId,
  DynamicEventType,
  ObstacleKind,
  TerrainId,
  TrackDefinition,
  TrackEventSpec,
  TrackObstacle,
  TrackSegment,
  WorldId,
} from '../types';

export interface TrackOptions {
  seed: number;
  worldId: WorldId;
  difficulty: DifficultyId;
  length?: number;
  endless?: boolean;
  coins?: boolean;
  events?: boolean;
}

/** Terrains that are too demanding for the gentle start of a race. */
const INTRO_EXCLUDED: TerrainId[] = ['deepWater', 'scree', 'ice'];

const EVENT_TERRAIN: Record<DynamicEventType, { terrain: TerrainId; obstacle?: ObstacleKind; count?: number }> = {
  fallingTree: { terrain: 'woodBarrier', obstacle: 'fallenTree', count: 2 },
  rockslide: { terrain: 'stones', obstacle: 'boulder', count: 2 },
  flood: { terrain: 'water' },
  snowfall: { terrain: 'snow' },
  quake: { terrain: 'scree', obstacle: 'rockPile', count: 3 },
  stoneWall: { terrain: 'stones', obstacle: 'stoneWall', count: 2 },
};

export const START_LENGTH_MIN = 55;
export const FINISH_STRAIGHT = 55;
export const RUN_OUT = 45;

/**
 * Data-driven, seeded track generator. Produces the same track for the same
 * seed/world/difficulty. Supports incremental generation for endless mode.
 */
export class TrackGenerator {
  readonly track: TrackDefinition;
  private rng: Rng;
  private pos = 0;
  private recent: TerrainId[] = [];
  private readonly opts: Required<TrackOptions>;
  private readonly targetLength: number;

  constructor(opts: TrackOptions) {
    const diff = DIFFICULTIES[opts.difficulty];
    this.opts = {
      ...opts,
      length: opts.length ?? diff.trackLength,
      endless: opts.endless ?? false,
      coins: opts.coins ?? false,
      events: opts.events ?? true,
    };
    this.targetLength = this.opts.endless ? Infinity : this.opts.length;
    this.rng = new Rng(opts.seed);
    this.track = {
      seed: opts.seed,
      worldId: opts.worldId,
      difficulty: opts.difficulty,
      length: this.targetLength,
      segments: [],
      endless: this.opts.endless,
    };
    this.addStart();
    if (this.opts.endless) {
      this.extendTo(GAME_CONFIG.endless.chunkLength * 2);
    } else {
      this.buildFinite();
    }
  }

  private get diff() {
    return DIFFICULTIES[this.opts.difficulty];
  }

  private get world() {
    return WORLDS[this.opts.worldId];
  }

  /** Correct-dino cruising speed – used to convert durations to metres. */
  private nominalSpeed(rampAt = 0): number {
    const ramp = this.opts.endless ? endlessRamp(rampAt) : 1;
    return this.diff.baseSpeed * GAME_CONFIG.suitabilityMultiplier.best * ramp;
  }

  private addStart() {
    const len = Math.max(START_LENGTH_MIN, this.nominalSpeed() * this.diff.warningTime + 20);
    this.push(this.world.firmTerrain, len, { startArea: true });
  }

  private push(terrain: TerrainId, length: number, extra: Partial<TrackSegment> = {}): TrackSegment {
    const seg: TrackSegment = {
      index: this.track.segments.length,
      start: this.pos,
      end: this.pos + length,
      terrain,
      recommended: TERRAINS[terrain].best,
      obstacles: [],
      coins: [],
      ...extra,
    };
    if (TERRAINS[terrain].category === 'smash') seg.obstacles = this.makeObstacles(terrain, seg.start, seg.end);
    this.track.segments.push(seg);
    this.pos = seg.end;
    this.recent.push(terrain);
    if (this.recent.length > 3) this.recent.shift();
    return seg;
  }

  private makeObstacles(terrain: TerrainId, start: number, end: number, forced?: ObstacleKind, forcedCount?: number): TrackObstacle[] {
    const def = TERRAINS[terrain];
    const kinds = def.obstacles ?? ['rockPile'];
    const len = end - start;
    const count = forcedCount ?? Math.max(2, Math.min(4, Math.round(len / 9)));
    const first = start + Math.min(6, len * 0.2);
    const last = end - Math.min(4, len * 0.15);
    const out: TrackObstacle[] = [];
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      let kind = forced ?? this.rng.pick(kinds);
      if (this.opts.worldId === 'ice' && kind === 'rockPile') kind = 'iceBlock';
      out.push({ at: first + (last - first) * t, kind });
    }
    return out;
  }

  private chooseTerrain(progress: number): TerrainId {
    const prev = this.recent[this.recent.length - 1];
    const prevBest = TERRAINS[prev].best;
    const intro = progress < this.diff.easyIntro;
    const wantChange = this.rng.chance(intro ? 1 : this.diff.changeProbability);
    const pool: Partial<Record<TerrainId, number>> = {};
    const recentBest = new Set<Archetype>(this.recent.slice(-2).map((t) => TERRAINS[t].best));
    for (const [id, w] of Object.entries(this.world.terrainPool) as [TerrainId, number][]) {
      if (id === prev) continue;
      if (intro && INTRO_EXCLUDED.includes(id)) continue;
      const best = TERRAINS[id].best;
      if (wantChange && best === prevBest) continue;
      if (!wantChange && best !== prevBest) continue;
      let weight = w;
      if (recentBest.has(best)) weight *= 0.45;
      pool[id] = weight;
    }
    if (Object.keys(pool).length === 0) {
      // fall back to any terrain needing a different dino
      for (const [id, w] of Object.entries(this.world.terrainPool) as [TerrainId, number][]) {
        if (id !== prev && TERRAINS[id].best !== prevBest) pool[id] = w;
      }
    }
    return this.rng.weighted(pool);
  }

  private segmentLength(terrain: TerrainId, progress: number, at: number): number {
    const d = this.diff;
    const cat = TERRAINS[terrain].category;
    const intro = progress < d.easyIntro;
    const ramp = this.opts.endless ? endlessRamp(at) : 1;
    let t = this.rng.range(d.segmentTime[0], d.segmentTime[1]);
    if (intro) t *= 1.2;
    if (cat === 'smash') t *= 0.8;
    // Endless: changes come faster the further you go.
    t /= Math.sqrt(ramp);
    const minT = Math.max(1.6, d.minSegmentTime / Math.sqrt(ramp));
    t = Math.max(t, minT);
    return t * this.nominalSpeed(at);
  }

  private buildFinite() {
    const total = this.targetLength;
    const finishStart = total - FINISH_STRAIGHT;
    let guard = 0;
    while (guard++ < 500) {
      const progress = this.pos / total;
      const terrain = this.chooseTerrain(progress);
      const len = this.segmentLength(terrain, progress, this.pos);
      const minLen = this.diff.minSegmentTime * this.nominalSpeed();
      if (this.pos + len > finishStart) {
        const remaining = finishStart - this.pos;
        if (remaining >= minLen) this.push(terrain, remaining);
        break;
      }
      this.push(terrain, len);
    }
    // final straight – always firm so everybody sprints home
    const firm = this.world.firmTerrain;
    const last = this.track.segments[this.track.segments.length - 1];
    const finishLen = total - this.pos + RUN_OUT;
    if (last.terrain === firm) {
      last.end = total + RUN_OUT;
      last.finish = true;
      this.pos = last.end;
    } else {
      this.push(firm, finishLen, { finish: true });
    }
    if (this.opts.events) this.addEvents();
    if (this.opts.coins) this.addCoins(0);
  }

  /** Endless mode: generate segments until `distance` is covered. */
  extendTo(distance: number) {
    if (!this.opts.endless) return;
    const from = this.track.segments.length;
    let guard = 0;
    while (this.pos < distance && guard++ < 400) {
      const progress = Math.min(1, this.pos / 600);
      const terrain = this.chooseTerrain(progress);
      const len = this.segmentLength(terrain, progress, this.pos);
      this.push(terrain, len);
    }
    if (this.opts.events) this.addEndlessEvents(from);
    if (this.opts.coins) this.addCoins(from);
  }

  private eventSpec(type: DynamicEventType, seg: TrackSegment): TrackEventSpec {
    const def = EVENT_TERRAIN[type];
    const lead = this.diff.warningTime * this.nominalSpeed(seg.start) + 40;
    return {
      type,
      newTerrain: def.terrain,
      newObstacles: def.obstacle ? this.makeObstacles(def.terrain, seg.start, seg.end, def.obstacle, def.count) : [],
      leadDistance: lead,
      triggered: false,
    };
  }

  private eligibleForEvent(i: number, type: DynamicEventType): boolean {
    const segs = this.track.segments;
    const seg = segs[i];
    if (!seg || seg.startArea || seg.finish || seg.event) return false;
    if (TERRAINS[seg.terrain].category !== 'firm') return false;
    const newBest = TERRAINS[EVENT_TERRAIN[type].terrain].best;
    const prev = segs[i - 1];
    const next = segs[i + 1];
    if (!prev || !next) return false;
    if (prev.recommended === newBest || next.recommended === newBest) return false;
    if (prev.event || next.event) return false;
    const len = seg.end - seg.start;
    return len >= this.diff.minSegmentTime * this.nominalSpeed(seg.start) * 0.9;
  }

  private addEvents() {
    const [min, max] = this.diff.dynamicEvents;
    const count = this.rng.int(min, max);
    const segs = this.track.segments;
    const candidates: number[] = [];
    for (let i = 0; i < segs.length; i++) {
      const p = segs[i].start / this.targetLength;
      if (p > 0.22 && p < 0.85) candidates.push(i);
    }
    let placed = 0;
    while (placed < count && candidates.length) {
      const idx = candidates.splice(this.rng.int(0, candidates.length - 1), 1)[0];
      // try the world's event types in a random order
      const types = [...this.world.events];
      for (let k = types.length - 1; k > 0; k--) {
        const j = this.rng.int(0, k);
        [types[k], types[j]] = [types[j], types[k]];
      }
      const type = types.find((t) => this.eligibleForEvent(idx, t));
      if (!type) continue;
      segs[idx].event = this.eventSpec(type, segs[idx]);
      placed++;
    }
  }

  private addEndlessEvents(from: number) {
    const segs = this.track.segments;
    for (let i = Math.max(from, 3); i < segs.length - 1; i++) {
      if (!this.rng.chance(0.09)) continue;
      const type = this.rng.pick(this.world.events);
      if (this.eligibleForEvent(i, type)) segs[i].event = this.eventSpec(type, segs[i]);
    }
  }

  private addCoins(from: number) {
    const spacing = GAME_CONFIG.coins.rowSpacing;
    const segs = this.track.segments;
    for (let i = Math.max(1, from); i < segs.length; i++) {
      const s = segs[i];
      if (s.startArea || s.event || s.coins.length) continue;
      const golden = s.finish ? false : this.rng.chance(0.55);
      if (!golden) continue;
      const end = s.finish && !this.opts.endless ? Math.min(s.end, this.targetLength) : s.end;
      for (let p = s.start + 3; p < end - 2; p += spacing) s.coins.push(p);
    }
  }
}

export function endlessRamp(distance: number): number {
  const e = GAME_CONFIG.endless;
  return Math.min(e.maxRamp, 1 + (e.rampPer100m * Math.max(0, distance)) / 100);
}

export function generateTrack(opts: TrackOptions): TrackDefinition {
  return new TrackGenerator(opts).track;
}

/**
 * Fixed, hand-made tutorial track: path → water → stones → mud → finish.
 */
export function tutorialTrack(worldId: WorldId = 'jungle'): TrackDefinition {
  const plan: [TerrainId, number, Partial<TrackSegment>?][] = [
    ['path', 40, { startArea: true }],
    ['grass', 45],
    ['water', 45],
    ['stones', 34],
    ['mud', 45],
    ['path', 60],
    ['water', 40],
    ['grass', 90, { finish: true }],
  ];
  let pos = 0;
  const segments: TrackSegment[] = plan.map(([terrain, len, extra], index) => {
    const seg: TrackSegment = {
      index,
      start: pos,
      end: pos + len,
      terrain,
      recommended: TERRAINS[terrain].best,
      obstacles: [],
      coins: [],
      ...(extra ?? {}),
    };
    if (terrain === 'stones') {
      seg.obstacles = [
        { at: pos + 10, kind: 'rockPile' },
        { at: pos + 24, kind: 'boulder' },
      ];
    }
    pos += len;
    return seg;
  });
  return {
    seed: 1,
    worldId,
    difficulty: 'small',
    length: pos - RUN_OUT,
    segments,
    endless: false,
  };
}
