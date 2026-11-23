import { sound } from '../../audio/sound';
import { GhostPlayer, GhostRecorder } from '../../game/ghost';
import { RaceEngine, type ParticipantSetup } from '../../game/raceEngine';
import { RaceRenderer } from '../../render/raceRenderer';
import type { Archetype, GameSettings, GhostData, RaceConfig, RaceEvent } from '../../types';

/** Debug/testing: `?timescale=4` speeds up the simulation. */
function debugTimeScale(): number {
  try {
    const v = Number(new URLSearchParams(location.search).get('timescale'));
    return Number.isFinite(v) && v >= 1 ? Math.min(20, Math.round(v)) : 1;
  } catch {
    return 1;
  }
}

/**
 * Owns one race: engine + renderer + audio + the animation loop. Handles
 * pause, app backgrounding and clean disposal (no race keeps running behind
 * another screen).
 */
export class RaceController {
  readonly engine: RaceEngine;
  readonly renderer: RaceRenderer;
  paused = false;
  private raf = 0;
  private last = 0;
  private disposed = false;
  private listeners = new Set<(events: RaceEvent[]) => void>();
  private onVisibility: () => void;
  private onResize: () => void;
  private resizeObs: ResizeObserver | null = null;
  private finishNotified = false;
  private readonly timeScale = debugTimeScale();
  onFinished: (() => void) | null = null;
  onPauseChange: ((p: boolean) => void) | null = null;
  /** Hook to adjust the engine before each update (tutorial). */
  beforeUpdate: (() => void) | null = null;

  /** Earlier best run shown as a translucent racer. */
  readonly ghost: GhostPlayer | null;
  private recorder: GhostRecorder | null = null;
  private recordId: string | null = null;

  constructor(
    container: HTMLElement,
    config: RaceConfig,
    participants: ParticipantSetup[],
    settings: GameSettings,
    ghost: { data: GhostData | null; record: boolean } = { data: null, record: false },
  ) {
    this.engine = new RaceEngine(config, participants);
    this.ghost = ghost.data ? new GhostPlayer(ghost.data) : null;
    const humans = participants.filter((p) => p.kind === 'human');
    if (ghost.record && humans.length === 1) {
      const rec = new GhostRecorder();
      const id = humans[0].id;
      this.recorder = rec;
      this.recordId = id;
      this.engine.onStep = () => {
        const p = this.engine.participant(id);
        if (p && !p.finished) rec.sample(this.engine.state.time, p.position, p.current);
      };
    }
    this.renderer = new RaceRenderer(container, this.engine, { reducedMotion: settings.reducedMotion, quality: settings.quality }, this.ghost);
    this.onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        this.pause();
        sound.suspend();
      } else {
        sound.resume();
        this.last = performance.now();
      }
    };
    this.onResize = () => this.renderer.resize();
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onVisibility);
    window.addEventListener('resize', this.onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => this.renderer.resize());
      this.resizeObs.observe(container);
    }
    sound.setMusic('race');
  }

  subscribe(fn: (events: RaceEvent[]) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      // clamp: after a long pause or tab switch there is no big jump
      const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      if (!this.paused) {
        this.beforeUpdate?.();
        // debug time-scale runs extra fixed steps (the engine clamps each update)
        let events = this.engine.update(dt);
        for (let k = 1; k < this.timeScale; k++) events = events.concat(this.engine.update(dt));
        if (events.length) {
          this.renderer.handleEvents(events);
          sound.handleRaceEvents(events, (id) => !!id && this.engine.participant(id)?.kind === 'human');
          for (const l of this.listeners) l(events);
        }
        this.renderer.render(dt);
        if (this.engine.state.phase === 'finished' && !this.finishNotified) {
          this.finishNotified = true;
          window.setTimeout(() => !this.disposed && this.onFinished?.(), 1800);
        }
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** The recorded run of the (single) human, if it reached the finish. */
  recordedGhost(): GhostData | null {
    if (!this.recorder || !this.recordId) return null;
    const p = this.engine.participant(this.recordId);
    if (!p || p.finishTime === null || p.caught) return null;
    this.recorder.sample(p.finishTime, this.engine.state.track.length, p.current);
    return this.recorder.finish(p.finishTime, p.name);
  }

  press(participantId: string, arch: Archetype): boolean {
    if (this.paused) return false;
    sound.unlock();
    return this.engine.requestSwitch(participantId, arch);
  }

  pause() {
    if (this.paused || this.engine.state.phase === 'finished') return;
    this.paused = true;
    this.onPauseChange?.(true);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.last = performance.now();
    this.onPauseChange?.(false);
  }

  endNow() {
    this.engine.endByPlayer();
    this.paused = false;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onVisibility);
    window.removeEventListener('resize', this.onResize);
    this.resizeObs?.disconnect();
    this.listeners.clear();
    this.renderer.dispose();
  }
}
