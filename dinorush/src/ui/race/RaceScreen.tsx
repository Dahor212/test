import { useCallback, useEffect, useRef, useState } from 'react';
import { ABILITIES, ARCHETYPES, ARCHETYPE_INFO } from '../../config/dinosaurs';
import { MODES } from '../../config/modes';
import { TERRAINS } from '../../config/terrain';
import { sound } from '../../audio/sound';
import { nextChange } from '../../game/track';
import { TutorialDirector, type TutorialPrompt } from '../../game/tutorial';
import { preloadSignImages } from '../../render/textures';
import { store, useApp, type RaceSession } from '../../state/store';
import type { Archetype, DynamicEventType, RaceEvent, RaceParticipant } from '../../types';
import { Button, DinoIcon, Icon, TerrainIcon } from '../components/common';
import { RaceController } from './RaceController';

const KEYS: string[][] = [
  ['1', '2', '3', '4'],
  ['q', 'w', 'e', 'r'],
  ['u', 'i', 'o', 'p'],
];
const ALT_KEYS = ['a', 's', 'd', 'f'];

const EVENT_TEXT: Record<DynamicEventType, string> = {
  fallingTree: 'Padá strom!',
  rockslide: 'Padají balvany!',
  flood: 'Cesta se zaplavila!',
  snowfall: 'Začalo sněžit!',
  quake: 'Sopečný otřes!',
  stoneWall: 'Vyrostla kamenná zeď!',
};

interface Popup {
  id: number;
  pid: string;
  text: string;
  kind: 'perfect' | 'combo' | 'good' | 'bad' | 'ability' | 'coins' | 'finish' | 'trex' | 'team';
  born: number;
}

let popupId = 0;

