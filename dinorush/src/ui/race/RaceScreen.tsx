import { useCallback, useEffect, useRef, useState } from 'react';
import { ABILITIES, ARCHETYPE_INFO, CLASSIC_ROLES } from '../../config/dinosaurs';
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
  ['1', '2', '3', '4', '5'],
  ['q', 'w', 'e', 'r', 't'],
  ['u', 'i', 'o', 'p', 'j'],
];
const ALT_KEYS = ['a', 's', 'd', 'f', 'g'];

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
  kind: 'perfect' | 'combo' | 'good' | 'bad' | 'ability' | 'coins' | 'finish' | 'trex' | 'team' | 'finale';
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
  const finaleRef = useRef(false);

  // --- create controller -------------------------------------------------
  useEffect(() => {
    let disposed = false;
    let ctrl: RaceController | null = null;
    const el = viewRef.current!;
    preloadSignImages().then(() => {
      if (disposed) return;
      ctrl = new RaceController(el, session.config, session.participants, store.get().settings, { data: session.ghost, record: !!session.ghostKey });
      ctrlRef.current = ctrl;
      (window as unknown as { __race?: RaceController }).__race = ctrl;
      ctrl.onPauseChange = (p) => setPaused(p);
      ctrl.onFinished = () => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        store.finishRace(ctrl!.engine.getResult(), ctrl!.recordedGhost());
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
      // level design: the last phrase of the track is announced once
      if (e.type === 'enterTerrain' && isHuman(e.participantId) && e.segmentIndex !== undefined && !finaleRef.current && ctrl.engine.state.track.segments[e.segmentIndex]?.finale) {
        finaleRef.current = true;
        add.push({ id: ++popupId, pid: '*', text: 'FINÁLE – ještě kousek!', kind: 'finale', born: now });
      }
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
        const roles = ctrl.engine.state.config.roles ?? CLASSIC_ROLES;
        if (idx >= 0 && idx < roles.length) {
          ctrl.press(p.id, roles[idx]);
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
            {state.phase === 'countdown' && (session.config.boss || session.ghost) && (
              <div className="race-intro" data-testid="race-intro">
                {session.config.boss && (
                  <span className="intro-boss">
                    <Icon name="trex" size={34} /> {session.config.boss}
                  </span>
                )}
                {session.ghost && (
                  <span className="intro-ghost">
                    <Icon name="ghost" size={30} /> Závodíš se svým duchem ({session.ghost.time.toFixed(1)} s)
                  </span>
                )}
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
              <Button color="blue" size="md" icon="swap" onClick={() => store.replay(session)} testId="restart">
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
  const humans = s.participants.filter((p) => p.kind === 'human');
  const best = humans.length ? Math.max(...humans.map((p) => p.position)) : leader.position;
  const fill = endless ? 0 : Math.max(0, Math.min(1, best / len));
  // humans close together on the progress bar are spread side by side
  const humanSpread = new Map<string, number>();
  {
    const hs = s.participants.filter((p) => p.kind === 'human').sort((a, b) => a.position - b.position);
    let group: typeof hs = [];
    const flush = () => {
      group.forEach((p, i) => humanSpread.set(p.id, (i - (group.length - 1) / 2) * 26));
      group = [];
    };
    for (const p of hs) {
      if (group.length && (p.position - group[group.length - 1].position) / len > 0.04) flush();
      group.push(p);
    }
    flush();
  }
  return (
    <div className="hud-top">
      <div className="ranking" data-testid="ranking">
        {order.map((p) => (
          <div key={p.id} className={'rank-row' + (p.kind === 'human' ? ' human' : '') + (p.finished ? ' fin' : '')} style={{ ['--pc' as string]: p.color }}>
            <span className={`rank-badge place-${p.place}`}>{p.place}</span>
            <span className="rank-avatar">
              <DinoIcon archetype={p.current} defId={p.loadout[p.current].defId} size={24} />
            </span>
            <span className="rank-name">{p.name}</span>
            <span className="rank-extra">
              {mode.ranking === 'coins' ? (
                <>
                  <Icon name="coin" size={15} /> {p.coins}
                </>
              ) : mode.ranking === 'score' ? (
                `${p.score}`
              ) : p.finished ? (
                <Icon name="flag" size={15} />
              ) : p.caught ? (
                <Icon name="trex" size={16} />
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
            <Icon name="infinity" size={26} />
            <span>{Math.round(best)} m</span>
            <span className="speed-level">
              <Icon name="bolt" size={18} /> ×{s.ramp.toFixed(2)}
            </span>
          </div>
        ) : (
          <div className="track-progress" data-testid="track-progress">
            <div className="tp-road">
              <div className="tp-fill" style={{ width: `${fill * 100}%` }} />
            </div>
            <div className="tp-start" />
            {s.trex && (
              <div className="tp-marker trex" style={{ left: `${Math.max(0, Math.min(1, s.trex.position / len)) * 100}%` }}>
                <Icon name="trex" size={20} />
              </div>
            )}
            {ctrl.ghost && (
              <div className="tp-marker ghost" data-testid="ghost-marker" style={{ left: `${Math.max(0, Math.min(1, ctrl.ghost.positionAt(s.time) / len)) * 100}%` }}>
                <Icon name="ghost" size={18} />
              </div>
            )}
            {s.team && (
              <div className="tp-marker ptero" style={{ left: `${Math.max(0, Math.min(1, s.team.rivalPosition / len)) * 100}%` }}>
                <Icon name="star" size={16} />
              </div>
            )}
            {[...s.participants]
              .sort((a, b) => (a.kind === 'human' ? 1 : 0) - (b.kind === 'human' ? 1 : 0))
              .map((p) => (
                <div
                  key={p.id}
                  className={'tp-marker' + (p.kind === 'human' ? ' human' : '')}
                  style={{ left: `${Math.min(1, p.position / len) * 100}%`, ['--pc' as string]: p.color, ['--dx' as string]: `${humanSpread.get(p.id) ?? 0}px` }}
                >
                  {p.kind === 'human' && <span>{p.name.slice(0, 1).toUpperCase()}</span>}
                </div>
              ))}
            <div className="tp-flag">
              <Icon name="flag" size={22} />
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
  const showNext = !!next && ttc < diff.warningTime * 1.25 && !p.finished;
  const hintTarget = tutorialTarget ?? (diff.hintLevel === 'strong' && showNext ? next!.recommended : null);
  const wrongNow = s.phase === 'racing' && !p.finished && p.current !== seg.recommended && !p.prepared;
  const cooldown = p.sinceSwitch < p.switchCooldown;
  const trexGap = s.trex && !p.caught && !p.finished ? Math.round(p.position - s.trex.position) : null;
  const ghostGap = ctrl.ghost && s.phase === 'racing' && !p.finished ? Math.round(p.position - ctrl.ghost.positionAt(s.time)) : null;
  const total = s.participants.length;
  // speed meter: relative to a fast correct run
  const rel = Math.max(0, Math.min(1, p.speed / (diff.baseSpeed * 1.45)));
  const speedClass = s.phase !== 'racing' ? 'idle' : p.terrainFactor >= 0.95 ? 'fast' : p.terrainFactor >= 0.7 ? 'mid' : 'slow';
  const comboToNext = 3 - (p.combo % 3);
  const ring = showNext ? Math.max(0, Math.min(1, ttc / (diff.warningTime * 1.25))) : 0;
  const showDinoHint = diff.hintLevel !== 'minimal';

  const nextCard = (
    <div className={'next-card' + (showNext ? ' show' : '') + (wrongNow && !showNext ? ' wrong' : '')} data-testid={`next-${p.seat}`}>
      {showNext ? (
        <>
          <span className="next-ring" style={{ ['--ring' as string]: `${ring * 360}deg` }}>
            <TerrainIcon icon={TERRAINS[next!.terrain].icon} size={compact ? 32 : 46} />
          </span>
          {showDinoHint && (
            <>
              <Icon name="back" size={compact ? 14 : 18} className="next-arrow" />
              <DinoIcon archetype={next!.recommended} size={compact ? 34 : 48} />
            </>
          )}
          {!compact && <span className="ttc">{Math.max(0, ttc).toFixed(1)} s</span>}
        </>
      ) : wrongNow ? (
        <>
          <TerrainIcon icon={TERRAINS[seg.terrain].icon} size={compact ? 30 : 42} />
          {showDinoHint && <DinoIcon archetype={seg.recommended} size={compact ? 32 : 46} />}
          <span className="bang">!</span>
        </>
      ) : (
        <>
          <TerrainIcon icon={TERRAINS[seg.terrain].icon} size={compact ? 28 : 38} />
          {s.phase === 'racing' && !p.finished && <Icon name="check" size={compact ? 18 : 24} className="ok-check" />}
        </>
      )}
    </div>
  );

  return (
    <div className={'player-panel' + (compact ? ' compact' : '')} style={{ ['--pc' as string]: p.color }} data-testid={`panel-${p.seat}`}>
      <div className="panel-head">
        <div className="head-row">
          <span className={`medal place-${p.place}`}>
            {p.place}
            {!compact && <small>/{total}</small>}
          </span>
          <span className="panel-name">{p.name}</span>
          {p.combo >= 2 && (
            <span className="combo-chip" data-testid={`combo-${p.seat}`}>
              <Icon name="combo" size={compact ? 14 : 16} />×{p.combo}
            </span>
          )}
          {compact && nextCard}
        </div>
        <div className={'speed-meter ' + speedClass} title="Rychlost">
          <Icon name="bolt" size={compact ? 14 : 18} />
          <div className="speed-bar">
            <div style={{ width: `${rel * 100}%` }} />
          </div>
          {!compact && <span className="speed-num">{Math.round(p.speed * 3.6)} km/h</span>}
        </div>
        <div className="head-stats">
          {!compact && p.combo > 0 && (
            <span className="combo-pips" title="Do turba">
              {[0, 1, 2].map((i) => (
                <i key={i} className={i < 3 - comboToNext ? 'on' : ''} />
              ))}
            </span>
          )}
          {mode.ranking === 'coins' && (
            <span className="mini-stat">
              <Icon name="coin" size={16} />
              {p.coins}
            </span>
          )}
          {mode.ranking === 'score' && <span className="mini-stat">{p.score}</span>}
          {ghostGap !== null && (
            <span className={'mini-stat ghost-gap' + (ghostGap >= 0 ? ' ahead' : ' behind')} data-testid={`ghost-gap-${p.seat}`} title="Odstup od ducha">
              <Icon name="ghost" size={18} />
              {ghostGap >= 0 ? '+' : '−'}
              {Math.abs(ghostGap)} m
            </span>
          )}
          {trexGap !== null && (
            <span className={'mini-stat trex-gap' + (trexGap < 12 ? ' danger' : '')} data-testid={`trex-gap-${p.seat}`}>
              <Icon name="trex" size={18} />
              {trexGap} m
            </span>
          )}
          {p.caught && (
            <span className="mini-stat trex-gap danger">
              <Icon name="trex" size={18} />
            </span>
          )}
        </div>
        {!compact && nextCard}
      </div>
      <div className={`dino-buttons n-${(s.config.roles ?? CLASSIC_ROLES).length}`}>
        {(s.config.roles ?? CLASSIC_ROLES).map((a, i) => {
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
                (charge >= 100 ? ' charged' : '') +
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
              <span className="btn-shine" />
              <span className="charge-badge">
                <Icon name="bolt" size={compact ? 12 : 15} />
              </span>
              {active && (
                <span className="active-check">
                  <Icon name="check" size={compact ? 12 : 16} />
                </span>
              )}
              <DinoIcon archetype={a} defId={p.loadout[a].defId} size={compact ? 66 : 92} />
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
