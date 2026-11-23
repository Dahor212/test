import { useSyncExternalStore } from 'react';
import { sound } from '../audio/sound';
import { BOSS_NAMES, CAMPAIGN_REWARDS, LEVEL_BY_ID, RIVAL_ID } from '../config/campaign';
import { randomSeed } from '../core/rng';
import { ghostKeyCampaign, ghostKeyDaily, ghostKeyReplay } from '../game/ghost';
import { buildParticipants, buildRaceConfig } from '../game/setup';
import type { ParticipantSetup } from '../game/raceEngine';
import { applyCampaignResult, isUnlocked, levelAiProfiles, levelRaceConfig, type CampaignOutcome } from '../progression/campaign';
import { applyDailyResult, dailyKey, dailySpec, refreshDaily, type DailyOutcome } from '../progression/daily';
import { evaluateMissions } from '../progression/missions';
import { cloneProfile, createDefaultProfile, createProfile, MAX_PROFILES, profileName } from '../progression/profile';
import { completeCup, createCup, cupSeed, recordCupRace, type CupRewards } from '../progression/cup';
import { applyRaceResult, resultForSeats, type RewardSummary } from '../progression/rewards';
import { clearSave, loadSave, writeSave } from '../progression/storage';
import { baseLoadout } from '../progression/rpg';
import type { Avatar, DifficultyId, GameSettings, GhostData, PlayerProfile, RaceConfig, RaceResult, RaceSetup } from '../types';

/**
 * Top-level application state machine.
 * (PROFILES) → MENU → RACE_SETUP(steps) / CAMPAIGN / DAILY → RACE
 * (COUNTDOWN/RACING/PAUSED/FINISHED inside) → REWARDS → (CUP_STANDINGS)
 * → MENU; side screens: COLLECTION, EGG_HATCHING, DINO_PARK, MISSIONS,
 * SETTINGS. TUTORIAL is a RACE with a scripted track.
 */
export type Screen =
  | 'PROFILES'
  | 'MENU'
  | 'RACE_SETUP'
  | 'CAMPAIGN'
  | 'DAILY'
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
  /** Ghost to race against (best earlier run on this track). */
  ghost: GhostData | null;
  /** Where a new best run of the human is stored (null = no ghost here). */
  ghostKey: string | null;
}

export interface GhostOutcome {
  had: boolean;
  beaten: boolean;
  /** Seconds faster (negative) or slower (positive) than the ghost. */
  delta: number | null;
  saved: boolean;
}

export interface LastResult {
  result: RaceResult;
  rewards: RewardSummary;
  cupRewards?: CupRewards;
  campaign?: CampaignOutcome;
  daily?: DailyOutcome;
  ghost?: GhostOutcome;
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
  /** Active child profile (owner of coins, dinosaurs, park, adventure). */
  profile: PlayerProfile;
  /** All profiles on this tablet (the active one included, kept in sync). */
  profiles: PlayerProfile[];
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
    seatProfiles: [profile.id, null, null],
  };
}

const REPLAY_GHOST_MODES = new Set(['classic', 'goldRush', 'trex']);

class Store {
  private state: AppState;
  private listeners = new Set<Listener>();
  private saveTimer: number | null = null;
  private raceCounter = 0;
  private toastId = 0;
  /** Ghosts of the last runs on random tracks ("play again" races your previous run). */
  private replayGhosts = new Map<string, GhostData>();

