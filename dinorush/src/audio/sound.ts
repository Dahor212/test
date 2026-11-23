/**
 * Synthesised sound effects and a tiny music sequencer (Web Audio API).
 * No audio files – everything is generated, so the game works offline.
 * Audio starts only after a user gesture (mobile browser requirement).
 */
import type { RaceEvent } from '../types';

export type SfxName =
  | 'tap'
  | 'countdown'
  | 'go'
  | 'switch'
  | 'correct'
  | 'perfect'
  | 'wrong'
  | 'smash'
  | 'climb'
  | 'splash'
  | 'combo'
  | 'coin'
  | 'warning'
  | 'ability'
  | 'finish'
  | 'victory'
  | 'egg-crack'
  | 'egg-hatch'
  | 'buy'
  | 'trex'
  | 'event'
  | 'team';

const NOTES: Record<string, number> = {};
const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
for (let o = 2; o <= 7; o++) {
  names.forEach((n, i) => {
    NOTES[`${n}${o}`] = 440 * Math.pow(2, (o - 4) + (i - 9) / 12);
  });
}
const N = (n: string) => NOTES[n] ?? 440;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private volume = 0.7;
  private sfxOn = true;
  private musicOn = true;
  private musicTheme: 'menu' | 'race' | null = null;
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private lastPlay = new Map<string, number>();

  configure(s: { volume: number; sfx: boolean; music: boolean }) {
    this.volume = s.volume;
    this.sfxOn = s.sfx;
    this.musicOn = s.music;
    if (this.master) this.master.gain.value = this.volume * 0.8;
    if (this.musicBus) this.musicBus.gain.value = this.musicOn ? 0.22 : 0;
    if (!this.musicOn) this.stopScheduler();
    else if (this.musicTheme && this.ctx) this.startScheduler();
  }

  /** Call from a pointer/keyboard handler. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume * 0.8;
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        this.master.connect(comp).connect(this.ctx.destination);
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = 0.9;
        this.sfxBus.connect(this.master);
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = this.musicOn ? 0.22 : 0;
        this.musicBus.connect(this.master);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      if (this.musicTheme && this.musicOn) this.startScheduler();
    } catch {
      this.ctx = null;
    }
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, bus: GainNode | null, slideTo?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(bus ?? this.sfxBus!);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  private noise(start: number, dur: number, gain: number, filter: BiquadFilterType, f0: number, f1?: number, q = 1) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = filter;
    flt.frequency.setValueAtTime(f0, start);
    if (f1) flt.frequency.exponentialRampToValueAtTime(f1, start + dur);
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(flt).connect(g).connect(this.sfxBus!);
    src.start(start);
    src.stop(start + dur + 0.05);
  }

  play(name: SfxName) {
    if (!this.sfxOn || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // rate-limit repeated sounds (e.g. coins from three racers)
    const last = this.lastPlay.get(name) ?? -1;
    if (now - last < (name === 'coin' ? 0.05 : 0.03)) return;
    this.lastPlay.set(name, now);
    const t = now + 0.005;
    switch (name) {
      case 'tap':
        this.tone(660, t, 0.06, 'triangle', 0.15, null);
        break;
      case 'countdown':
        this.tone(N('A4'), t, 0.25, 'square', 0.12, null);
        break;
      case 'go':
        [N('C5'), N('E5'), N('G5'), N('C6')].forEach((f, i) => this.tone(f, t + i * 0.05, 0.4, 'square', 0.1, null));
        break;
      case 'switch':
        this.noise(t, 0.18, 0.18, 'bandpass', 600, 3000, 2);
        this.tone(N('G5'), t, 0.1, 'triangle', 0.12, null, N('C6'));
        break;
      case 'correct':
        this.tone(N('E5'), t, 0.1, 'triangle', 0.14, null);
        this.tone(N('A5'), t + 0.08, 0.14, 'triangle', 0.14, null);
        break;
      case 'perfect':
        [N('C6'), N('E6'), N('G6'), N('C7')].forEach((f, i) => this.tone(f, t + i * 0.05, 0.22, 'sine', 0.16, null));
        this.tone(N('C5'), t, 0.35, 'triangle', 0.12, null);
        break;
      case 'wrong':
        this.tone(N('D4'), t, 0.18, 'triangle', 0.12, null, N('A3'));
        this.tone(N('A3'), t + 0.12, 0.22, 'triangle', 0.1, null, N('F3'));
        break;
      case 'smash':
        this.noise(t, 0.35, 0.5, 'lowpass', 1500, 120, 1);
        this.tone(90, t, 0.25, 'sine', 0.35, null, 45);
        break;
      case 'climb':
        this.tone(220, t, 0.12, 'sine', 0.2, null, 380);
        break;
      case 'splash':
        this.noise(t, 0.4, 0.25, 'bandpass', 2500, 500, 1.5);
        break;
      case 'combo':
        [N('C5'), N('E5'), N('G5'), N('B5'), N('D6')].forEach((f, i) => this.tone(f, t + i * 0.06, 0.18, 'square', 0.08, null));
        break;
      case 'coin':
        this.tone(N('B5'), t, 0.07, 'square', 0.08, null);
        this.tone(N('E6'), t + 0.06, 0.16, 'square', 0.08, null);
        break;
      case 'warning':
        this.tone(N('E5'), t, 0.08, 'sine', 0.12, null);
        this.tone(N('E5'), t + 0.12, 0.08, 'sine', 0.12, null);
        break;
      case 'ability':
        this.tone(N('C4'), t, 0.5, 'sawtooth', 0.08, null, N('C6'));
        this.noise(t, 0.5, 0.12, 'highpass', 800, 4000, 1);
        break;
      case 'finish':
        [N('G5'), N('C6')].forEach((f, i) => this.tone(f, t + i * 0.1, 0.3, 'triangle', 0.14, null));
        break;
      case 'victory':
        [N('C5'), N('E5'), N('G5'), N('C6'), N('G5'), N('C6'), N('E6')].forEach((f, i) => this.tone(f, t + i * 0.12, 0.25, 'square', 0.09, null));
        break;
      case 'egg-crack':
        for (let i = 0; i < 3; i++) this.noise(t + i * 0.07, 0.05, 0.35, 'highpass', 2000, undefined, 1);
        break;
      case 'egg-hatch':
        [N('G4'), N('C5'), N('E5'), N('G5'), N('C6')].forEach((f, i) => this.tone(f, t + i * 0.09, 0.4, 'triangle', 0.13, null));
        this.noise(t, 0.3, 0.2, 'bandpass', 3000, 6000, 1);
        break;
      case 'buy':
        this.tone(N('E6'), t, 0.08, 'square', 0.1, null);
        this.tone(N('A6'), t + 0.07, 0.2, 'square', 0.1, null);
        break;
      case 'trex':
        this.tone(120, t, 0.6, 'sawtooth', 0.12, null, 70);
        this.noise(t, 0.6, 0.15, 'lowpass', 600, 200, 1);
        break;
      case 'event':
        this.tone(N('A4'), t, 0.15, 'triangle', 0.14, null);
        this.tone(N('D5'), t + 0.15, 0.25, 'triangle', 0.14, null);
        break;
      case 'team':
        [N('D5'), N('F#5'), N('A5'), N('D6')].forEach((f, i) => this.tone(f, t + i * 0.05, 0.3, 'sine', 0.14, null));
        break;
    }
  }

  // ------------------------------------------------------------------------
  // Music
  // ------------------------------------------------------------------------

  setMusic(theme: 'menu' | 'race' | null) {
    this.musicTheme = theme;
    if (!theme) this.stopScheduler();
    else if (this.ctx && this.musicOn) this.startScheduler();
  }

  private startScheduler() {
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.musicTimer = window.setInterval(() => this.schedule(), 60);
  }

  private stopScheduler() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private schedule() {
    if (!this.ctx || !this.musicTheme || this.ctx.state !== 'running') return;
    const race = this.musicTheme === 'race';
    const bpm = race ? 132 : 100;
    const stepDur = 60 / bpm / 2;
    const melody = race
      ? ['C5', '', 'E5', 'G5', 'A5', '', 'G5', 'E5', 'D5', '', 'E5', 'G5', 'C5', '', '', '', 'A4', '', 'C5', 'D5', 'E5', '', 'D5', 'C5', 'D5', '', 'G4', '', 'C5', '', '', '']
      : ['E5', '', 'G5', '', 'A5', '', 'G5', '', 'E5', '', 'D5', '', 'C5', '', '', '', 'D5', '', 'E5', '', 'G5', '', 'E5', '', 'D5', '', 'C5', '', 'D5', '', '', ''];
    const bass = race ? ['C3', 'C3', 'A2', 'A2', 'F2', 'F2', 'G2', 'G2'] : ['C3', 'A2', 'F2', 'G2'];
    while (this.nextNoteTime < this.ctx.currentTime + 0.25) {
      const i = this.step % melody.length;
      const m = melody[i];
      if (m) this.tone(N(m), this.nextNoteTime, stepDur * 1.6, 'triangle', 0.18, this.musicBus);
      if (i % 4 === 0) {
        const b = bass[Math.floor(i / 4) % bass.length];
        this.tone(N(b), this.nextNoteTime, stepDur * 3.5, 'sine', 0.3, this.musicBus);
      }
      if (race && i % 2 === 0) {
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 7000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.06, this.nextNoteTime);
        g.gain.exponentialRampToValueAtTime(0.0001, this.nextNoteTime + 0.05);
        src.connect(f).connect(g).connect(this.musicBus!);
        src.start(this.nextNoteTime);
        src.stop(this.nextNoteTime + 0.06);
      }
      this.nextNoteTime += stepDur;
      this.step++;
    }
  }

  /** Map race events to sounds. Only human-related events are audible to avoid noise. */
  handleRaceEvents(events: RaceEvent[], isHuman: (id?: string) => boolean) {
    for (const e of events) {
      const h = isHuman(e.participantId);
      switch (e.type) {
        case 'countdown':
          this.play('countdown');
          break;
        case 'start':
          this.play('go');
          break;
        case 'switch':
          if (h) this.play('switch');
          break;
        case 'perfect':
          if (h) this.play('perfect');
          break;
        case 'segmentSuccess':
          if (h) this.play('correct');
          break;
        case 'segmentMistake':
          if (h) this.play('wrong');
          break;
        case 'combo':
          if (h) this.play('combo');
          break;
        case 'coin':
        case 'comboCoins':
          if (h) this.play('coin');
          break;
        case 'smash':
          if (h) this.play('smash');
          break;
        case 'climb':
          if (h) this.play('climb');
          break;
        case 'enterTerrain':
          if (h && (e.terrain === 'water' || e.terrain === 'deepWater')) this.play('splash');
          break;
        case 'warning':
          if (h) this.play('warning');
          break;
        case 'abilityActivated':
          if (h) this.play('ability');
          break;
        case 'finish':
          if (h) this.play('finish');
          break;
        case 'dynamicEvent':
          this.play('event');
          break;
        case 'trexCatch':
          this.play('trex');
          break;
        case 'teamTurbo':
          this.play('team');
          break;
        default:
          break;
      }
    }
  }
}

export const sound = new SoundEngine();
