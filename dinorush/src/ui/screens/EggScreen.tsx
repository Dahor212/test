import { useEffect, useRef, useState } from 'react';
import { ACCESSORY_BY_ID, DINO_BY_ID } from '../../config/dinosaurs';
import { ECONOMY } from '../../config/economy';
import { sound } from '../../audio/sound';
import { openEgg } from '../../progression/eggs';
import { DinoStage } from '../../render/stage';
import { store, useApp } from '../../state/store';
import type { EggReward } from '../../types';
import { Button, Icon, Stars, TopBar } from '../components/common';

type Phase = 'idle' | 'shake' | 'crack' | 'break' | 'reveal';

function EggSvg({ phase }: { phase: Phase }) {
  const crack = phase === 'crack' || phase === 'break';
  return (
    <svg viewBox="0 0 200 240" className={`egg-svg phase-${phase}`}>
      <defs>
        <linearGradient id="eggG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fffbe8" />
          <stop offset="1" stopColor="#ffe0a3" />
        </linearGradient>
      </defs>
      <g className="egg-bottom">
        <path d="M20 130 L45 118 L70 134 L100 116 L130 134 L155 118 L180 130 Q182 228 100 230 Q18 228 20 130 Z" fill="url(#eggG)" stroke="#1d1d35" strokeWidth="6" strokeLinejoin="round" />
        <circle cx="60" cy="180" r="12" fill="#7bed9f" />
        <circle cx="140" cy="196" r="9" fill="#70a1ff" />
        <circle cx="110" cy="160" r="7" fill="#ff6b81" />
      </g>
      <g className="egg-top">
        <path d="M20 130 Q24 14 100 10 Q176 14 180 130 L155 118 L130 134 L100 116 L70 134 L45 118 Z" fill="url(#eggG)" stroke="#1d1d35" strokeWidth="6" strokeLinejoin="round" />
        <circle cx="70" cy="70" r="14" fill="#a55eea" />
        <circle cx="132" cy="54" r="10" fill="#ffd32a" />
        <circle cx="150" cy="100" r="8" fill="#7bed9f" />
        <ellipse cx="62" cy="40" rx="10" ry="16" fill="#fff" opacity="0.7" />
      </g>
      {crack && (
        <g className="egg-cracks" stroke="#1d1d35" strokeWidth="5" fill="none" strokeLinecap="round">
          <path d="M60 90 L72 104 L64 116" />
          <path d="M140 80 L128 96 L138 108" />
          <path d="M100 60 L96 80 L106 92" />
        </g>
      )}
    </svg>
  );
}

function rewardTitle(r: EggReward): string {
  if (r.kind === 'dino' && r.id) return DINO_BY_ID[r.id].name;
  if (r.kind === 'accessory' && r.id) return ACCESSORY_BY_ID[r.id].name;
  return `${r.coins} mincí`;
}

export function EggScreen() {
  const profile = useApp((s) => s.profile);
  const quality = useApp((s) => s.settings.quality);
  const [phase, setPhase] = useState<Phase>('idle');
  const [reward, setReward] = useState<EggReward | null>(null);
  const stageEl = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const pending = profile.eggs.pending;

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  useEffect(() => {
    if (phase !== 'reveal' || !reward || !stageEl.current) return;
    let stage: DinoStage | null = null;
    try {
      stage = new DinoStage(stageEl.current, { quality });
      stage.camera.position.set(0, 2.6, 8.2);
      stage.camera.lookAt(0, 1.0, 0);
      if (reward.kind === 'dino' && reward.id) {
        const a = stage.addDino(reward.id, null, [0, 0, 0], 2.7, 'celebrate');
        a.spin = 0.4;
      } else if (reward.kind === 'accessory' && reward.id) {
        const id = profile.players[0].lineup.raptor;
        const a = stage.addDino(id, reward.id, [0, 0, 0], 2.7, 'celebrate');
        a.spin = 0.4;
      }
      stage.start();
    } catch {
      stage = null;
    }
    return () => stage?.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, reward]);

  const tapEgg = () => {
    if (phase !== 'idle' || pending <= 0) return;
    sound.unlock();
    setPhase('shake');
    sound.play('egg-crack');
    const t1 = window.setTimeout(() => {
      setPhase('crack');
      sound.play('egg-crack');
    }, 900);
    const t2 = window.setTimeout(() => {
      setPhase('break');
      sound.play('egg-crack');
    }, 1600);
    const t3 = window.setTimeout(() => {
      const res = store.updateProfile((p) => openEgg(p));
      if (res) {
        setReward(res.reward);
        for (const m of res.missions) store.toast(`Úkol splněn: ${m.title}`, 'check');
      }
      setPhase('reveal');
      sound.play('egg-hatch');
    }, 2100);
    timers.current.push(t1, t2, t3);
  };

  const def = reward?.kind === 'dino' && reward.id ? DINO_BY_ID[reward.id] : null;

  return (
    <div className="screen egg-screen" data-testid="eggs">
      <TopBar title="Dinosauří vajíčka" icon="egg" />
      <div className="egg-body">
        {phase !== 'reveal' ? (
          pending > 0 ? (
            <>
              <button type="button" className="egg-button" onClick={tapEgg} data-testid="egg" aria-label="Otevřít vajíčko">
                <EggSvg phase={phase} />
              </button>
              <p className="egg-hint">{phase === 'idle' ? 'Klepni na vajíčko!' : 'Něco se líhne…'}</p>
              <p className="egg-count">
                <Icon name="egg" size={26} /> Vajíček k otevření: {pending}
              </p>
            </>
          ) : (
            <div className="egg-empty" data-testid="egg-empty">
              <div className="egg-ghost">
                <EggSvg phase="idle" />
              </div>
              <h2>Zatím žádné vajíčko</h2>
              <p>
                Nové vajíčko dostaneš za každé {ECONOMY.racesPerEgg} závody. Ještě {ECONOMY.racesPerEgg - profile.eggs.racesTowardNext}!
              </p>
              <Button color="orange" size="lg" icon="play" onClick={() => store.startSetup()}>
                Jít závodit
              </Button>
            </div>
          )
        ) : (
          <div className="reveal" data-testid="egg-reveal">
            <div className="reveal-stage" ref={stageEl}>
              {reward?.kind === 'coins' && <Icon name="coin" size={160} className="reveal-coin" />}
            </div>
            <div className="reward-card">
              <span className="reward-kind">{reward?.kind === 'dino' ? 'Nový dinosaurus!' : reward?.kind === 'accessory' ? 'Nový doplněk!' : 'Mince!'}</span>
              <h2 data-testid="reward-name">{reward ? rewardTitle(reward) : ''}</h2>
              {def && (
                <>
                  <Stars count={def.rarity} />
                  <p>
                    {def.species} · {def.role}
                  </p>
                  <p className="perk">{def.perk?.description}</p>
                </>
              )}
              {reward?.kind === 'accessory' && <p>Nasaď ho dinosaurovi ve sbírce.</p>}
              <div className="row">
                {pending > 0 && (
                  <Button
                    color="yellow"
                    size="md"
                    icon="egg"
                    testId="next-egg"
                    onClick={() => {
                      setReward(null);
                      setPhase('idle');
                    }}
                  >
                    Další vajíčko
                  </Button>
                )}
                <Button color="blue" size="md" icon="book" onClick={() => store.go('COLLECTION')} testId="to-collection">
                  Do sbírky
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