  constructor() {
    const save = loadSave();
    const profile = save.profiles.find((p) => p.id === save.activeProfileId) ?? save.profiles[0];
    this.state = {
      screen: save.profiles.length > 1 ? 'PROFILES' : 'MENU',
      setupStep: 'mode',
      profile,
      profiles: save.profiles,
      settings: save.settings,
      setup: initialSetup(profile, save.settings),
      race: null,
      last: null,
      toasts: [],
      showTutorialOffer: save.profiles.length === 1 && !profile.tutorialDone,
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
    writeSave({ version: 3, profiles: this.state.profiles, activeProfileId: this.state.profile.id, settings: this.state.settings });
  }

  /** Immutable profile update of the active profile: clone → mutate → store → persist. */
  updateProfile<T>(fn: (draft: PlayerProfile) => T): T {
    const draft = cloneProfile(this.state.profile);
    const out = fn(draft);
    this.set({ profile: draft, profiles: this.state.profiles.map((p) => (p.id === draft.id ? draft : p)) });
    this.persistSoon();
    return out;
  }

  /** Update any profile by id (multiplayer rewards for other children). */
  updateProfileById<T>(id: string, fn: (draft: PlayerProfile) => T): T | undefined {
    if (id === this.state.profile.id) return this.updateProfile(fn);
    const cur = this.state.profiles.find((p) => p.id === id);
    if (!cur) return undefined;
    const draft = cloneProfile(cur);
    const out = fn(draft);
    this.set({ profiles: this.state.profiles.map((p) => (p.id === id ? draft : p)) });
    this.persistSoon();
    return out;
  }

  profileById = (id: string) => this.state.profiles.find((p) => p.id === id);

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

  // ---------------------------------------------------------------------------
  // Profiles
  // ---------------------------------------------------------------------------

  switchProfile(id: string) {
    const p = this.profileById(id);
    if (!p) return;
    this.set({
      profile: p,
      setup: initialSetup(p, this.state.settings),
      screen: 'MENU',
      last: null,
      showTutorialOffer: !p.tutorialDone,
    });
    this.replayGhosts.clear();
    this.persistNow();
  }

  createProfile(name: string, avatar: Avatar, difficulty: DifficultyId): PlayerProfile | null {
    if (this.state.profiles.length >= MAX_PROFILES) return null;
    const p = createProfile(name, avatar, difficulty);
    this.set({ profiles: [...this.state.profiles, p] });
    this.persistNow();
    return p;
  }

  editProfile(id: string, name: string, avatar: Avatar) {
    this.updateProfileById(id, (p) => {
      const n = name.trim().slice(0, 14);
      if (n) p.players[0].name = n;
      p.avatar = { ...avatar };
    });
    if (id === this.state.profile.id) this.set({ setup: initialSetup(this.state.profile, this.state.settings) });
  }

  deleteProfile(id: string) {
    if (this.state.profiles.length <= 1) return;
    const profiles = this.state.profiles.filter((p) => p.id !== id);
    const active = id === this.state.profile.id ? profiles[0] : this.state.profile;
    this.set({ profiles, profile: active, setup: initialSetup(active, this.state.settings) });
    this.persistNow();
  }

  // ---------------------------------------------------------------------------
  // Races
  // ---------------------------------------------------------------------------

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
    this.rememberSetup(setup);
    const participants = buildParticipants(setup, this.state.profile, raceSeed, this.profileById);
    const config: RaceConfig = { ...buildRaceConfig(setup, raceSeed), roles: this.roles() };
    let ghostKey: string | null = null;
    if (setup.humans === 1 && REPLAY_GHOST_MODES.has(setup.mode)) ghostKey = ghostKeyReplay(raceSeed, setup.worldId, setup.difficulty, setup.mode);
    this.set({
      race: { id: ++this.raceCounter, config, participants, setup, tutorial: false, ghost: ghostKey ? this.replayGhosts.get(ghostKey) ?? null : null, ghostKey },
      screen: 'RACE',
    });
  }

  /** Remember names (seats without an own profile) and the last setup. */
  private rememberSetup(setup: RaceSetup) {
    this.updateProfile((p) => {
      setup.names.forEach((n, i) => {
        const own = i > 0 && setup.seatProfiles?.[i];
        if (!own && p.players[i] && n.trim()) p.players[i].name = n.trim().slice(0, 14);
      });
      p.lastSetup = { ...setup, names: [...setup.names], seatProfiles: undefined };
    });
  }

