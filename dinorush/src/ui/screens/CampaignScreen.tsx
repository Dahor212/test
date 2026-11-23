import { useEffect, useRef, useState } from 'react';
import { BOSS_NAMES, CAMPAIGN_LEVELS, goalIcon, goalText } from '../../config/campaign';
import { DIFFICULTY_LIST } from '../../config/difficulty';
import { MODES } from '../../config/modes';
import { WORLD_LIST } from '../../config/worlds';
import { ghostKeyCampaign } from '../../game/ghost';
import {
  currentLevel,
  isUnlocked,
  isWorldUnlocked,
  levelStars,
  MAX_STARS,
  totalStars,
  worldStars,
  WORLD_MAX_STARS,
} from '../../progression/campaign';
import { store, useApp } from '../../state/store';
import type { CampaignLevel } from '../../types';
import { Button, CoinCounter, GoalList, Icon, Modal, ProfileAvatar, Stars, TopBar } from '../components/common';
import { WorldArt } from './SetupScreen';

/** Node positions (percent of a world panel) along a winding path. */
const NODES: [number, number][] = [
  [12, 70],
  [27, 38],
  [43, 66],
  [58, 34],
  [73, 62],
  [89, 36],
];

function pathD(): string {
  const pts = NODES.map(([x, y]) => [x * 10, y * 6] as const);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`;
  }
  return d;
}

/** Adventure map: four worlds, five levels and a T-Rex boss each. */
export function CampaignScreen() {
  const profile = useApp((s) => s.profile);
  const [open, setOpen] = useState<CampaignLevel | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cur = currentLevel(profile);

  useEffect(() => {
    // start with the world of the next level in view
    const el = scrollRef.current;
    const panel = el?.querySelector<HTMLElement>(`[data-world="${cur.world}"]`);
    if (el && panel) el.scrollLeft = panel.offsetLeft - 12;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="screen campaign-screen" data-testid="campaign">
      <TopBar
        title="Dobrodružství"
        icon="map"
        right={
          <div className="row">
            <span className="star-total" data-testid="star-total">
              <Icon name="star" size={28} className="star-on" /> {totalStars(profile)}/{MAX_STARS}
            </span>
            <CoinCounter />
          </div>
        }
      />
      <div className="campaign-diff">
        <span>Obtížnost:</span>
        {DIFFICULTY_LIST.map((d) => (
          <button
            type="button"
            key={d.id}
            data-testid={`campaign-diff-${d.id}`}
            className={'pe-chip' + (profile.campaign.difficulty === d.id ? ' selected' : '')}
            onClick={() => store.setCampaignDifficulty(d.id)}
          >
            {d.name}
          </button>
        ))}
      </div>
      <div className="map-scroll" ref={scrollRef}>
        {WORLD_LIST.map((w) => {
          const unlocked = isWorldUnlocked(profile, w.id);
          const levels = CAMPAIGN_LEVELS.filter((l) => l.world === w.id);
          return (
            <section
              key={w.id}
              data-world={w.id}
              className={'map-world world-' + w.id + (unlocked ? '' : ' locked')}
              style={{ background: `linear-gradient(160deg, ${w.cardColors[0]}, ${w.cardColors[1]})` }}
            >
              <header className="map-world-head">
                <span className="mw-name">{w.name}</span>
                <span className="mw-stars">
                  <Icon name="star" size={22} className="star-on" /> {worldStars(profile, w.id)}/{WORLD_MAX_STARS}
                </span>
              </header>
              <WorldArt id={w.id} className="map-art" />
              <div className="map-deco" />
              <svg className="map-path" viewBox="0 0 1000 600" preserveAspectRatio="none">
                <path d={pathD()} />
              </svg>
              {levels.map((l, i) => {
                const open = isUnlocked(profile, l);
                const stars = levelStars(profile, l.id);
                const isCur = l.id === cur.id && open;
                return (
                  <button
                    type="button"
                    key={l.id}
                    data-testid={`level-${l.id}`}
                    data-stars={stars}
                    disabled={!open}
                    className={'map-node' + (l.boss ? ' boss' : '') + (open ? '' : ' locked') + (isCur ? ' current' : '') + (stars ? ' done' : '')}
                    style={{ left: `${NODES[i][0]}%`, top: `${NODES[i][1]}%` }}
                    onClick={() => setOpen(l)}
                  >
                    {isCur && (
                      <span className="node-avatar">
                        <ProfileAvatar avatar={profile.avatar} size={46} />
                      </span>
                    )}
                    <span className="node-disc">{l.boss ? <Icon name="trex" size={52} /> : open ? l.index + 1 : <Icon name="lock" size={30} />}</span>
                    {open && (
                      <span className="node-stars">
                        <Stars count={stars} size={l.boss ? 24 : 20} />
                      </span>
                    )}
                    <span className="node-mode">
                      <Icon name={MODES[l.mode].icon} size={18} />
                    </span>
                  </button>
                );
              })}
              {!unlocked && (
                <div className="map-lock">
                  <Icon name="lock" size={56} />
                  <span>Poraz T-Rexe na konci minulého světa</span>
                </div>
              )}
            </section>
          );
        })}
      </div>
      {open && <LevelCard level={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function LevelCard({ level, onClose }: { level: CampaignLevel; onClose: () => void }) {
  const profile = useApp((s) => s.profile);
  const stars = levelStars(profile, level.id);
  const mode = MODES[level.mode];
  const ghost = profile.ghosts[ghostKeyCampaign(level.id, profile.campaign.difficulty)];
  return (
    <Modal onClose={onClose}>
      <div className="level-card" data-testid="level-card">
        <div className="lc-head">
          <span className={'lc-num' + (level.boss ? ' boss' : '')}>{level.boss ? <Icon name="trex" size={44} /> : level.number}</span>
          <div>
            <h2>{level.title}</h2>
            <div className="lc-mode">
              <Icon name={mode.icon} size={22} /> {level.boss ? `Boss: uteč ${BOSS_NAMES[level.world]}!` : mode.name}
            </div>
          </div>
          <Stars count={stars} size={34} />
        </div>
        <GoalList goals={level.goals} text={goalText} icon={goalIcon} />
        {ghost && (
          <div className="lc-ghost">
            <Icon name="ghost" size={26} /> Tvůj duch: {ghost.time.toFixed(1)} s
          </div>
        )}
        <div className="row">
          <Button color="orange" size="lg" icon="play" onClick={() => store.startCampaignLevel(level.id)} testId="start-level">
            Závodit!
          </Button>
          <Button color="white" size="md" onClick={onClose}>
            Zpět
          </Button>
        </div>
      </div>
    </Modal>
  );
}
