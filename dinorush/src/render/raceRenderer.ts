import * as THREE from 'three';
import { ARCHETYPE_INFO } from '../config/dinosaurs';
import { WORLDS } from '../config/worlds';
import type { GhostPlayer } from '../game/ghost';
import type { RaceEngine } from '../game/raceEngine';
import type { RaceEvent, RaceParticipant } from '../types';
import { animateDino, createPtero, createTrex, type DinoRig } from './dinoModels';
import { GhostVisual } from './ghostVisual';
import { Particles } from './particles';
import { RacerVisual } from './racerVisual';
import { racerHeading, racerLateral, TerrainField, TrackPath } from './trackPath';
import { TrackScene } from './trackScene';
import { nameTagTexture } from './textures';
import { disposeObject } from './util';
import { applyWorldLighting, WorldScenery } from './worldBuilder';

export interface RaceRendererOptions {
  reducedMotion: boolean;
  quality: 'low' | 'high';
}

/**
 * Renders a running RaceEngine on a meandering track through the world.
 * Reads engine state; never changes it.
 */
export class RaceRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private engine: RaceEngine;
  readonly path: TrackPath;
  private field: TerrainField;
  private track: TrackScene;
  private racers: RacerVisual[] = [];
  private world: WorldScenery;
  readonly particles: Particles;
  private trex: DinoRig | null = null;
  private trexRoar = 0;
  private trexLateral = 0;
  private ptero: DinoRig | null = null;
  private time = 0;
  private anchor = 0;
  private spread = 0;
  private shake = 0;
  private rain = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camInit = false;
  private opts: RaceRendererOptions;
  private container: HTMLElement;
  private tmp = new THREE.Vector3();
  private sun: THREE.DirectionalLight;
  private shadows: boolean;
  private ghost: GhostVisual | null = null;
  private ghostLane = 2;
  /** Smoothed running-surface height per racer (gorges). */
  private groundY = new Map<string, number>();
  private mistTimer = 0;

  constructor(container: HTMLElement, engine: RaceEngine, opts: RaceRendererOptions, ghost: GhostPlayer | null = null) {
    this.container = container;
    this.engine = engine;
    this.opts = opts;
    const high = opts.quality === 'high';
    this.renderer = new THREE.WebGLRenderer({ antialias: high, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 1.75 : 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.shadows = high;
    if (high) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.renderer.domElement.className = 'race-canvas';
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(50, 2, 0.5, 700);
    const s = engine.state;
    // a map location may tint the sky, fog and light and bring its own weather
    const world = { ...WORLDS[s.config.worldId], ...(s.config.look ?? {}) };
    const lights = applyWorldLighting(this.scene, world);
    this.sun = lights.sun;
    if (this.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      const sc = this.sun.shadow.camera;
      sc.left = -26;
      sc.right = 26;
      sc.top = 26;
      sc.bottom = -26;
      sc.near = 1;
      sc.far = 120;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.04;
    }
    this.path = new TrackPath(s.config.seed);
    this.field = new TerrainField(s.track, s.config.worldId, (s.config.seed % 1000) / 100);
    this.world = new WorldScenery(world, this.path, this.field);
    this.scene.add(this.world.group);
    const showDino = engine.difficulty.hintLevel !== 'minimal';
    this.track = new TrackScene(s.track, this.path, this.field, s.config.worldId, showDino, s.participants.map((p) => p.lane));
    this.scene.add(this.track.group);
    this.particles = new Particles(high ? 1600 : 800);
    this.particles.density = opts.reducedMotion ? 0.35 : high ? 1 : 0.6;
    this.scene.add(this.particles.points);
    for (const p of s.participants) {
      const rv = new RacerVisual(p, true, this.shadows);
      this.racers.push(rv);
      this.scene.add(rv.group);
    }
    if (s.trex) {
      this.trex = createTrex();
      const boss = s.config.boss;
      this.trex.root.scale.setScalar(boss ? 1.08 : 0.85);
      this.trex.root.traverse((o) => (o.castShadow = true));
      if (boss) {
        // the boss wears its name above the head
        const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTagTexture(boss, '#c0392b'), depthWrite: false, depthTest: false }));
        tag.scale.set(3.2, 0.9, 1);
        tag.position.y = this.trex.height + 0.8;
        tag.renderOrder = 20;
        this.trex.root.add(tag);
      }
      this.scene.add(this.trex.root);
    }
    if (ghost) {
      this.ghost = new GhostVisual(ghost);
      this.ghostLane = s.participants.find((p) => p.kind === 'human')?.lane ?? 2;
      this.scene.add(this.ghost.group);
    }
    if (s.team) {
      this.ptero = createPtero();
      this.scene.add(this.ptero.root);
    }
    this.anchor = this.anchorTarget();
    this.resize();
    this.render(0);
  }

  private humans(): RaceParticipant[] {
    return this.engine.state.participants.filter((p) => p.kind === 'human');
  }

  /** Camera follows the trailing human so everybody ahead stays in view. */
  private anchorTarget(): number {
    const hs = this.humans();
    const list = hs.length ? hs : this.engine.state.participants;
    let a = Math.min(...list.map((p) => p.position));
    const t = this.engine.state.trex;
    if (t && t.position > a - 22) a = Math.min(a, t.position + 3);
    return a;
  }

  private humanSpread(anchor: number): number {
    const hs = this.humans();
    if (hs.length < 2) return 0;
    return Math.max(...hs.map((p) => p.position)) - anchor;
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = this.camera.aspect < 1.4 ? 62 : this.camera.aspect < 1.9 ? 54 : 48;
    this.camera.updateProjectionMatrix();
    this.particles.setViewport(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  handleEvents(events: RaceEvent[]) {
    const s = this.engine.state;
    for (const e of events) {
      const idx = e.participantId ? s.participants.findIndex((p) => p.id === e.participantId) : -1;
      const p = idx >= 0 ? s.participants[idx] : null;
      const rv = idx >= 0 ? this.racers[idx] : null;
      const wp = rv ? rv.group.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
      switch (e.type) {
        case 'switch':
          if (rv && e.archetype) rv.startTransform(e.archetype, this.particles, wp);
          break;
        case 'perfect':
          this.particles.emit('sparkle', wp.x, wp.y + 1.8, wp.z, { count: 26, color: [0xffd32a, 0xffffff, 0xffe066] });
          this.particles.emit('ring', wp.x, wp.y + 0.4, wp.z, { color: 0xffd32a });
          break;
        case 'combo':
          if ((e.value ?? 0) % 5 === 0) this.particles.emit('confetti', wp.x, wp.y + 2.5, wp.z, { count: 24 });
          else this.particles.emit('sparkle', wp.x, wp.y + 1.8, wp.z, { count: 20, color: [0x7bed9f, 0xffffff, 0x70a1ff] });
          break;
        case 'comboCoins':
          this.particles.emit('coin', wp.x, wp.y + 2.5, wp.z, { count: 16 });
          break;
        case 'smash':
          if (p && e.segmentIndex !== undefined && e.obstacleIndex !== undefined) {
            const at = s.track.segments[e.segmentIndex].obstacles[e.obstacleIndex]?.at ?? p.position;
            const op = this.track.smash(e.segmentIndex, e.obstacleIndex, racerLateral(this.path, p.lane, at), (e.value ?? 0) > 0);
            if (op) {
              this.particles.emit('debris', op.x, 0.8, op.z, { count: 12 });
              this.particles.emit('dust', op.x, 0.5, op.z, { count: 8, scale: 1.6 });
            }
            this.addShake(0.18);
          }
          break;
        case 'climb':
          if (p && e.segmentIndex !== undefined && e.obstacleIndex !== undefined) {
            const at = s.track.segments[e.segmentIndex].obstacles[e.obstacleIndex]?.at ?? p.position;
            const op = this.track.climb(e.segmentIndex, e.obstacleIndex, racerLateral(this.path, p.lane, at));
            if (op) this.particles.emit('dust', op.x, 0.5, op.z, { count: 6 });
          }
          break;
        case 'coin':
        case 'coinMissed':
          if (p && e.segmentIndex !== undefined && e.obstacleIndex !== undefined) {
            const cp = this.track.coin(p.lane, e.segmentIndex, e.obstacleIndex, e.type === 'coin');
            if (cp && e.type === 'coin') this.particles.emit('coin', cp.x, 1.2, cp.z, { count: 6 });
          }
          break;
        case 'enterTerrain':
          if (e.terrain === 'water' || e.terrain === 'deepWater') this.particles.emit('splash', wp.x, 0.2, wp.z, { count: 26, scale: 1.4 });
          if (e.terrain === 'mud') this.particles.emit('mud', wp.x, 0.2, wp.z, { count: 12 });
          if (e.terrain === 'snow') this.particles.emit('dust', wp.x, 0.2, wp.z, { count: 12, color: 0xffffff });
          break;
        case 'abilityActivated':
          if (e.archetype) {
            const c = new THREE.Color(ARCHETYPE_INFO[e.archetype].color).getHex();
            this.particles.emit('ring', wp.x, wp.y + 0.3, wp.z, { color: c });
            this.particles.emit('sparkle', wp.x, wp.y + 1.4, wp.z, { count: 30, color: [c, 0xffffff] });
            if (e.archetype === 'spino') this.particles.emit('splash', wp.x, 0.3, wp.z, { count: 40, scale: 2 });
          }
          break;
        case 'dynamicEvent': {
          const seg = s.track.segments[e.segmentIndex ?? 0];
          this.world.invalidate(seg.start, seg.end);
          this.track.invalidate(seg.start - 4, seg.end + 4);
          if (e.eventType === 'quake') this.addShake(0.9);
          if (e.eventType === 'flood') this.rain = 3.5;
          for (const l of [-1, 0, 1]) {
            const q = this.path.sample(seg.start + 4, l * 3.4, this.tmp);
            if (e.eventType === 'snowfall') this.particles.emit('snow', q.x, 4, q.z, { count: 30 });
            else if (e.eventType === 'flood') this.particles.emit('splash', q.x, 0.4, q.z, { count: 25, scale: 1.4 });
            else this.particles.emit('dust', q.x, 1, q.z, { count: 14, scale: 2 });
          }
          break;
        }
        case 'finish':
          if (p && p.kind === 'human') this.particles.emit('confetti', wp.x, 3, wp.z, { count: 40 });
          break;
        case 'trexCatch':
          this.trexRoar = 1.2;
          break;
        case 'teamTurbo':
          for (const r of this.racers) {
            const q = r.group.getWorldPosition(new THREE.Vector3());
            this.particles.emit('sparkle', q.x, 1.8, q.z, { count: 18, color: [0x4facfe, 0xffffff, 0x00f2fe] });
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
    const target = this.anchorTarget();
    const k = Math.min(1, dt * 6 || 1);
    this.anchor += (target - this.anchor) * k;
    if (Math.abs(target - this.anchor) > 30) this.anchor = target;
    const spreadT = Math.min(70, this.humanSpread(this.anchor));
    this.spread += (spreadT - this.spread) * Math.min(1, dt * 1.5 || 1);

    let maxPos = this.anchor;
    s.participants.forEach((p, i) => {
      const rv = this.racers[i];
      // racers right in front of the camera (behind the followed player) would block the view
      rv.group.visible = p.kind === 'human' || p.position > this.anchor - 3;
      this.path.sample(p.position, racerLateral(this.path, p.lane, p.position), rv.group.position);
      // walkers go down into a gorge, the flyer stays above it
      const gy = p.current === 'ptero' ? 0 : this.field.trackY(p.position);
      const prevY = this.groundY.get(p.id) ?? gy;
      const y = prevY + (gy - prevY) * Math.min(1, dt * 6 || 1);
      this.groundY.set(p.id, y);
      rv.group.position.y = y;
      rv.group.rotation.y = -racerHeading(this.path, p.lane, p.position);
      const seg = s.track.segments[p.segmentIndex];
      rv.update(dt, this.time, p, seg.terrain, s.phase, this.particles, this.opts.reducedMotion);
      maxPos = Math.max(maxPos, p.position);
    });
    if (this.ghost) {
      const gp = this.ghost.positionAt(s.time);
      const lat = racerLateral(this.path, this.ghostLane, gp) + 1.3;
      this.path.sample(gp, lat, this.ghost.group.position);
      this.ghost.group.position.y = this.ghost.flying(s.time) ? 0 : this.field.trackY(gp);
      this.ghost.group.rotation.y = -racerHeading(this.path, this.ghostLane, gp);
      this.ghost.group.visible = gp > this.anchor - 2.5;
      this.ghost.update(dt, this.time, s.time, s.track, s.phase !== 'countdown');
    }
    const from = this.anchor - 45;
    const to = Math.min(Math.max(this.anchor + 200, maxPos + 40), this.anchor + 320);
    this.track.updateWindow(from, to);
    const focusP = this.humans()[0] ?? s.participants[0];
    this.track.update(dt, this.time, focusP.position, Math.max(focusP.speed, this.engine.difficulty.baseSpeed), this.engine.difficulty.warningTime, this.anchor - 9);

    // T-Rex runs behind the racers, towards the nearest one it can still catch
    if (this.trex && s.trex) {
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
      this.trexLateral += (racerLateral(this.path, targetLane, s.trex.position) - this.trexLateral) * Math.min(1, dt * 1.5);
      const tp = Math.max(this.anchor - 35, s.trex.position);
      this.path.sample(tp, this.trexLateral, this.trex.root.position);
      this.trex.root.position.y = this.field.trackY(tp);
      this.trex.root.rotation.y = -this.path.heading(tp);
      this.trexRoar = Math.max(0, this.trexRoar - dt);
      animateDino(this.trex, dt, s.phase === 'racing' ? s.trex.speed : 0, s.phase === 'racing' ? (this.trexRoar > 0 ? 'celebrate' : 'run') : 'idle', this.time);
    }
    if (this.ptero && s.team) {
      const rp = Math.max(this.anchor - 6, Math.min(this.anchor + 90, s.team.rivalPosition));
      this.path.sample(rp, Math.sin(this.time * 0.7) * 2.5, this.ptero.root.position);
      this.ptero.root.rotation.y = -this.path.heading(rp);
      animateDino(this.ptero, dt, 10, 'run', this.time);
    }

    // chase camera along the curve
    const trexMode = !!s.trex;
    const back = (trexMode ? 13 : 9.5) + this.spread * 0.22;
    const height = (trexMode ? 7.8 : 5.4) + this.spread * 0.2;
    const ahead = 13 + this.spread * 0.55;
    const humans = this.humans();
    const lat = humans.length ? humans.reduce((a, p) => a + racerLateral(this.path, p.lane, p.position), 0) / humans.length : 0;
    const desiredPos = this.path.sample(this.anchor - back, lat * 0.35, new THREE.Vector3());
    // in a gorge the camera dips a little so the racers stay in view
    const hs = this.humans();
    const dip = hs.length ? Math.min(0, ...hs.map((h) => this.groundY.get(h.id) ?? 0)) : 0;
    desiredPos.y = height + dip * 0.45;
    const look = this.path.sample(this.anchor + ahead, lat * 0.25, new THREE.Vector3());
    look.y = 1.2 + dip * 0.7;
    // mist rising from gorges ahead
    this.mistTimer += dt;
    if (this.mistTimer > 0.12 && !this.opts.reducedMotion) {
      this.mistTimer = 0;
      const md = this.anchor + 8 + Math.random() * 40;
      if (this.field.trackY(md) < -1.2) {
        const q = this.path.sample(md, (Math.random() - 0.5) * 16, this.tmp);
        this.particles.emit('dust', q.x, this.field.trackY(md) + 0.4, q.z, { count: 2, color: [0xffffff, 0xe8f1ff], scale: 2.2 });
      }
    }
    if (!this.camInit) {
      this.camPos.copy(desiredPos);
      this.camLook.copy(look);
      this.camInit = true;
    }
    const kc = Math.min(1, dt * 4 || 1);
    this.camPos.lerp(desiredPos, kc);
    this.camLook.lerp(look, kc);
    if (this.camPos.distanceTo(desiredPos) > 25) this.camPos.copy(desiredPos);
    if (this.camLook.distanceTo(look) > 25) this.camLook.copy(look);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    this.camera.lookAt(this.camLook);
    if (this.shadows) {
      // keep the shadow camera centred on the action
      const c = this.path.sample(this.anchor + 10, 0, this.tmp);
      this.sun.target.position.set(c.x, 0, c.z);
      this.sun.position.set(c.x - 18, 40, c.z + 14);
      this.sun.target.updateMatrixWorld();
    }

    if (this.rain > 0 && !this.opts.reducedMotion) {
      this.rain -= dt;
      for (let i = 0; i < 3; i++) {
        const q = this.path.sample(this.anchor + Math.random() * 40, (Math.random() - 0.5) * 24, this.tmp);
        this.particles.emit('splash', q.x, 9, q.z, { count: 1, color: 0xbfe9ff, scale: 0.6 });
      }
    }

    this.world.update(from, to, this.camera, dt, this.time, this.particles, !this.opts.reducedMotion);
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
    v.y += rv.activeRig.height + 0.9;
    v.project(this.camera);
    out.x = ((v.x + 1) / 2) * this.container.clientWidth;
    out.y = ((1 - v.y) / 2) * this.container.clientHeight;
    out.visible = v.z < 1;
    return out;
  }

  dispose() {
    this.track.dispose();
    for (const r of this.racers) r.dispose();
    this.ghost?.dispose();
    if (this.trex) disposeObject(this.trex.root);
    if (this.ptero) disposeObject(this.ptero.root);
    this.world.dispose();
    this.particles.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
