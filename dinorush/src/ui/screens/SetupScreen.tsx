import { ARCHETYPES, ARCHETYPE_INFO, DINOSAURS, DINO_BY_ID } from '../../config/dinosaurs';
import { DIFFICULTY_LIST, PLAYER_COLORS } from '../../config/difficulty';
import { MODE_LIST, MODES } from '../../config/modes';
import { WORLD_LIST } from '../../config/worlds';
import { laneLayout } from '../../game/setup';
import { store, useApp, type SetupStep } from '../../state/store';
import type { Archetype, DifficultyId, WorldId } from '../../types';
import { profileName } from '../../progression/profile';
import { Button, DinoIcon, DinoThumb, Icon, ProfileAvatar, TopBar } from '../components/common';
import { useState } from 'react';

const STEPS: SetupStep[] = ['mode', 'players', 'world', 'difficulty', 'lineup'];
const STEP_LABELS: Record<SetupStep, string> = {
  mode: 'Hra',
  players: 'Hráči',
  world: 'Svět',
  difficulty: 'Obtížnost',
  lineup: 'Dinosauři',
};
const TITLES: Record<SetupStep, string> = {
  mode: 'Vyber hru',
  players: 'Kolik vás hraje?',
  world: 'Vyber svět',
  difficulty: 'Jak těžké?',
  lineup: 'Tvoji dinosauři',
};

export function SetupScreen() {
  const step = useApp((s) => s.setupStep);
  const idx = STEPS.indexOf(step);
  const back = () => (idx === 0 ? store.go('MENU') : store.set({ setupStep: STEPS[idx - 1] }));
  const next = () => store.set({ setupStep: STEPS[Math.min(STEPS.length - 1, idx + 1)] });
  return (
    <div className="screen setup-screen" data-testid={`setup-${step}`}>
      <TopBar
        title={TITLES[step]}
        onBack={back}
        icon="play"
        right={
          <ol className="stepper">
            {STEPS.map((s, i) => (
              <li key={s} className={i < idx ? 'done' : i === idx ? 'on' : ''}>
                <button type="button" disabled={i >= idx} onClick={() => store.set({ setupStep: s })}>
                  <span className="st-num">{i < idx ? <Icon name="check" size={16} /> : i + 1}</span>
                  <span className="st-label">{STEP_LABELS[s]}</span>
                </button>
              </li>
            ))}
          </ol>
        }
      />
      <div className="setup-body">
        {step === 'mode' && <ModeStep onNext={next} />}
        {step === 'players' && <PlayersStep onNext={next} />}
        {step === 'world' && <WorldStep onNext={next} />}
        {step === 'difficulty' && <DifficultyStep onNext={next} />}
        {step === 'lineup' && <LineupStep />}
      </div>
    </div>
  );
}

