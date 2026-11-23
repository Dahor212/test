import { useSyncExternalStore } from 'react';
import { sound } from '../audio/sound';
import { randomSeed } from '../core/rng';
import { buildParticipants, buildRaceConfig } from '../game/setup';
import type { ParticipantSetup } from '../game/raceEngine';
import { cloneProfile, createDefaultProfile } from '../progression/profile';
import { completeCup, createCup, cupSeed, recordCupRace, type CupRewards } from '../progression/cup';
import { applyRaceResult, type RewardSummary } from '../progression/rewards';
import { clearSave, loadSave, writeSave } from '../progression/storage';
import { baseLoadout } from '../progression/rpg';
import type { GameSettings, PlayerProfile, RaceConfig, RaceResult, RaceSetup } from '../types';

/**
 * Top-level application state machine.
 * MENU → RACE_SETUP(steps) → RACE (COUNTDOWN/RACING/PAUSED/FINISHED inside)
 * → REWARDS → (CUP_STANDINGS) → MENU; side screens: COLLECTION,
 * EGG_HATCHING, DINO_PARK, MISSIONS, SETTINGS. TUTORIAL is a RACE with a
 * scripted track.
 */
export type Screen =
  | 'MENU'
  | 'RACE_SETUP'
  | 'TUTORIAL'
  | 'RACE'
  | 'REWARDS'
  | 'CUP_STANDINGS'
  | 'COLLECTION'
  | 'EGG_HATCHING'
  | 'DINO_PARK'
  | 'MISSIONS'
  | 'SETTINGS';

export type SetupStep = 'mode' | 'players' | 'world' | 'difficulty' | 'lineup';

export interface RaceSession {
  id: number;
  config: RaceConfig;
  participants: ParticipantSetup[];
  setup: RaceSetup;
  tutorial: boolean;
}

export interface LastResult {
  result: RaceResult;
  rewards: RewardSummary;
  cupRewards?: CupRewards;
  tutorial: boolean;
}

export interface Toast {
  id: number;
  text: string;
  icon: string;
}

export interface AppState {
  screen: Screen;
  setupStep: SetupStep;
  profile: PlayerProfile;
  settings: GameSettings;
  setup: RaceSetup;
  race: RaceSession | null;
  last: LastResult | null;
  toasts: Toast[];
  showTutorialOffer: boolean;
}

type Listener = () => void;

function initialSetup(profile: PlayerProfile, settings: GameSettings): RaceSetup {
  const l = profile.lastSetup;
  return {
    mode: l?.mode ?? 'classic',
    humans: l?.humans ?? 1,
    names: profile.players.map((p) => p.name),
    worldId: l?.worldId ?? 'jungle',
    difficulty: l?.difficulty ?? settings.defaultDifficulty,
  };
}

class Store {
  private state: AppState;
  private listeners = new Set<Listener>();
  private saveTimer: number | null = null;
  private raceCounter = 0;
  private toastId = 0;

  constructor() {
    const save = loadSave();
    this.state = {
      screen: 'MENU',
      setupStep: 'mode',
      profile: save.profile,
      settings: save.settings,
      setup: initialSetup(save.profile, save.settings),
      race: null,
      last: null,
      toasts: [],
      showTutorialOffer: !save.profile.tutorialDone,
    };
    sound.configure(save.settings);
  }

  get = () => this.state;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  set(partial: Partial<AppState>) {
    this.state = { ...this.state, ...partial };
    for (const l of this.listeners) l();
  }

