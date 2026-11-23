import { ABILITIES, ARCHETYPES, ARCHETYPE_INFO, CLASSIC_ROLES } from '../config/dinosaurs';
import { DIFFICULTIES } from '../config/difficulty';
import { GAME_CONFIG } from '../config/gameConfig';
import { MODES } from '../config/modes';
import { TERRAINS } from '../config/terrain';
import { hashString } from '../core/rng';
import type {
  AIProfileId,
  Archetype,
  GameDifficulty,
  GameModeDefinition,
  ParticipantKind,
  ParticipantLoadout,
  ParticipantResult,
  RaceConfig,
  RaceEvent,
  RaceParticipant,
  RaceResult,
  RaceState,
  TerrainCategory,
  TrackDefinition,
  TrackSegment,
} from '../types';
import { AIController } from './ai';
import { MODE_RULES, type ModeRules } from './modes';
import { approachSpeed, perfectWindowBefore, switchCooldown, terrainMultiplier } from './physics';
import { nextChange } from './track';
import { endlessRamp, RUN_OUT, TrackGenerator, tutorialTrack } from './trackGenerator';

const C = GAME_CONFIG;

export interface ParticipantSetup {
  id: string;
  name: string;
  color: string;
  kind: ParticipantKind;
  seat: number;
  aiProfile?: AIProfileId;
  loadout: Record<Archetype, ParticipantLoadout>;
  start?: Archetype;
  /** Visual lane (0..2); defaults to the index in the setup list. */
  lane?: number;
}

function zeroRecord(): Record<Archetype, number> {
  return { raptor: 0, spino: 0, ankylo: 0, trike: 0, ptero: 0 };
}

/**
 * The race simulation. Pure TypeScript – no rendering, no DOM. It advances
 * in fixed steps so results only depend on inputs, never on frame rate.
 */
export class RaceEngine {
  readonly state: RaceState;
  readonly difficulty: GameDifficulty;
  readonly mode: GameModeDefinition;
  readonly rules: ModeRules;
  private generator: TrackGenerator | null = null;
  readonly ai = new Map<string, AIController>();
  private pending: RaceEvent[] = [];
  private acc = 0;
  private lastCountdown = Math.ceil(C.countdownSeconds) + 1;
  private bonus = new Map<string, number>();
  /** Optional listener for every emitted event (renderer/audio hook). */
  onEvent: ((e: RaceEvent) => void) | null = null;
  /** Called after every simulation step while racing (ghost recording). */
  onStep: (() => void) | null = null;

  constructor(config: RaceConfig, setups: ParticipantSetup[], track?: TrackDefinition) {
    this.difficulty = DIFFICULTIES[config.difficulty];
    this.mode = MODES[config.mode];
    this.rules = MODE_RULES[config.mode];
    let t = track;
    if (!t) {
      if (config.tutorial) {
        t = tutorialTrack(config.worldId);
      } else {
        this.generator = new TrackGenerator({
          seed: config.seed,
          worldId: config.worldId,
          difficulty: config.difficulty,
          endless: config.mode === 'endless',
          coins: this.mode.trackCoins,
          length: config.trackLengthOverride,
          terrainPool: config.terrainPool,
          roles: config.roles,
          style: config.trackStyle,
          focus: config.focusTerrain,
        });
        t = this.generator.track;
      }
    }
    this.state = {
      config,
      phase: 'countdown',
      countdown: C.countdownSeconds,
      time: 0,
      track: t,
      participants: setups.map((s, i) => this.makeParticipant(s, i, config.normalizeStats)),
      trex: null,
      team: null,
      timeScale: 1,
      sinceFirstFinish: null,
      ramp: 1,
      endedByPlayer: false,
    };
    setups.forEach((s, i) => {
      if (s.kind === 'ai') this.ai.set(s.id, new AIController(s.aiProfile ?? 'beginner', (config.seed * 31 + hashString(s.id) + i) >>> 0));
    });
    this.rules.init(this);
  }