  /** Play the same race again (campaign level, daily challenge or the same track). */
  replay(session: RaceSession) {
    const ctx = session.config.context;
    if (ctx?.kind === 'campaign') return this.startCampaignLevel(ctx.levelId);
    if (ctx?.kind === 'daily') return this.startDaily();
    this.startRace(session.config.seed, session.setup);
  }

  /** Dino Cup: creates the cup on the first race, then plays race n of 5. */
  startCupRace(setupIn?: RaceSetup) {
    let cup = this.state.profile.activeCup;
    const base = setupIn ?? this.state.setup;
    if (!cup || cup.finished) {
      const baseSeed = randomSeed();
      const parts = buildParticipants({ ...base, mode: 'cup' }, this.state.profile, baseSeed, this.profileById);
      const created = createCup(base.difficulty, base.worldId, base.humans, parts, baseSeed);
      created.seatProfiles = base.seatProfiles ? [...base.seatProfiles] : undefined;
      this.rememberSetup({ ...base, mode: 'cup' });
      this.updateProfile((p) => {
        p.activeCup = created;
      });
      cup = created;
    }
    const names = Array.from({ length: cup.humans }, (_, i) => cup!.names[`p${i}`] ?? this.state.profile.players[i].name);
    const setup: RaceSetup = {
      mode: 'cup',
      humans: cup.humans as 1 | 2 | 3,
      names,
      worldId: cup.worlds[cup.raceIndex],
      difficulty: cup.difficulty,
      seatProfiles: cup.seatProfiles ? [...cup.seatProfiles] : undefined,
    };
    const participants = buildParticipants(setup, this.state.profile, cup.baseSeed, this.profileById).map((p) => ({ ...p, name: cup!.names[p.id] ?? p.name }));
    const config: RaceConfig = { ...buildRaceConfig(setup, cupSeed(cup)), roles: this.roles() };
    this.set({ race: { id: ++this.raceCounter, config, participants, setup, tutorial: false, ghost: null, ghostKey: null }, screen: 'RACE' });
  }

  abandonCup() {
    this.updateProfile((p) => (p.activeCup = null));
  }

  setCampaignDifficulty(d: DifficultyId) {
    this.updateProfile((p) => (p.campaign.difficulty = d));
  }

  /** Adventure: play one level of the campaign map. */
  startCampaignLevel(levelId: string) {
    const level = LEVEL_BY_ID[levelId];
    const profile = this.state.profile;
    if (!level || !isUnlocked(profile, level)) return;
    const difficulty = profile.campaign.difficulty;
    const setup: RaceSetup = { mode: level.mode, humans: 1, names: [profileName(profile)], worldId: level.world, difficulty };
    let participants = buildParticipants(setup, profile, level.seed, undefined, levelAiProfiles(level, difficulty));
    if (level.boss && level.bossKind === 'rival') {
      // the region champion races as a named rival
      participants = participants.map((pp) => (pp.id === RIVAL_ID ? { ...pp, name: BOSS_NAMES[level.region].slice(0, 16), color: '#2d3436', aiProfile: 'champion' as const } : pp));
    }
    const config: RaceConfig = { ...levelRaceConfig(level, difficulty), roles: this.roles() };
    this.updateProfile((p) => (p.campaign.current = level.id));
    const ghostKey = ghostKeyCampaign(level.id, difficulty);
    this.set({
      race: { id: ++this.raceCounter, config, participants, setup, tutorial: false, ghost: profile.ghosts[ghostKey] ?? null, ghostKey },
      screen: 'RACE',
    });
  }