function ModeStep({ onNext }: { onNext: () => void }) {
  const mode = useApp((s) => s.setup.mode);
  return (
    <div className="card-grid cols-3">
      {MODE_LIST.map((m) => (
        <button
          type="button"
          key={m.id}
          data-testid={`mode-${m.id}`}
          className={'choice-card mode-card' + (mode === m.id ? ' selected' : '')}
          style={{ ['--c1' as string]: m.colors[0], ['--c2' as string]: m.colors[1] }}
          onClick={() => {
            store.updateSetup({ mode: m.id });
            onNext();
          }}
        >
          <span className="cc-art">
            <Icon name={m.icon} size={96} className="card-icon" />
          </span>
          <span className="cc-body">
            <span className="card-title">{m.name}</span>
            <span className="card-desc">{m.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function PlayersStep({ onNext }: { onNext: () => void }) {
  const setup = useApp((s) => s.setup);
  const team = setup.mode === 'team';
  const opts: { n: 1 | 2 | 3; label: string; sub: string }[] = [
    { n: 1, label: '1 hráč', sub: team ? '+ 4 počítačoví kamarádi' : '+ 4 počítačoví soupeři' },
    { n: 2, label: '2 hráči', sub: team ? '+ 3 počítačoví kamarádi' : '+ 3 počítačoví soupeři' },
    { n: 3, label: '3 hráči', sub: team ? '+ 2 počítačoví kamarádi' : '+ 2 počítačoví soupeři' },
  ];
  return (
    <div className="players-step">
      <div className="card-grid cols-3">
        {opts.map((o) => {
          let seat = 0;
          return (
            <button
              type="button"
              key={o.n}
              data-testid={`players-${o.n}`}
              className={'choice-card players-card' + (setup.humans === o.n ? ' selected' : '')}
              style={{ ['--c1' as string]: '#74b9ff', ['--c2' as string]: '#1e90ff' }}
              onClick={() => store.updateSetup({ humans: o.n })}
            >
              <span className="cc-art">
              <div className="player-figures">
                {laneLayout(o.n).map((kind, i) => {
                  const human = kind === 'h';
                  const color = human ? PLAYER_COLORS[seat++] : '#b2bec3';
                  return (
                    <span key={i} className={'fig' + (human ? ' human' : ' ai')} style={{ background: color }}>
                      <Icon name={human ? 'star' : 'gear'} size={human ? 24 : 16} />
                    </span>
                  );
                })}
              </div>
              </span>
              <span className="cc-body">
                <span className="card-title">{o.label}</span>
                <span className="card-desc">{o.sub}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="setup-panel">
        <div className="names-row">
          {Array.from({ length: setup.humans }, (_, i) => (
            <SeatRow key={i} seat={i} />
          ))}
        </div>
        <div className="setup-panel-foot">
          {setup.humans > 1 && setup.mode !== 'team' ? (
            <p className="fair-note">
              <Icon name="heart" size={22} /> Všichni mají stejně silné dinosaury – rozhoduje postřeh!
            </p>
          ) : (
            <span />
          )}
          <Button color="green" size="lg" icon="next" onClick={onNext} testId="players-next">
            Dál
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * One player seat: seat 1 is the active child; seats 2–3 can be another
 * child's profile (rewards go to that profile) or a guest with a typed name.
 */
function SeatRow({ seat }: { seat: number }) {
  const setup = useApp((s) => s.setup);
  const profile = useApp((s) => s.profile);
  const profiles = useApp((s) => s.profiles);
  const color = PLAYER_COLORS[seat];
  if (seat === 0) {
    return (
      <div className="name-input seat-owner" style={{ borderColor: color }} data-testid="seat-0">
        <ProfileAvatar avatar={profile.avatar} size={40} />
        <span className="seat-name">{profileName(profile)}</span>
      </div>
    );
  }
  const others = profiles.filter((p) => p.id !== profile.id);
  const chosen = setup.seatProfiles?.[seat] ?? null;
  const takenElsewhere = (id: string) => (setup.seatProfiles ?? []).some((x, i) => i !== seat && i < setup.humans && x === id);
  const pick = (id: string | null) => {
    const seatProfiles = [...(setup.seatProfiles ?? [profile.id, null, null])];
    seatProfiles[seat] = id;
    store.updateSetup({ seatProfiles });
  };
  return (
    <div className="name-input seat-row" style={{ borderColor: color }} data-testid={`seat-${seat}`}>
      <span className="name-dot" style={{ background: color }} />
      {others.map((o) => (
        <button
          type="button"
          key={o.id}
          className={'seat-chip' + (chosen === o.id ? ' selected' : '')}
          disabled={takenElsewhere(o.id)}
          data-testid={`seat-${seat}-${profileName(o)}`}
          onClick={() => pick(chosen === o.id ? null : o.id)}
        >
          <ProfileAvatar avatar={o.avatar} size={34} />
          {profileName(o)}
        </button>
      ))}
      {chosen && profiles.some((p) => p.id === chosen) ? null : (
        <input
          data-testid={`name-${seat}`}
          value={setup.names[seat] ?? ''}
          maxLength={14}
          placeholder={others.length ? 'Host' : `Hráč ${seat + 1}`}
          onChange={(e) => {
            const names = [...setup.names];
            names[seat] = e.target.value;
            store.updateSetup({ names });
          }}
        />
      )}
    </div>
  );
}

export function WorldArt({ id, className = 'world-art' }: { id: WorldId; className?: string }) {
  const art: Record<WorldId, string> = {
    jungle: `<svg viewBox="0 0 200 120"><circle cx="165" cy="25" r="16" fill="#fff36b"/><path d="M0 100 Q50 60 100 90 T200 80 V120 H0Z" fill="#2f8a4a"/><path d="M0 110 Q60 80 120 105 T200 100 V120 H0Z" fill="#46c35a"/><rect x="40" y="45" width="7" height="50" fill="#8a5a2b"/><ellipse cx="44" cy="45" rx="26" ry="9" fill="#2e9e44"/><ellipse cx="44" cy="40" rx="16" ry="8" fill="#46c35a"/><path d="M120 112 Q150 98 200 108" stroke="#2ec4f0" stroke-width="8" fill="none"/></svg>`,
    volcano: `<svg viewBox="0 0 200 120"><path d="M50 110 L100 30 L120 30 L170 110Z" fill="#3a2a28"/><path d="M100 30 L120 30 L114 46 L106 42Z" fill="#ff5a1a"/><circle cx="110" cy="18" r="9" fill="#9a9a9a" opacity="0.8"/><circle cx="122" cy="8" r="7" fill="#b0b0b0" opacity="0.7"/><path d="M0 110 H200 V120 H0Z" fill="#2a2322"/><path d="M20 112 Q40 104 60 112" stroke="#ff9a1a" stroke-width="5" fill="none"/><rect x="130" y="100" width="50" height="6" fill="#a0632e"/></svg>`,
    ice: `<svg viewBox="0 0 200 120"><path d="M20 110 L60 40 L100 110Z" fill="#dcefff"/><path d="M50 58 L60 40 L70 58 Z" fill="#fff"/><path d="M90 110 L140 25 L190 110Z" fill="#bfe0f5"/><path d="M128 46 L140 25 L152 46Z" fill="#fff"/><path d="M0 108 H200 V120 H0Z" fill="#fff"/><g stroke="#fff" stroke-width="3"><path d="M30 20 V36 M22 28 H38 M24 22 L36 34 M36 22 L24 34"/></g></svg>`,
    islands: `<svg viewBox="0 0 200 120"><circle cx="40" cy="25" r="15" fill="#fff36b"/><path d="M0 85 H200 V120 H0Z" fill="#1fc8db"/><ellipse cx="120" cy="88" rx="60" ry="14" fill="#f6e27f"/><path d="M120 85 Q118 60 126 42" stroke="#b07a3c" stroke-width="6" fill="none"/><ellipse cx="128" cy="42" rx="24" ry="6" fill="#4fd06a" transform="rotate(-15 128 42)"/><ellipse cx="124" cy="42" rx="22" ry="6" fill="#2fae52" transform="rotate(25 124 42)"/><path d="M10 100 Q20 95 30 100 M160 105 Q170 100 180 105" stroke="#fff" stroke-width="3" fill="none"/></svg>`,
  };
  // as a backdrop the art covers the whole area
  const svg = className === 'world-art' ? art[id] : art[id].replace('<svg ', '<svg preserveAspectRatio="xMidYMax slice" ');
  return <span className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function WorldStep({ onNext }: { onNext: () => void }) {
  const world = useApp((s) => s.setup.worldId);
  const mode = useApp((s) => s.setup.mode);
  return (
    <div className="card-grid cols-2 worlds">
      {WORLD_LIST.map((w) => (
        <button
          type="button"
          key={w.id}
          data-testid={`world-${w.id}`}
          className={'choice-card world-card' + (world === w.id ? ' selected' : '')}
          style={{ ['--c1' as string]: w.cardColors[0], ['--c2' as string]: w.cardColors[1] }}
          onClick={() => {
            store.updateSetup({ worldId: w.id });
            onNext();
          }}
        >
          <span className="cc-art">
            <WorldArt id={w.id} className="cc-world-art" />
          </span>
          <span className="cc-body">
            <span className="card-title">{w.name}</span>
            <span className="card-desc">{mode === 'cup' ? 'První závod poháru' : w.subtitle}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function DifficultyStep({ onNext }: { onNext: () => void }) {
  const d = useApp((s) => s.setup.difficulty);
  const sizes: Record<DifficultyId, number> = { small: 120, racer: 160, champion: 200 };
  const colors: Record<DifficultyId, [string, string]> = {
    small: ['#7bed9f', '#2ed573'],
    racer: ['#70a1ff', '#1e90ff'],
    champion: ['#ff7f50', '#ff4757'],
  };
  return (
    <div className="card-grid cols-3">
      {DIFFICULTY_LIST.map((x) => (
        <button
          type="button"
          key={x.id}
          data-testid={`difficulty-${x.id}`}
          className={'choice-card diff-card' + (d === x.id ? ' selected' : '')}
          style={{ ['--c1' as string]: colors[x.id][0], ['--c2' as string]: colors[x.id][1] }}
          onClick={() => {
            store.updateSetup({ difficulty: x.id });
            onNext();
          }}
        >
          <span className="cc-art">
            <DinoIcon archetype="raptor" size={sizes[x.id]} />
          </span>
          <span className="cc-body">
            <span className="card-title">{x.name}</span>
            <span className="card-age">{x.ages}</span>
            <span className="card-desc">Nápověda {x.warningTime} s před změnou terénu</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function LineupStep() {
  const setup = useApp((s) => s.setup);
  const active = useApp((s) => s.profile);
  const profiles = useApp((s) => s.profiles);
  const [seat, setSeat] = useState(0);
  // a seat played by another child uses that child's own dinosaurs
  const ownerOf = (i: number) => {
    const id = i > 0 ? setup.seatProfiles?.[i] : null;
    return (id && profiles.find((p) => p.id === id)) || null;
  };
  const owner = ownerOf(seat);
  const profile = owner ?? active;
  const slot = owner ? 0 : seat;
  const lineup = profile.players[slot].lineup;
  const cycle = (a: Archetype, dir: number) => {
    const owned = DINOSAURS.filter((d) => d.archetype === a && profile.dinos[d.id]);
    const i = owned.findIndex((d) => d.id === lineup[a]);
    const nextDef = owned[(i + dir + owned.length) % owned.length];
    store.updateProfileById(profile.id, (p) => {
      p.players[slot].lineup[a] = nextDef.id;
    });
  };
  return (
    <div className="lineup-step">
      {setup.humans > 1 && (
        <div className="seat-tabs">
          {Array.from({ length: setup.humans }, (_, i) => (
            <button type="button" key={i} className={'seat-tab' + (i === seat ? ' on' : '')} style={{ ['--pc' as string]: PLAYER_COLORS[i] }} onClick={() => setSeat(i)}>
              {i === 0 ? profileName(active) : ownerOf(i) ? profileName(ownerOf(i)!) : setup.names[i] || `Hráč ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      <div className="lineup-slots">
        {ARCHETYPES.filter((a) => active.roles.includes(a)).map((a) => {
          const def = DINO_BY_ID[lineup[a]];
          const owned = DINOSAURS.filter((d) => d.archetype === a && profile.dinos[d.id]).length;
          const inst = profile.dinos[def.id];
          return (
            <div key={a} className="lineup-slot" style={{ ['--dc' as string]: ARCHETYPE_INFO[a].color }} data-testid={`slot-${a}`}>
              <span className="slot-role">{ARCHETYPE_INFO[a].role}</span>
              <DinoThumb defId={def.id} accessory={inst?.accessory ?? null} size={170} />
              <span className="slot-name">{def.name}</span>
              <span className="slot-level">Úroveň {inst?.level ?? 1}</span>
              {owned > 1 ? (
                <div className="slot-arrows">
                  <Button color="white" size="sm" icon="back" onClick={() => cycle(a, -1)} />
                  <Button color="white" size="sm" icon="back" className="flip" onClick={() => cycle(a, 1)} />
                </div>
              ) : (
                <span className="slot-hint">Další z vajíček</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="lineup-note">
        <Icon name="dinos" size={24} /> Sestava má vždy rychlíka, plavce, bouráka i tereňáka.
      </p>
      <Button color="orange" size="xl" icon="flag" onClick={() => store.startRace()} testId="start-race" className="go-btn">
        {MODES[setup.mode].id === 'cup' ? 'START POHÁRU!' : 'ZÁVOD!'}
      </Button>
    </div>
  );
}