  private persistSoon() {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.persistNow(), 150);
  }

  persistNow() {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    writeSave({ version: 2, profile: this.state.profile, settings: this.state.settings });
  }

  /** Immutable profile update: clone → mutate → store → persist. */
  updateProfile<T>(fn: (draft: PlayerProfile) => T): T {
    const draft = cloneProfile(this.state.profile);
    const out = fn(draft);
    this.set({ profile: draft });
    this.persistSoon();
    return out;
  }

  updateSettings(partial: Partial<GameSettings>) {
    const settings = { ...this.state.settings, ...partial };
    this.set({ settings });
    sound.configure(settings);
    this.persistSoon();
  }

  go(screen: Screen) {
    this.set({ screen });
  }

  toast(text: string, icon = 'star') {
    const t = { id: ++this.toastId, text, icon };
    this.set({ toasts: [...this.state.toasts, t] });
    window.setTimeout(() => this.set({ toasts: this.state.toasts.filter((x) => x.id !== t.id) }), 3200);
  }

  updateSetup(partial: Partial<RaceSetup>) {
    this.set({ setup: { ...this.state.setup, ...partial } });
  }

  startSetup() {
    this.set({ screen: 'RACE_SETUP', setupStep: 'mode', setup: initialSetup(this.state.profile, this.state.settings) });
  }

  /** Build a race session from the current setup. */
  startRace(seed?: number, setupOverride?: RaceSetup) {
    const setup = { ...(setupOverride ?? this.state.setup) };
    if (setup.mode === 'cup') return this.startCupRace(setup);
    const raceSeed = seed ?? randomSeed();
    // remember names + last setup
    this.updateProfile((p) => {
      setup.names.forEach((n, i) => {
        if (p.players[i] && n.trim()) p.players[i].name = n.trim().slice(0, 14);
      });
      p.lastSetup = { ...setup, names: [...setup.names] };
    });
    const participants = buildParticipants(setup, this.state.profile, raceSeed);
    const config = buildRaceConfig(setup, raceSeed);
    this.set({
      race: { id: ++this.raceCounter, config, participants, setup, tutorial: false },
      screen: 'RACE',
    });
  }

  /** Dino Cup: creates the cup on the first race, then plays race n of 5. */
  startCupRace(setupIn?: RaceSetup) {
    let cup = this.state.profile.activeCup;
    const base = setupIn ?? this.state.setup;
    if (!cup || cup.finished) {
      const baseSeed = randomSeed();
      const parts = buildParticipants({ ...base, mode: 'cup' }, this.state.profile, baseSeed);
      const created = createCup(base.difficulty, base.worldId, base.humans, parts, baseSeed);
      this.updateProfile((p) => {
        base.names.forEach((n, i) => {
          if (p.players[i] && n.trim()) p.players[i].name = n.trim().slice(0, 14);
        });
        p.activeCup = created;
        p.lastSetup = { ...base, mode: 'cup', names: [...base.names] };
      });
      cup = created;
    }
    const names = Array.from({ length: cup.humans }, (_, i) => cup!.names[`p${i}`] ?? this.state.profile.players[i].name);
    const setup: RaceSetup = { mode: 'cup', humans: cup.humans as 1 | 2 | 3, names, worldId: cup.worlds[cup.raceIndex], difficulty: cup.difficulty };
    const participants = buildParticipants(setup, this.state.profile, cup.baseSeed).map((p) => ({ ...p, name: cup!.names[p.id] ?? p.name }));
    const config = buildRaceConfig(setup, cupSeed(cup));
    this.set({ race: { id: ++this.raceCounter, config, participants, setup, tutorial: false }, screen: 'RACE' });
  }

  abandonCup() {
    this.updateProfile((p) => (p.activeCup = null));
  }

  /** Called by the race screen when the engine reports the end. */
  finishRace(result: RaceResult) {
    const race = this.state.race;
    if (!race) return;
    let cupRewards: CupRewards | undefined;
    const rewards = this.updateProfile((p) => {
      const sum = applyRaceResult(p, result);
      if (race.tutorial) p.tutorialDone = true;
      if (result.config.mode === 'cup' && p.activeCup) {
        recordCupRace(p.activeCup, result);
        if (p.activeCup.finished) {
          // keep a copy for the standings screen before archiving
          this.lastCup = JSON.parse(JSON.stringify(p.activeCup));
          cupRewards = completeCup(p, p.activeCup);
        }
      }
      return sum;
    });
    this.persistNow();
    for (const m of rewards.missions) this.toast(`Úkol splněn: ${m.title}`, 'check');
    this.set({ last: { result, rewards, cupRewards, tutorial: race.tutorial }, screen: 'REWARDS' });
  }

  /** Last finished cup (for the final standings screen). */
  lastCup: import('../types').CupState | null = null;

  startTutorial() {
    const setup: RaceSetup = { mode: 'classic', humans: 1, names: [this.state.profile.players[0].name], worldId: 'jungle', difficulty: 'small' };
    const player = this.state.profile.players[0];
    const participants: ParticipantSetup[] = [
      {
        id: 'p0',
        name: player.name,
        color: player.color,
        kind: 'human',
        seat: 0,
        loadout: baseLoadout(),
        start: 'trike',
        lane: 1,
      },
    ];
    const config: RaceConfig = { ...buildRaceConfig(setup, 1, true), tutorial: true };
    this.set({ race: { id: ++this.raceCounter, config, participants, setup, tutorial: true }, screen: 'TUTORIAL', showTutorialOffer: false });
  }

  finishTutorialOffer(skip: boolean) {
    if (skip) this.updateProfile((p) => (p.tutorialDone = true));
    this.set({ showTutorialOffer: false });
  }

  resetProgress() {
    clearSave();
    const profile = createDefaultProfile();
    this.set({ profile, last: null, race: null, screen: 'MENU', showTutorialOffer: true, setup: initialSetup(profile, this.state.settings) });
    this.persistNow();
  }
}

export const store = new Store();

export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}