export function RaceScreen({ session }: { session: RaceSession }) {
  const settings = useApp((s) => s.settings);
  const viewRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<RaceController | null>(null);
  const tutorialRef = useRef<TutorialDirector | null>(session.tutorial ? new TutorialDirector() : null);
  const [, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [banner, setBanner] = useState<{ text: string; terrain: string; best: Archetype; id: number } | null>(null);
  const [prompt, setPrompt] = useState<TutorialPrompt | null>(null);
  const [countdownText, setCountdownText] = useState<string | null>(null);
  const finishedRef = useRef(false);

  // --- create controller -------------------------------------------------
  useEffect(() => {
    let disposed = false;
    let ctrl: RaceController | null = null;
    const el = viewRef.current!;
    preloadSignImages().then(() => {
      if (disposed) return;
      ctrl = new RaceController(el, session.config, session.participants, store.get().settings);
      ctrlRef.current = ctrl;
      (window as unknown as { __race?: RaceController }).__race = ctrl;
      ctrl.onPauseChange = (p) => setPaused(p);
      ctrl.onFinished = () => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        store.finishRace(ctrl!.engine.getResult());
      };
      if (tutorialRef.current) {
        const dir = tutorialRef.current;
        ctrl.beforeUpdate = () => {
          const pr = dir.update(ctrl!.engine.state, 'p0');
          setPrompt((old) => (old?.text === pr?.text && old?.target === pr?.target && old?.waiting === pr?.waiting ? old : pr));
        };
      }
      ctrl.subscribe((events) => onEvents(events, ctrl!));
      ctrl.start();
      setReady(true);
    });
    const iv = window.setInterval(() => setTick((t) => t + 1), 80);
    return () => {
      disposed = true;
      clearInterval(iv);
      ctrl?.dispose();
      ctrlRef.current = null;
      sound.setMusic('menu');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  const onEvents = useCallback((events: RaceEvent[], ctrl: RaceController) => {
    const now = performance.now();
    const add: Popup[] = [];
    const isHuman = (id?: string) => !!id && ctrl.engine.participant(id)?.kind === 'human';
    for (const e of events) {
      if (e.type === 'countdown') setCountdownText(String(e.value));
      if (e.type === 'start') {
        setCountdownText('START!');
        window.setTimeout(() => setCountdownText(null), 900);
      }
      if (e.type === 'dynamicEvent' && e.eventType && e.terrain) {
        const t = TERRAINS[e.terrain];
        setBanner({ text: EVENT_TEXT[e.eventType], terrain: t.icon, best: t.best, id: now });
        window.setTimeout(() => setBanner((b) => (b && b.id === now ? null : b)), 3200);
      }
      if (e.type === 'teamTurbo') add.push({ id: ++popupId, pid: '*', text: 'TÝMOVÉ TURBO!', kind: 'team', born: now });
      if (!isHuman(e.participantId)) continue;
      const pid = e.participantId!;
      switch (e.type) {
        case 'perfect':
          add.push({ id: ++popupId, pid, text: 'PERFEKTNÍ PROMĚNA!', kind: 'perfect', born: now });
          break;
        case 'combo':
          add.push({ id: ++popupId, pid, text: `COMBO ${e.value}×`, kind: 'combo', born: now });
          break;
        case 'comboCoins':
          add.push({ id: ++popupId, pid, text: `+${e.value}`, kind: 'coins', born: now });
          break;
        case 'segmentSuccess':
          add.push({ id: ++popupId, pid, text: '✔', kind: 'good', born: now });
          break;
        case 'segmentMistake':
          add.push({ id: ++popupId, pid, text: 'Ups!', kind: 'bad', born: now });
          break;
        case 'abilityActivated':
          add.push({ id: ++popupId, pid, text: ABILITIES[ARCHETYPE_INFO[e.archetype!].ability].name + '!', kind: 'ability', born: now });
          break;
        case 'finish':
          add.push({ id: ++popupId, pid, text: 'CÍL!', kind: 'finish', born: now });
          break;
        case 'trexCatch':
          add.push({ id: ++popupId, pid, text: 'T-Rex tě předběhl!', kind: 'trex', born: now });
          break;
      }
    }
    if (add.length) {
      setPopups((old) => [...old.filter((p) => now - p.born < 1600), ...add].slice(-12));
    }
  }, []);

  // expire popups
  useEffect(() => {
    if (!popups.length) return;
    const t = window.setTimeout(() => {
      const now = performance.now();
      setPopups((old) => old.filter((p) => now - p.born < 1600));
    }, 400);
    return () => clearTimeout(t);
  }, [popups]);

  // keyboard support (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = ctrlRef.current;
      if (!ctrl) return;
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        if (ctrl.paused) ctrl.resume();
        else ctrl.pause();
        return;
      }
      const k = e.key.toLowerCase();
      const humans = ctrl.engine.state.participants.filter((p) => p.kind === 'human');
      for (const p of humans) {
        const keys = KEYS[p.seat] ?? [];
        let idx = keys.indexOf(k);
        if (idx < 0 && p.seat === 0) idx = ALT_KEYS.indexOf(k);
        if (idx >= 0) {
          ctrl.press(p.id, ARCHETYPES[idx]);
          setTick((t) => t + 1);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ctrl = ctrlRef.current;
  const state = ctrl?.engine.state;
  const humans = state ? state.participants.filter((p) => p.kind === 'human').sort((a, b) => a.lane - b.lane) : [];
  const mode = MODES[session.config.mode];

  const press = (pid: string, a: Archetype) => {
    const c = ctrlRef.current;
    if (!c) return;
    c.press(pid, a);
    setTick((t) => t + 1);
  };

  return (
    <div className={`race-screen humans-${session.setup.humans}`} data-testid="race-screen">
      <div className="race-view" ref={viewRef}>
        {!ready && <div className="race-loading">Připravuji trať…</div>}
        {state && ctrl && (
          <>
            <HudTop ctrl={ctrl} />
            <PopupLayer ctrl={ctrl} popups={popups} />
            {countdownText && (
              <div className="countdown" key={countdownText} data-testid="countdown">
                {countdownText}
              </div>
            )}
            {banner && (
              <div className="event-banner" key={banner.id}>
                <Icon name="warning" size={44} />
                <span>{banner.text}</span>
                <TerrainIcon icon={banner.terrain} size={52} />
                <Icon name="back" size={26} style={{ transform: 'rotate(180deg)' }} />
                <DinoIcon archetype={banner.best} size={56} />
              </div>
            )}
            {session.tutorial && <TutorialOverlay prompt={prompt} />}
            <button
              type="button"
              className="pause-btn"
              data-testid="pause"
              onPointerDown={(e) => {
                e.preventDefault();
                ctrl.pause();
              }}
            >
              <Icon name="pause" size={30} />
            </button>
          </>
        )}
      </div>
      <div className={`controls controls-${humans.length}`} data-testid="controls">
        {state &&
          ctrl &&
          humans.map((p) => (
            <PlayerPanel
              key={p.id}
              p={p}
              ctrl={ctrl}
              compact={humans.length > 1}
              onPress={press}
              tutorialTarget={session.tutorial ? prompt?.target ?? null : null}
            />
          ))}
      </div>
      {paused && ctrl && (
        <div className="pause-overlay" data-testid="pause-menu">
          <div className="pause-card">
            <h2>Pauza</h2>
            <Button color="green" size="lg" icon="play" onClick={() => ctrl.resume()} testId="resume">
              Pokračovat
            </Button>
            {mode.id === 'endless' && (
              <Button
                color="yellow"
                size="lg"
                icon="flag"
                testId="end-expedition"
                onClick={() => {
                  ctrl.endNow();
                }}
              >
                Ukončit výpravu a uložit
              </Button>
            )}
            {!session.tutorial && mode.id !== 'cup' && (
              <Button color="blue" size="md" icon="swap" onClick={() => store.startRace(session.config.seed, session.setup)} testId="restart">
                Začít znovu
              </Button>
            )}
            <Button
              color="red"
              size="md"
              icon="home"
              testId="quit"
              onClick={() => {
                if (session.tutorial) store.finishTutorialOffer(true);
                store.go('MENU');
              }}
            >
              Hlavní menu
            </Button>
            {settings.reducedMotion && <p className="hint">Omezené animace jsou zapnuté</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function HudTop({ ctrl }: { ctrl: RaceController }) {
  const s = ctrl.engine.state;
  const mode = MODES[s.config.mode];
  const order = [...s.participants].sort((a, b) => a.place - b.place);
  const leader = order[0];
  const len = s.track.length;
  const endless = s.track.endless;
  return (
    <div className="hud-top">
      <div className="ranking" data-testid="ranking">
        {order.map((p) => (
          <div key={p.id} className={'rank-row' + (p.kind === 'human' ? ' human' : '')}>
            <span className={`rank-badge place-${p.place}`}>{p.place}.</span>
            <span className="rank-dot" style={{ background: p.color }} />
            <span className="rank-name">{p.name}</span>
            <span className="rank-extra">
              {mode.ranking === 'coins' ? (
                <>
                  <Icon name="coin" size={16} /> {p.coins}
                </>
              ) : mode.ranking === 'score' ? (
                `${p.score}`
              ) : p.finished ? (
                <Icon name="flag" size={16} />
              ) : p === leader || leader.position - p.position < 1 ? (
                ''
              ) : (
                `-${Math.round(leader.position - p.position)} m`
              )}
            </span>
          </div>
        ))}
      </div>
      <div className="hud-center">
        {endless ? (
          <div className="endless-info">
            <span>{Math.round(Math.max(...s.participants.filter((p) => p.kind === 'human').map((p) => p.position)))} m</span>
            <span className="speed-level">
              <Icon name="bolt" size={18} /> ×{s.ramp.toFixed(2)}
            </span>
          </div>
        ) : (
          <div className="track-progress" data-testid="track-progress">
            <div className="track-line" />
            {s.trex && <div className="tp-marker trex" style={{ left: `${Math.max(0, Math.min(1, s.trex.position / len)) * 100}%` }}><Icon name="trex" size={22} /></div>}
            {s.team && <div className="tp-marker ptero" style={{ left: `${Math.max(0, Math.min(1, s.team.rivalPosition / len)) * 100}%` }}><Icon name="star" size={18} /></div>}
            {s.participants.map((p) => (
              <div key={p.id} className={'tp-marker' + (p.kind === 'human' ? ' human' : '')} style={{ left: `${Math.min(1, p.position / len) * 100}%`, background: p.color }} />
            ))}
            <div className="tp-flag">
              <Icon name="flag" size={24} />
            </div>
          </div>
        )}
        {s.team && (
          <div className="team-meter" data-testid="team-meter">
            <Icon name="team" size={22} />
            <div className="team-bar">
              <div style={{ width: `${(s.team.meter / s.team.meterMax) * 100}%` }} />
            </div>
            <span>{s.team.score}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PopupLayer({ ctrl, popups }: { ctrl: RaceController; popups: Popup[] }) {
  const pos = { x: 0, y: 0, visible: false };
  const byPid = new Map<string, number>();
  const humans = ctrl.engine.state.participants.filter((p) => p.kind === 'human').length;
  return (
    <div className={'popup-layer' + (humans > 1 ? ' multi' : '')}>
      {popups.map((p) => {
        if (p.pid === '*') {
          return (
            <div key={p.id} className={`popup popup-${p.kind} popup-center`}>
              {p.text}
            </div>
          );
        }
        ctrl.renderer.screenPosition(p.pid, pos);
        const n = byPid.get(p.pid) ?? 0;
        byPid.set(p.pid, n + 1);
        // stagger players vertically so texts of neighbours never overlap
        const seat = ctrl.engine.participant(p.pid)?.seat ?? 0;
        const stagger = humans > 1 ? seat * 30 : 0;
        return (
          <div key={p.id} className={`popup popup-${p.kind}`} style={{ left: pos.x, top: Math.max(40, pos.y - n * 30 - stagger) }}>
            {p.text}
          </div>
        );
      })}
    </div>
  );
}

function TutorialOverlay({ prompt }: { prompt: TutorialPrompt | null }) {
  return (
    <div className="tutorial-overlay" data-testid="tutorial">
      {prompt && (
        <div className={'tutorial-card' + (prompt.waiting ? ' waiting' : '')}>
          {prompt.terrain && <TerrainIcon icon={TERRAINS[prompt.terrain].icon} size={64} />}
          <div>
            <div className="tutorial-text">{prompt.text}</div>
            {prompt.sub && <div className="tutorial-sub">{prompt.sub}</div>}
          </div>
          {prompt.target && <DinoIcon archetype={prompt.target} size={70} />}
        </div>
      )}
      <button
        type="button"
        className="skip-btn"
        data-testid="skip-tutorial"
        onClick={() => {
          store.finishTutorialOffer(true);
          store.go('MENU');
        }}
      >
        Přeskočit výuku
      </button>
    </div>
  );
}

function PlayerPanel({
  p,
  ctrl,
  compact,
  onPress,
  tutorialTarget,
}: {
  p: RaceParticipant;
  ctrl: RaceController;
  compact: boolean;
  onPress: (pid: string, a: Archetype) => void;
  tutorialTarget: Archetype | null;
}) {
  const s = ctrl.engine.state;
  const diff = ctrl.engine.difficulty;
  const mode = MODES[s.config.mode];
  const seg = s.track.segments[p.segmentIndex];
  const next = nextChange(s.track, p.segmentIndex);
  const speed = Math.max(p.speed, diff.baseSpeed);
  const ttc = next ? (next.start - p.position) / speed : Infinity;
  const showNext = next && ttc < diff.warningTime * 1.25 && !p.finished;
  const hintTarget = tutorialTarget ?? (diff.hintLevel === 'strong' && showNext ? next!.recommended : null);
  const wrongNow = s.phase === 'racing' && !p.finished && p.current !== seg.recommended && !p.prepared;
  const cooldown = p.sinceSwitch < p.switchCooldown;
  const trexGap = s.trex && !p.caught && !p.finished ? Math.round(p.position - s.trex.position) : null;

  return (
    <div className={'player-panel' + (compact ? ' compact' : '')} style={{ ['--pc' as string]: p.color }} data-testid={`panel-${p.seat}`}>
      <div className="panel-head">
        <span className={`place-badge place-${p.place}`}>{p.place}.</span>
        <span className="panel-name">{p.name}</span>
        {p.combo >= 2 && (
          <span className="combo-chip" data-testid={`combo-${p.seat}`}>
            ×{p.combo}
          </span>
        )}
        {mode.ranking === 'coins' && (
          <span className="mini-stat">
            <Icon name="coin" size={18} />
            {p.coins}
          </span>
        )}
        {mode.ranking === 'score' && <span className="mini-stat">{p.score}</span>}
        {trexGap !== null && (
          <span className={'mini-stat trex-gap' + (trexGap < 12 ? ' danger' : '')} data-testid={`trex-gap-${p.seat}`}>
            <Icon name="trex" size={20} />
            {trexGap} m
          </span>
        )}
        {p.caught && <span className="mini-stat trex-gap danger"><Icon name="trex" size={20} /></span>}
        <div className={'next-chip' + (showNext ? ' show' : '') + (wrongNow ? ' wrong' : '')} data-testid={`next-${p.seat}`}>
          {showNext ? (
            <>
              <TerrainIcon icon={TERRAINS[next!.terrain].icon} size={compact ? 34 : 42} />
              {diff.hintLevel !== 'minimal' && <DinoIcon archetype={next!.recommended} size={compact ? 34 : 42} />}
              <span className="ttc">{Math.max(0, ttc).toFixed(1)}</span>
            </>
          ) : wrongNow ? (
            <>
              <TerrainIcon icon={TERRAINS[seg.terrain].icon} size={compact ? 30 : 38} />
              <span className="bang">!</span>
            </>
          ) : (
            <TerrainIcon icon={TERRAINS[seg.terrain].icon} size={compact ? 30 : 36} />
          )}
        </div>
      </div>
      <div className="dino-buttons">
        {ARCHETYPES.map((a, i) => {
          const info = ARCHETYPE_INFO[a];
          const active = p.current === a;
          const charge = p.abilityCharge[a];
          const abilityOn = p.ability?.archetype === a;
          return (
            <button
              type="button"
              key={a}
              data-testid={`dino-btn-${p.seat}-${a}`}
              data-active={active ? '1' : '0'}
              className={
                'dino-btn' +
                (active ? ' active' : '') +
                (hintTarget === a && !active ? ' hint' : '') +
                (abilityOn ? ' ability-on' : '') +
                (cooldown && !active ? ' cooling' : '')
              }
              style={{ ['--dc' as string]: info.color, ['--dcd' as string]: info.colorDark, ['--charge' as string]: `${charge * 3.6}deg` }}
              onPointerDown={(e) => {
                e.preventDefault();
                onPress(p.id, a);
              }}
              onContextMenu={(e) => e.preventDefault()}
              aria-label={info.species}
            >
              <span className="charge-ring" />
              <DinoIcon archetype={a} defId={p.loadout[a].defId} size={compact ? 64 : 84} />
              <span className="dino-role">{info.role}</span>
              {!compact && <span className="key-hint">{KEYS[p.seat]?.[i]}</span>}
              {hintTarget === a && !active && <Icon name="hand" size={compact ? 40 : 50} className="hint-hand" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