  /** Today's daily challenge for the active profile. */
  startDaily() {
    const profile = this.state.profile;
    const key = dailyKey();
    const spec = dailySpec(key);
    const difficulty = profile.campaign.difficulty;
    const setup: RaceSetup = { mode: spec.mode, humans: 1, names: [profileName(profile)], worldId: spec.worldId, difficulty };
    const participants = buildParticipants(setup, profile, spec.seed);
    const config: RaceConfig = { ...buildRaceConfig(setup, spec.seed), context: { kind: 'daily', key }, roles: this.roles() };
    const ghostKey = `${ghostKeyDaily(key, difficulty)}:${config.roles!.length}`;
    this.set({
      race: { id: ++this.raceCounter, config, participants, setup, tutorial: false, ghost: profile.ghosts[ghostKey] ?? null, ghostKey },
      screen: 'RACE',
    });
  }

  /** Dinosaur roles of the active child (2 at the start, up to 5). */
  private roles() {
    return [...this.state.profile.roles];
  }

  /** Which profile collects the rewards of a seat (guests count for the active child). */
  private seatOwner(setup: RaceSetup, seat: number): string {
    const active = this.state.profile.id;
    if (seat === 0) return active;
    const id = setup.seatProfiles?.[seat];
    return id && this.profileById(id) ? id : active;
  }