  private makeParticipant(s: ParticipantSetup, lane: number, normalize: boolean): RaceParticipant {
    const loadout = {} as Record<Archetype, ParticipantLoadout>;
    for (const a of ARCHETYPES) {
      const l = s.loadout[a];
      loadout[a] = normalize
        ? { ...l, stats: { speed: 0, transform: 0, stamina: 0 }, level: 1, perk: undefined }
        : { ...l, stats: { ...l.stats } };
    }
    const start = s.start ?? 'raptor';
    return {
      id: s.id,
      lane: s.lane ?? lane,
      name: s.name,
      color: s.color,
      kind: s.kind,
      seat: s.seat,
      aiProfile: s.aiProfile,
      loadout,
      current: start,
      previous: start,
      sinceSwitch: 10,
      switchCooldown: switchCooldown(loadout[start]),
      position: 0,
      speed: 0,
      targetSpeed: 0,
      segmentIndex: 0,
      segCorrect: 0,
      segTotal: 0,
      segPerfect: false,
      combo: 0,
      maxCombo: 0,
      correctSegments: 0,
      mistakes: 0,
      perfects: 0,
      smashed: 0,
      climbed: 0,
      switches: 0,
      coins: 0,
      score: 0,
      abilityCharge: zeroRecord(),
      ability: null,
      abilitiesUsed: 0,
      perfectBoost: 0,
      turbo: 0,
      teamTurbo: 0,
      bump: 0,
      bumpKind: 'smash',
      perfectSegIndex: -1,
      warnedSegIndex: -1,
      prepared: false,
      terrainFactor: 1,
      finished: false,
      finishTime: null,
      caught: false,
      caughtAt: null,
      used: zeroRecord(),
      segmentsByArchetype: zeroRecord(),
      place: lane + 1,
    };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  emit(e: Omit<RaceEvent, 'time'>) {
    const ev = { ...e, time: this.state.time } as RaceEvent;
    this.pending.push(ev);
    this.onEvent?.(ev);
  }

  /** Advance by real elapsed seconds. Returns events emitted. */
  update(realDt: number): RaceEvent[] {
    const dt = Math.min(Math.max(0, realDt), C.maxFrameDelta) * this.state.timeScale;
    this.acc += dt;
    let guard = 0;
    while (this.acc >= C.fixedStep && guard++ < 240) {
      this.step(C.fixedStep);
      this.acc -= C.fixedStep;
    }
    return this.drainEvents();
  }

  drainEvents(): RaceEvent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  participant(id: string): RaceParticipant | undefined {
    return this.state.participants.find((p) => p.id === id);
  }

  warningDistance(p: RaceParticipant): number {
    return this.difficulty.warningTime * Math.max(p.speed, this.difficulty.baseSpeed);
  }

  /** Transform request from a touch button or an AI. Returns true if applied. */
  requestSwitch(id: string, arch: Archetype): boolean {
    const s = this.state;
    const p = this.participant(id);
    if (!p || p.finished || s.phase === 'finished') return false;
    if (arch === p.current) return false;
    // only dinosaurs this race knows (2 at the start of the career, up to 5)
    if (!(s.config.roles ?? CLASSIC_ROLES).includes(arch)) return false;
    if (p.sinceSwitch < p.switchCooldown) return false;
    p.previous = p.current;
    p.current = arch;
    p.sinceSwitch = 0;
    p.switches++;
    p.switchCooldown = switchCooldown(p.loadout[arch]);
    if (p.ability && p.ability.archetype !== arch) this.endAbility(p);
    this.emit({ type: 'switch', participantId: id, archetype: arch });
    if (s.phase === 'racing') this.checkPerfect(p, arch);
    return true;
  }

  /** Endless mode / quitting: end now and keep the score. */
  endByPlayer() {
    if (this.state.phase === 'finished') return;
    this.state.endedByPlayer = true;
    this.finishRace();
  }

  bonusScore(id: string): number {
    return this.bonus.get(id) ?? 0;
  }

  addBonusScore(id: string, v: number) {
    this.bonus.set(id, this.bonusScore(id) + v);
  }

  leaderPosition(): number {
    let m = 0;
    for (const p of this.state.participants) m = Math.max(m, p.position);
    return m;
  }

  /** Team mode outcome helper. */
  teamOutcome(): { won: boolean; teamTime: number | null; rivalTime: number | null; margin: number } {
    const s = this.state;
    if (!s.team) return { won: false, teamTime: null, rivalTime: null, margin: 0 };
    const times = s.participants.map((p) => p.finishTime ?? this.estimateFinish(p));
    const teamTime = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
    const rivalTime = s.track.length / s.team.rivalSpeed;
    return { won: teamTime <= rivalTime, teamTime, rivalTime, margin: rivalTime - teamTime };
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  step(dt: number) {
    const s = this.state;
    if (s.phase === 'finished') return;
    for (const p of s.participants) p.sinceSwitch += dt;
    if (s.phase === 'countdown') {
      s.countdown -= dt;
      const ci = Math.ceil(s.countdown);
      if (ci < this.lastCountdown && ci > 0) {
        this.lastCountdown = ci;
        this.emit({ type: 'countdown', value: ci });
      }
      if (s.countdown <= 0) {
        s.countdown = 0;
        s.phase = 'racing';
        this.emit({ type: 'start' });
        for (const p of s.participants) {
          const seg = s.track.segments[0];
          this.emit({ type: 'enterTerrain', participantId: p.id, terrain: seg.terrain, segmentIndex: 0 });
        }
      }
      return;
    }
    s.time += dt;
    if (this.generator) this.generator.extendTo(this.leaderPosition() + 450);
    this.checkDynamicEvents();
    const ctx = {
      state: s,
      warningDistance: (p: RaceParticipant) => this.warningDistance(p),
      requestSwitch: (id: string, a: Archetype) => this.requestSwitch(id, a),
    };
    for (const p of s.participants) {
      const ai = this.ai.get(p.id);
      if (ai) ai.update(ctx, p);
    }
    for (const p of s.participants) this.updateParticipant(p, dt);
    this.rules.tick(this, dt);
    if (s.sinceFirstFinish !== null) s.sinceFirstFinish += dt;
    this.updatePlaces();
    this.onStep?.();
    if (this.rules.shouldEnd(this)) this.finishRace();
  }

  private baseSpeed(p: RaceParticipant): number {
    const ramp = this.state.track.endless ? endlessRamp(p.position) : 1;
    return this.difficulty.baseSpeed * ramp;
  }

  private updateParticipant(p: RaceParticipant, dt: number) {
    const s = this.state;
    const track = s.track;
    const segs = track.segments;
    const base = this.baseSpeed(p);

    if (p.finished) {
      // jog out after the finish line
      p.speed = approachSpeed(p.speed, base * 0.5, dt);
      const maxPos = track.length + RUN_OUT - 3;
      p.position = Math.min(maxPos, p.position + p.speed * dt);
      if (p.position >= maxPos) p.speed = 0;
      while (p.segmentIndex < segs.length - 1 && p.position >= segs[p.segmentIndex].end) p.segmentIndex++;
      return;
    }

    const seg = segs[p.segmentIndex];
    const lo = p.loadout[p.current];
    const { multiplier } = terrainMultiplier(seg.terrain, lo, this.difficulty);
    let mult = multiplier;
    const correct = p.current === seg.recommended;
    const next = nextChange(track, p.segmentIndex);
    const warnDist = this.warningDistance(p);
    p.prepared = false;
    if (!correct && next && p.current === next.recommended && next.start - p.position <= warnDist) {
      p.prepared = true;
      mult = Math.max(mult, C.earlyGraceMultiplier);
    }
    if (next && p.warnedSegIndex !== next.index && next.start - p.position <= warnDist) {
      p.warnedSegIndex = next.index;
      this.emit({
        type: 'warning',
        participantId: p.id,
        terrain: next.terrain,
        archetype: next.recommended,
        segmentIndex: next.index,
      });
    }

    // timers
    p.perfectBoost = Math.max(0, p.perfectBoost - dt);
    p.turbo = Math.max(0, p.turbo - dt);
    p.teamTurbo = Math.max(0, p.teamTurbo - dt);
    p.bump = Math.max(0, p.bump - dt);

    const cat = TERRAINS[seg.terrain].category;
    this.updateAbility(p, cat, correct, dt);

    let boost = 1;
    if (p.perfectBoost > 0) boost *= C.perfect.boost;
    if (p.turbo > 0) boost *= C.combo.turboMultiplier;
    if (p.teamTurbo > 0) boost *= C.team.turboMultiplier;
    if (p.ability && p.current === p.ability.archetype && ABILITIES[p.ability.id].activeOn.includes(cat)) {
      boost *= ABILITIES[p.ability.id].speedMultiplier;
    }

    let target = Math.min(base * mult * boost, base * C.maxSpeedFactor);
    if (p.bump > 0) {
      target = p.bumpKind === 'climb' ? Math.min(target, C.obstacle.climbSpeed) : target * C.obstacle.smashBumpFactor;
    }
    target = Math.max(target, C.minSpeed);
    p.targetSpeed = target;
    p.terrainFactor = mult;
    p.speed = approachSpeed(p.speed, target, dt);
    if (p.bump > 0 && p.bumpKind === 'climb') p.speed = Math.min(p.speed, Math.max(C.obstacle.climbSpeed, p.speed * 0.9));

    const prev = p.position;
    p.position += p.speed * dt;
    const ds = p.position - prev;
    p.segTotal += ds;
    if (correct || p.prepared) p.segCorrect += ds;
    p.used[p.current] += ds;
    if (correct) this.chargeAbility(p, cat, ds);

    this.checkObstacles(p, prev, p.position);
    if (track.segments.some((x) => x.coins.length)) this.checkCoins(p, prev, p.position);

    while (p.segmentIndex < segs.length - 1 && p.position >= segs[p.segmentIndex].end) {
      if (!(this.mode.hasFinish && segs[p.segmentIndex].finish)) this.evaluateSegment(p, segs[p.segmentIndex]);
      p.segmentIndex++;
      p.segCorrect = 0;
      p.segTotal = 0;
      const ns = segs[p.segmentIndex];
      this.emit({ type: 'enterTerrain', participantId: p.id, terrain: ns.terrain, segmentIndex: ns.index, archetype: p.current });
    }

    if (this.mode.hasFinish && p.position >= track.length) {
      const fs = segs[p.segmentIndex];
      if (fs.finish) this.evaluateSegment(p, fs);
      p.finished = true;
      p.finishTime = s.time - (p.position - track.length) / Math.max(p.speed, 0.1);
      if (s.sinceFirstFinish === null) s.sinceFirstFinish = 0;
      if (p.ability) this.endAbility(p);
      this.rules.onFinish(this, p);
      const place = s.participants.filter((x) => x.finished).length;
      this.emit({ type: 'finish', participantId: p.id, value: place });
    }
  }

  private checkPerfect(p: RaceParticipant, arch: Archetype) {
    const track = this.state.track;
    const segs = track.segments;
    const seg = segs[p.segmentIndex];
    const speed = Math.max(p.speed, 1);
    let target: TrackSegment | null = null;
    const prevSeg = segs[p.segmentIndex - 1];
    if (arch === seg.recommended && !seg.startArea && prevSeg && prevSeg.recommended !== seg.recommended) {
      if ((p.position - seg.start) / speed <= C.perfect.windowAfter) target = seg;
    }
    if (!target) {
      const next = nextChange(track, p.segmentIndex);
      if (next && arch === next.recommended) {
        const ttc = (next.start - p.position) / speed;
        if (ttc >= 0 && ttc <= perfectWindowBefore(p.loadout[arch])) target = next;
      }
    }
    if (!target || p.perfectSegIndex === target.index) return;
    p.perfectSegIndex = target.index;
    p.perfects++;
    const perk = p.loadout[arch].perk;
    p.perfectBoost = C.perfect.duration * (perk?.kind === 'perfectBoost' ? 1 + perk.value : 1);
    p.coins += C.perfect.coins;
    this.emit({ type: 'perfect', participantId: p.id, archetype: arch, segmentIndex: target.index });
    this.rules.onPerfect(this, p);
  }

  private evaluateSegment(p: RaceParticipant, seg: TrackSegment) {
    const frac = p.segTotal > 0 ? p.segCorrect / p.segTotal : 0;
    if (frac >= C.segment.successFraction) {
      p.combo++;
      p.maxCombo = Math.max(p.maxCombo, p.combo);
      p.correctSegments++;
      p.segmentsByArchetype[seg.recommended]++;
      this.emit({ type: 'segmentSuccess', participantId: p.id, segmentIndex: seg.index, value: p.combo, archetype: seg.recommended });
      this.rules.onSegmentSuccess(this, p);
      const turbo = p.combo % C.combo.turboEvery === 0;
      const coins = p.combo % C.combo.coinsEvery === 0;
      if (turbo || coins) {
        this.emit({ type: 'combo', participantId: p.id, value: p.combo });
        this.rules.onCombo(this, p, p.combo);
      }
      if (turbo) {
        p.turbo = C.combo.turboDuration;
        this.emit({ type: 'turbo', participantId: p.id, value: p.combo });
      }
      if (coins) {
        const perk = p.loadout[p.current].perk;
        const amount = Math.round(C.combo.coinBonus * (perk?.kind === 'comboCoins' ? 1 + perk.value : 1));
        p.coins += amount;
        this.emit({ type: 'comboCoins', participantId: p.id, value: amount });
      }
    } else {
      p.combo = 0;
      p.mistakes++;
      this.emit({ type: 'segmentMistake', participantId: p.id, segmentIndex: seg.index, archetype: seg.recommended });
    }
  }

  private chargeAbility(p: RaceParticipant, cat: TerrainCategory, ds: number) {
    const a = p.current;
    if (p.ability) return;
    const perk = p.loadout[a].perk;
    const mul = perk?.kind === 'abilityCharge' ? 1 + perk.value : 1;
    const A = C.ability;
    let add = 0;
    if (a === 'raptor' && cat === 'firm') add = ds * A.firmChargePerMetre;
    else if (a === 'spino' && cat === 'water') add = ds * A.waterChargePerMetre;
    else if (a === 'trike' && cat === 'rough') add = ds * A.roughChargePerMetre;
    else if (a === 'ptero' && cat === 'air') add = ds * A.airChargePerMetre;
    if (add > 0) p.abilityCharge[a] = Math.min(100, p.abilityCharge[a] + add * mul);
  }

  private updateAbility(p: RaceParticipant, cat: TerrainCategory, correct: boolean, dt: number) {
    if (p.ability) {
      p.ability.remaining -= dt;
      if (p.ability.remaining <= 0) this.endAbility(p);
      return;
    }
    const a = p.current;
    const abilityId = ARCHETYPE_INFO[a].ability;
    const def = ABILITIES[abilityId];
    if (correct && p.abilityCharge[a] >= 100 && def.activeOn.includes(cat)) {
      const perk = p.loadout[a].perk;
      const duration = def.duration * (perk?.kind === 'abilityDuration' ? 1 + perk.value : 1);
      p.ability = { archetype: a, id: abilityId, remaining: duration, duration };
      p.abilityCharge[a] = 0;
      p.abilitiesUsed++;
      this.emit({ type: 'abilityActivated', participantId: p.id, archetype: a });
    }
  }

  private endAbility(p: RaceParticipant) {
    if (!p.ability) return;
    const a = p.ability.archetype;
    p.ability = null;
    this.emit({ type: 'abilityEnded', participantId: p.id, archetype: a });
  }

  private checkObstacles(p: RaceParticipant, from: number, to: number) {
    const segs = this.state.track.segments;
    for (let si = p.segmentIndex; si <= Math.min(segs.length - 1, p.segmentIndex + 1); si++) {
      const obs = segs[si].obstacles;
      for (let j = 0; j < obs.length; j++) {
        const o = obs[j];
        if (o.at <= from || o.at > to) continue;
        if (p.current === 'ankylo') {
          p.smashed++;
          const perk = p.loadout.ankylo.perk;
          const mul = perk?.kind === 'abilityCharge' ? 1 + perk.value : 1;
          const unstoppable = p.ability?.id === 'unstoppableSmash';
          if (!unstoppable) {
            p.abilityCharge.ankylo = Math.min(100, p.abilityCharge.ankylo + C.ability.smashChargePerObstacle * mul);
            p.bump = C.obstacle.smashBump;
            p.bumpKind = 'smash';
          }
          this.emit({ type: 'smash', participantId: p.id, segmentIndex: si, obstacleIndex: j, value: unstoppable ? 1 : 0 });
        } else {
          p.climbed++;
          p.bump = C.obstacle.climbBump;
          p.bumpKind = 'climb';
          this.emit({ type: 'climb', participantId: p.id, segmentIndex: si, obstacleIndex: j });
        }
      }
    }
  }

  private checkCoins(p: RaceParticipant, from: number, to: number) {
    const segs = this.state.track.segments;
    for (let si = p.segmentIndex; si <= Math.min(segs.length - 1, p.segmentIndex + 1); si++) {
      const s = segs[si];
      for (let j = 0; j < s.coins.length; j++) {
        const c = s.coins[j];
        if (c <= from || c > to) continue;
        if (p.current === s.recommended) {
          p.coins += C.coins.pickup;
          this.emit({ type: 'coin', participantId: p.id, segmentIndex: si, obstacleIndex: j });
        } else {
          this.emit({ type: 'coinMissed', participantId: p.id, segmentIndex: si, obstacleIndex: j });
        }
      }
    }
  }

  private checkDynamicEvents() {
    const s = this.state;
    const segs = s.track.segments;
    const leader = this.leaderPosition();
    let minIdx = Infinity;
    for (const p of s.participants) minIdx = Math.min(minIdx, p.segmentIndex);
    for (let i = minIdx; i < segs.length; i++) {
      const seg = segs[i];
      if (seg.start - leader > 400) break;
      const ev = seg.event;
      if (!ev || ev.triggered) continue;
      if (leader >= seg.start - ev.leadDistance) {
        ev.triggered = true;
        seg.terrain = ev.newTerrain;
        seg.recommended = TERRAINS[ev.newTerrain].best;
        seg.obstacles = ev.newObstacles;
        seg.coins = [];
        this.emit({ type: 'dynamicEvent', eventType: ev.type, segmentIndex: i, terrain: ev.newTerrain });
      }
    }
  }

  private updatePlaces() {
    const order = this.rules.liveOrder(this);
    order.forEach((p, i) => (p.place = i + 1));
  }

  estimateFinish(p: RaceParticipant): number {
    if (p.finishTime !== null) return p.finishTime;
    const remaining = Math.max(0, this.state.track.length - p.position);
    return this.state.time + remaining / Math.max(p.speed, this.difficulty.baseSpeed * 0.9);
  }

  private finishRace() {
    const s = this.state;
    if (s.phase === 'finished') return;
    if (this.mode.hasFinish && !s.endedByPlayer) {
      for (const p of s.participants) {
        if (!p.finished) p.finishTime = this.estimateFinish(p);
      }
    }
    const order = this.rules.finalOrder(this);
    order.forEach((p, i) => (p.place = i + 1));
    s.phase = 'finished';
    this.emit({ type: 'raceEnd' });
  }

  getResult(): RaceResult {
    const s = this.state;
    const order = [...s.participants].sort((a, b) => a.place - b.place);
    const results: ParticipantResult[] = order.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      kind: p.kind,
      seat: p.seat,
      place: p.place,
      finishTime: p.finishTime,
      distance: p.position,
      correctSegments: p.correctSegments,
      mistakes: p.mistakes,
      perfects: p.perfects,
      maxCombo: p.maxCombo,
      smashed: p.smashed,
      coins: p.coins,
      score: p.score,
      caught: p.caught,
      stars: this.rules.stars(this, p, p.place),
      used: { ...p.used },
      segmentsByArchetype: { ...p.segmentsByArchetype },
      abilitiesUsed: p.abilitiesUsed,
      loadout: {
        raptor: p.loadout.raptor.defId,
        spino: p.loadout.spino.defId,
        ankylo: p.loadout.ankylo.defId,
        trike: p.loadout.trike.defId,
        ptero: p.loadout.ptero.defId,
      },
    }));
    const res: RaceResult = { config: s.config, duration: s.time, results };
    if (s.team) {
      const o = this.teamOutcome();
      res.teamWon = o.won;
      res.teamScore = s.team.score;
      res.rivalTime = o.rivalTime;
      res.teamTime = o.teamTime;
    }
    return res;
  }
}
