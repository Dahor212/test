import * as THREE from 'three';
import { ARCHETYPE_INFO } from '../config/dinosaurs';
import { GAME_CONFIG } from '../config/gameConfig';
import { WORLDS } from '../config/worlds';
import type { RaceEngine } from '../game/raceEngine';
import type { RaceEvent, RaceParticipant } from '../types';
import { animateDino, createPtero, createTrex, type DinoRig } from './dinoModels';
import { Particles } from './particles';
import { RacerVisual } from './racerVisual';
import { LaneTrack, laneX } from './trackRenderer';
import { disposeObject } from './util';
import { applyWorldLighting, WorldScenery } from './worldBuilder';

export interface RaceRendererOptions {
  reducedMotion: boolean;
  quality: 'low' | 'high';
}

/** Soft, order-preserving compression of distances around the focus. */
export function compressSpread(rel: number): number {
  const { softSpread: s, maxSpread: m } = GAME_CONFIG.camera;
  const a = Math.abs(rel);
  if (a <= s) return rel;
  return Math.sign(rel) * (s + (m - s) * Math.tanh((a - s) / (m - s)));
}

/**
 * Renders a running RaceEngine. Reads engine state; never changes it.
 */
export class RaceRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private engine: RaceEngine;
  private lanes: LaneTrack[] = [];
  private racers: RacerVisual[] = [];
  private world: WorldScenery;
  readonly particles: Particles;
  private trex: DinoRig | null = null;
  private trexRoar = 0;
  private trexX = 0;
  private ptero: DinoRig | null = null;
  private time = 0;
  private focus = 0;
  private shake = 0;
  private rain = 0;
  private camPos = new THREE.Vector3(0, 9, 14);
  private camLook = new THREE.Vector3();
  private opts: RaceRendererOptions;
  private container: HTMLElement;
  private tmp = new THREE.Vector3();
  private lastSpread = 0;

  constructor(container: HTMLElement, engine: RaceEngine, opts: RaceRendererOptions) {
    this.container = container;
    this.engine = engine;
    this.opts = opts;
    const high = opts.quality === 'high';
    this.renderer = new THREE.WebGLRenderer({ antialias: high, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 1.75 : 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'race-canvas';
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(46, 2, 0.5, 520);
    const s = engine.state;
    const world = WORLDS[s.config.worldId];
    applyWorldLighting(this.scene, world);
    this.world = new WorldScenery(world);
    this.scene.add(this.world.group);
    this.particles = new Particles(high ? 1600 : 800);
    this.particles.density = opts.reducedMotion ? 0.35 : high ? 1 : 0.6;
    this.scene.add(this.particles.points);
    const showDino = engine.difficulty.hintLevel !== 'minimal';
    s.participants.forEach((p) => {
      const lane = new LaneTrack(p.lane, s.track, s.config.worldId, showDino);
      this.lanes.push(lane);
      this.scene.add(lane.group);
      const rv = new RacerVisual(p, true);
      this.racers.push(rv);
      lane.group.add(rv.group);
    });
    if (s.trex) {
      this.trex = createTrex();
      this.scene.add(this.trex.root);
    }
    if (s.team) {
      this.ptero = createPtero();
      this.scene.add(this.ptero.root);
    }
    this.focus = this.focusTarget();
    this.resize();
    this.render(0);
  }

  private humans(): RaceParticipant[] {
    return this.engine.state.participants.filter((p) => p.kind === 'human');
  }

  private focusTarget(): number {
    const hs = this.humans();
    const list = hs.length ? hs : this.engine.state.participants;
    return list.reduce((a, p) => a + p.position, 0) / list.length;
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the three lanes in view on narrow screens
    this.camera.fov = this.camera.aspect < 1.4 ? 58 : this.camera.aspect < 1.9 ? 50 : 44;
    this.camera.updateProjectionMatrix();
    this.particles.setViewport(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  handleEvents(events: RaceEvent[]) {
    const s = this.engine.state;
    for (const e of events) {
      const idx = e.participantId ? s.participants.findIndex((p) => p.id === e.participantId) : -1;
      const p = idx >= 0 ? s.participants[idx] : null;
      const rv = idx >= 0 ? this.racers[idx] : null;
      const lane = idx >= 0 ? this.lanes[idx] : null;
      const wp = rv ? rv.group.getWorldPosition(this.tmp.clone()) : new THREE.Vector3();
      switch (e.type) {
        case 'switch':
          if (rv && e.archetype) rv.startTransform(e.archetype, this.particles, wp);
          break;
        case 'perfect':
          this.particles.emit('sparkle', wp.x, wp.y + 1.5, wp.z, { count: 26, color: [0xffd32a, 0xffffff, 0xffe066] });
          this.particles.emit('ring', wp.x, wp.y + 0.4, wp.z, { color: 0xffd32a });
          break;
        case 'combo':
          if ((e.value ?? 0) % 5 === 0) this.particles.emit('confetti', wp.x, wp.y + 2, wp.z, { count: 24 });
          else this.particles.emit('sparkle', wp.x, wp.y + 1.5, wp.z, { count: 20, color: [0x7bed9f, 0xffffff, 0x70a1ff] });
          break;
        case 'comboCoins':
          this.particles.emit('coin', wp.x, wp.y + 2, wp.z, { count: 16 });
          break;
        case 'smash':
          if (lane && e.segmentIndex !== undefined && e.obstacleIndex !== undefined) {
            const op = lane.smash(e.segmentIndex, e.obstacleIndex, (e.value ?? 0) > 0);
            if (op) {
              this.particles.emit('debris', op.x, 0.8, op.z, { count: 12 });
              this.particles.emit('dust', op.x, 0.5, op.z, { count: 8, scale: 1.6 });
            }
            if (rv) rv.smashT = 0.3;
            this.addShake(0.18);
          }
          break;
        case 'climb':
          if (lane && e.segmentIndex !== undefined && e.obstacleIndex !== undefined) {
            const op = lane.climb(e.segmentIndex, e.obstacleIndex);
            if (op) this.particles.emit('dust', op.x, 0.5, op.z, { count: 6 });
          }
          break;
        case 'coin':
        case 'coinMissed':
          if (lane && e.segmentIndex !== undefined && e.obstacleIndex !== undefined) {
            const cp = lane.coin(e.segmentIndex, e.obstacleIndex, e.type === 'coin');
            if (cp && e.type === 'coin') this.particles.emit('coin', cp.x, cp.y, cp.z, { count: 6 });
          }
          break;
        case 'enterTerrain':
          if (e.terrain === 'water' || e.terrain === 'deepWater') this.particles.emit('splash', wp.x, 0.2, wp.z, { count: 22, scale: 1.3 });
          if (e.terrain === 'mud') this.particles.emit('mud', wp.x, 0.2, wp.z, { count: 10 });
          if (e.terrain === 'snow') this.particles.emit('dust', wp.x, 0.2, wp.z, { count: 10, color: 0xffffff });
          break;
        case 'abilityActivated':
          if (e.archetype) {
            const c = new THREE.Color(ARCHETYPE_INFO[e.archetype].color).getHex();
            this.particles.emit('ring', wp.x, wp.y + 0.3, wp.z, { color: c });
            this.particles.emit('sparkle', wp.x, wp.y + 1.2, wp.z, { count: 30, color: [c, 0xffffff] });
            if (e.archetype === 'spino') this.particles.emit('splash', wp.x, 0.3, wp.z, { count: 40, scale: 2 });
          }
          break;
        case 'dynamicEvent': {
          const seg = s.track.segments[e.segmentIndex ?? 0];
          const z = -seg.start;
          if (e.eventType === 'quake') this.addShake(0.9);
          if (e.eventType === 'flood') this.rain = 3.5;
          for (let l = 0; l < this.lanes.length; l++) {
            const x = laneX(l);
            const lz = z + this.lanes[l].group.position.z;
            if (e.eventType === 'snowfall') this.particles.emit('snow', x, 4, lz, { count: 30 });
            else if (e.eventType === 'flood') this.particles.emit('splash', x, 0.4, lz - 5, { count: 25, scale: 1.4 });
            else this.particles.emit('dust', x, 1, lz - 5, { count: 14, scale: 2 });
          }
          break;
        }
        case 'finish':
          if (p && p.kind === 'human') this.particles.emit('confetti', wp.x, 3, wp.z - 2, { count: 40 });
          break;
        case 'trexCatch':
          this.trexRoar = 1.2;
          break;
        case 'teamTurbo':
          for (const r of this.racers) {
            const q = r.group.getWorldPosition(new THREE.Vector3());
            this.particles.emit('sparkle', q.x, 1.5, q.z, { count: 18, color: [0x4facfe, 0xffffff, 0x00f2fe] });
          }
          break;
        default:
          break;
      }
    }
  }

  private addShake(amount: number) {
    if (this.opts.reducedMotion) return;
    this.shake = Math.max(this.shake, amount);
  }

  render(dt: number) {
    const s = this.engine.state;
    this.time += dt;
    const target = this.focusTarget();
    this.focus += (target - this.focus) * Math.min(1, dt * 8 || 1);
    if (Math.abs(target - this.focus) > 40) this.focus = target;
    const focus = this.focus;
    let minD = 0;
    let maxD = 0;
    s.participants.forEach((p, i) => {
      const rel = p.position - focus;
      const disp = compressSpread(rel);
      minD = Math.min(minD, disp);
      maxD = Math.max(maxD, disp);
      const lane = this.lanes[i];
      lane.group.position.z = rel - disp;
      const rv = this.racers[i];
      rv.group.position.z = -p.position;
      const seg = s.track.segments[p.segmentIndex];
      rv.update(dt, this.time, p, seg.terrain, s.phase, this.particles, this.opts.reducedMotion);
      lane.updateWindow(p.position - 40, p.position + 170);
      lane.update(dt, this.time, p.position, p.speed, this.engine.difficulty.warningTime);
    });
    const spread = maxD - minD;
    this.lastSpread += (spread - this.lastSpread) * Math.min(1, dt * 2);

    // T-Rex
    if (this.trex && s.trex) {
      const rel = Math.max(-28, Math.min(30, s.trex.position - focus));
      let targetLane = 1;
      let best = Infinity;
      for (const p of s.participants) {
        if (p.caught || p.finished) continue;
        const d = p.position - s.trex.position;
        if (d >= -2 && d < best) {
          best = d;
          targetLane = p.lane;
        }
      }
      this.trexX += (laneX(targetLane) - this.trexX) * Math.min(1, dt * 1.5);
      this.trex.root.position.set(this.trexX, 0, -(focus + rel));
      this.trexRoar = Math.max(0, this.trexRoar - dt);
      animateDino(this.trex, dt, s.phase === 'racing' ? s.trex.speed : 0, s.phase === 'racing' ? (this.trexRoar > 0 ? 'celebrate' : 'run') : 'idle', this.time);
      this.trex.root.visible = true;
    }
    if (this.ptero && s.team) {
      const rel = Math.max(-6, Math.min(70, s.team.rivalPosition - focus));
      this.ptero.root.position.set(Math.sin(this.time * 0.7) * 2, 0, -(focus + rel));
      animateDino(this.ptero, dt, 10, 'run', this.time);
    }

    // camera
    const trexMode = !!s.trex;
    const D = (trexMode ? 17 : 12.5) + this.lastSpread * 0.25;
    const H = (trexMode ? 10.5 : 8.2) + this.lastSpread * 0.12;
    const L = 17;
    const desiredPos = new THREE.Vector3(0, H, -focus + D);
    const look = new THREE.Vector3(0, 0.8, -(focus + L));
    const k = Math.min(1, dt * 5 || 1);
    this.camPos.lerp(desiredPos, k);
    if (Math.abs(this.camPos.z - desiredPos.z) > 30) this.camPos.copy(desiredPos);
    this.camLook.lerp(look, k);
    if (Math.abs(this.camLook.z - look.z) > 30) this.camLook.copy(look);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    this.camera.lookAt(this.camLook);

    // rain for flood events
    if (this.rain > 0 && !this.opts.reducedMotion) {
      this.rain -= dt;
      for (let i = 0; i < 3; i++) this.particles.emit('splash', (Math.random() - 0.5) * 24, 9, -focus - Math.random() * 40, { count: 1, color: 0xbfe9ff, scale: 0.6 });
    }

    this.world.update(focus, this.camera, dt, this.time, this.particles, !this.opts.reducedMotion);
    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Screen coordinates (CSS px, relative to container) above a racer. */
  screenPosition(participantId: string, out: { x: number; y: number; visible: boolean }) {
    const idx = this.engine.state.participants.findIndex((p) => p.id === participantId);
    if (idx < 0) {
      out.visible = false;
      return out;
    }
    const rv = this.racers[idx];
    const v = rv.group.getWorldPosition(this.tmp);
    v.y += 3.4;
    v.project(this.camera);
    out.x = ((v.x + 1) / 2) * this.container.clientWidth;
    out.y = ((1 - v.y) / 2) * this.container.clientHeight;
    out.visible = v.z < 1;
    return out;
  }

  dispose() {
    for (const l of this.lanes) l.dispose();
    for (const r of this.racers) r.dispose();
    if (this.trex) disposeObject(this.trex.root);
    if (this.ptero) disposeObject(this.ptero.root);
    this.world.dispose();
    this.particles.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