  /** Called by the race screen when the engine reports the end. */
  finishRace(result: RaceResult, recorded: GhostData | null = null) {
    const race = this.state.race;
    if (!race) return;
    const activeId = this.state.profile.id;
    const humans = result.results.filter((r) => r.kind === 'human');
    const groups = new Map<string, number[]>();
    for (const r of humans) {
      const owner = this.seatOwner(race.setup, r.seat);
      groups.set(owner, [...(groups.get(owner) ?? []), r.seat]);
    }
    if (!groups.has(activeId)) groups.set(activeId, []);
    const viewFor = (seats: number[]) => resultForSeats(result, seats);

    // other children first (their rewards land in their own profiles)
    const otherSummaries: RewardSummary[] = [];
    for (const [id, seats] of groups) {
      if (id === activeId || !seats.length) continue;
      const sum = this.updateProfileById(id, (p) => applyRaceResult(p, viewFor(seats)));
      if (sum) {
        otherSummaries.push(sum);
        const name = profileName(this.profileById(id)!);
        for (const m of sum.missions) this.toast(`${name}: úkol splněn – ${m.title}`, 'check');
      }
    }

    let cupRewards: CupRewards | undefined;
    let campaign: CampaignOutcome | undefined;
    let daily: DailyOutcome | undefined;
    let ghost: GhostOutcome | undefined;
    const ctx = result.config.context;
    const main = humans.find((r) => r.seat === 0);
    const rewards = this.updateProfile((p) => {
      const sum = applyRaceResult(p, viewFor(groups.get(activeId) ?? []));
      if (race.tutorial) p.tutorialDone = true;
      if (result.config.mode === 'cup' && p.activeCup) {
        recordCupRace(p.activeCup, result);
        if (p.activeCup.finished) {
          // keep a copy for the standings screen before archiving
          this.lastCup = JSON.parse(JSON.stringify(p.activeCup));
          cupRewards = completeCup(p, p.activeCup);
        }
      }
      const me = sum.players.find((x) => x.seat === 0);
      const addLine = (label: string, amount: number) => {
        if (amount <= 0) return;
        me?.lines.push({ label, amount });
        if (me) me.coins += amount;
        sum.totalCoins += amount;
      };
      if (main && ctx?.kind === 'campaign') {
        campaign = applyCampaignResult(p, ctx.levelId, main, result.config.mode, result.results) ?? undefined;
        if (campaign) {
          const starCoins = campaign.newStars * CAMPAIGN_REWARDS.perStar;
          const bossCoins = campaign.bossFirstWin ? CAMPAIGN_REWARDS.bossCoins : 0;
          addLine(`Nové hvězdy (${campaign.newStars})`, starCoins);
          addLine(LEVEL_BY_ID[ctx.levelId]?.bossKind === 'rival' ? 'Poražený šampion' : 'Poražený T-Rex boss', bossCoins);
          addLine('Nová úroveň průzkumníka', campaign.coins - starCoins - bossCoins);
          sum.eggsEarned += campaign.eggs;
        }
      }
      if (main && ctx?.kind === 'daily') {
        daily = applyDailyResult(p, dailySpec(ctx.key), main);
        addLine('Denní výzva', daily.coins);
        // only today's daily ghost is worth keeping
        for (const k of Object.keys(p.ghosts)) if (k.startsWith('d:') && !k.startsWith(`d:${ctx.key}:`)) delete p.ghosts[k];
      }
      if (main && race.ghostKey && recorded) {
        const finished = main.finishTime !== null && !main.caught;
        const old = race.ghost;
        const stored = race.ghostKey.startsWith('r:') ? this.replayGhosts.get(race.ghostKey) : p.ghosts[race.ghostKey];
        const beaten = !!old && finished && main.finishTime! < old.time;
        const save = finished && (!stored || main.finishTime! < stored.time);
        if (save) {
          if (race.ghostKey.startsWith('r:')) {
            this.replayGhosts.clear();
            this.replayGhosts.set(race.ghostKey, recorded);
          } else p.ghosts[race.ghostKey] = recorded;
        }
        if (beaten) p.stats.ghostsBeaten++;
        ghost = { had: !!old, beaten, delta: old && finished ? Math.round((main.finishTime! - old.time) * 10) / 10 : null, saved: save };
      }
      const more = evaluateMissions(p);
      sum.missions.push(...more);
      return sum;
    });
    this.persistNow();
    for (const m of rewards.missions) this.toast(`Úkol splněn: ${m.title}`, 'check');
    const combined: RewardSummary = {
      ...rewards,
      players: [...rewards.players, ...otherSummaries.flatMap((s) => s.players)].sort((a, b) => a.seat - b.seat),
      totalCoins: rewards.totalCoins + otherSummaries.reduce((a, s) => a + s.totalCoins, 0),
    };
    this.set({ last: { result, rewards: combined, cupRewards, campaign, daily, ghost, tutorial: race.tutorial }, screen: 'REWARDS' });
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
        start: this.state.profile.roles.includes('trike') ? 'trike' : 'spino',
        lane: 2,
      },
    ];
    const config: RaceConfig = { ...buildRaceConfig(setup, 1, true), tutorial: true, roles: this.roles() };
    this.set({
      race: { id: ++this.raceCounter, config, participants, setup, tutorial: true, ghost: null, ghostKey: null },
      screen: 'TUTORIAL',
      showTutorialOffer: false,
    });
  }

  finishTutorialOffer(skip: boolean) {
    if (skip) this.updateProfile((p) => (p.tutorialDone = true));
    this.set({ showTutorialOffer: false });
  }

  /** Daily fields of the active profile are refreshed when the screen opens on a new day. */
  openDaily() {
    const key = dailyKey();
    if (this.state.profile.daily.key !== key) this.updateProfile((p) => refreshDaily(p, key));
    this.go('DAILY');
  }

  /** Deletes the progress of the active profile only (other children keep theirs). */
  resetProgress() {
    const old = this.state.profile;
    if (this.state.profiles.length <= 1) {
      clearSave();
      const profile = createDefaultProfile();
      this.set({ profile, profiles: [profile], last: null, race: null, screen: 'MENU', showTutorialOffer: true, setup: initialSetup(profile, this.state.settings) });
      this.persistNow();
      return;
    }
    const fresh = createDefaultProfile();
    fresh.id = old.id;
    fresh.avatar = { ...old.avatar };
    fresh.players[0].name = old.players[0].name;
    this.set({
      profile: fresh,
      profiles: this.state.profiles.map((p) => (p.id === old.id ? fresh : p)),
      last: null,
      race: null,
      screen: 'MENU',
      showTutorialOffer: true,
      setup: initialSetup(fresh, this.state.settings),
    });
    this.persistNow();
  }
}

export const store = new Store();

export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}
