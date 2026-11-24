import { useEffect, useMemo, useRef, useState } from 'react';
import { CAMPAIGN_LEVELS, FOSSILS, goalIcon, goalText, REGION_LIST, REGIONS } from '../../config/campaign';
import { DINO_BY_ID } from '../../config/dinosaurs';
import { DIFFICULTY_LIST } from '../../config/difficulty';
import { MODES } from '../../config/modes';
import { TERRAINS } from '../../config/terrain';
import { skyLabel } from '../../config/timeOfDay';
import { ghostKeyCampaign } from '../../game/ghost';
import {
  currentLevel,
  explorerProgress,
  explorerTitle,
  isRegionUnlocked,
  isUnlocked,
  levelStars,
  MAX_STARS,
  regionStars,
  REGION_MAX_STARS,
  totalStars,
} from '../../progression/campaign';
import { store, useApp } from '../../state/store';
import type { CampaignLevel, PlayerProfile, RegionId, TerrainId } from '../../types';
import { Button, CoinCounter, DinoThumb, GoalList, Icon, Modal, ProfileAvatar, Stars, TerrainIcon, TopBar } from '../components/common';
import { REGION_SHAPES, WorldMapArt } from '../components/WorldMapArt';

/** Map size in CSS pixels (the art is 1000 × 700). */
const MAP_W = 1800;
const MAP_H = 1260;
const px = (x: number) => (x / 1000) * MAP_W;
const py = (y: number) => (y / 700) * MAP_H;

/** Explorer badge: avatar, level and XP bar (career RPG progress). */
export function ExplorerBadge({ profile, compact = false }: { profile: PlayerProfile; compact?: boolean }) {
  const pr = explorerProgress(profile.campaign.xp);
  return (
    <div className={'explorer-badge' + (compact ? ' compact' : '')} data-testid="explorer-badge">
      <span className="eb-avatar">
        <ProfileAvatar avatar={profile.avatar} size={compact ? 38 : 46} />
        <b className="eb-level">{pr.level}</b>
      </span>
      <span className="eb-text">
        <b>{explorerTitle(profile.campaign.xp)}</b>
        <span className="eb-bar">
          <span style={{ width: `${pr.ratio * 100}%` }} />
        </span>
        {!compact && <small>{pr.max ? 'Nejvyšší úroveň!' : `${pr.into}/${pr.need} zkušeností`}</small>}
      </span>
    </div>
  );
}

export function CampaignScreen() {
  const profile = useApp((s) => s.profile);
  const [open, setOpen] = useState<CampaignLevel | null>(null);
  const [backpack, setBackpack] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cur = currentLevel(profile);
  const [walker, setWalker] = useState<{ x: number; y: number }>({ x: cur.x, y: cur.y });

  const openRegions = useMemo(() => REGION_LIST.filter((r) => isRegionUnlocked(profile, r.id)).map((r) => r.id), [profile]);
  const openEdges = useMemo(() => {
    const set = new Set<string>();
    for (const l of CAMPAIGN_LEVELS) for (const f of l.from) if (levelStars(profile, f) > 0) set.add(`${f}>${l.id}`);
    return set;
  }, [profile]);

  useEffect(() => {
    // start with the explorer in view
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, px(cur.x) - el.clientWidth / 2);
    el.scrollTop = Math.max(0, py(cur.y) - el.clientHeight / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (l: CampaignLevel) => {
    if (!isUnlocked(profile, l)) return;
    const far = Math.hypot(l.x - walker.x, l.y - walker.y);
    setWalker({ x: l.x, y: l.y });
    // the explorer walks there first, then the place opens
    window.setTimeout(() => setOpen(l), far > 4 ? 650 : 0);
  };

  return (
    <div className="screen campaign-screen" data-testid="campaign">
      <TopBar
        title="Dobrodružství"
        icon="map"
        right={
          <div className="row">
            <ExplorerBadge profile={profile} compact />
            <span className="star-total" data-testid="star-total">
              <Icon name="star" size={26} className="star-on" /> {totalStars(profile)}/{MAX_STARS}
            </span>
            <CoinCounter />
          </div>
        }
      />
      <div className="campaign-bar">
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
        <Button color="white" size="sm" icon="backpack" onClick={() => setBackpack(true)} testId="open-backpack">
          Batoh
        </Button>
      </div>
      <div className="world-map-scroll" ref={scrollRef}>
        <div className="world-map" style={{ width: MAP_W, height: MAP_H }}>
          <WorldMapArt openRegions={openRegions} openEdges={openEdges} />
          {REGION_LIST.map((r) => {
            const s = REGION_SHAPES[r.id];
            const unlocked = openRegions.includes(r.id);
            return (
              <div
                key={r.id}
                className={'region-label' + (unlocked ? '' : ' locked')}
                style={{ left: px(s.cx), top: py(s.cy - s.ry * 0.92) }}
                data-testid={`region-${r.id}`}
              >
                {!unlocked && <Icon name="lock" size={18} />}
                <span>{r.name}</span>
                {unlocked && (
                  <small>
                    <Icon name="star" size={14} className="star-on" />
                    {regionStars(profile, r.id)}/{REGION_MAX_STARS}
                  </small>
                )}
                {profile.campaign.badges.includes(r.id) && <Icon name="trophy" size={18} className="rl-badge" />}
              </div>
            );
          })}
          {CAMPAIGN_LEVELS.map((l) => {
            const unlocked = isUnlocked(profile, l);
            const stars = levelStars(profile, l.id);
            const isNew = unlocked && stars === 0;
            return (
              <button
                type="button"
                key={l.id}
                data-testid={`level-${l.id}`}
                data-stars={stars}
                disabled={!unlocked}
                className={'map-node' + (l.boss ? ' boss' : '') + (unlocked ? '' : ' locked') + (isNew ? ' fresh' : '') + (stars ? ' done' : '') + (l.friend ? ' friend' : '')}
                style={{ left: px(l.x), top: py(l.y) }}
                onClick={() => choose(l)}
              >
                <span className="node-disc">{l.boss ? <Icon name={l.bossKind === 'rival' ? 'trophy' : 'trex'} size={44} /> : unlocked ? l.index + 1 : <Icon name="lock" size={26} />}</span>
                {unlocked && (
                  <span className="node-stars">
                    <Stars count={stars} size={l.boss ? 20 : 16} />
                  </span>
                )}
                {unlocked && (
                  <span className="node-mode">
                    <Icon name={l.friend && !profile.campaign.friends.includes(l.friend) ? 'heart' : MODES[l.mode].icon} size={17} />
                  </span>
                )}
              </button>
            );
          })}
          <div className="map-walker" style={{ left: px(walker.x), top: py(walker.y) }} data-testid="map-walker">
            <ProfileAvatar avatar={profile.avatar} size={54} />
            <span className="mw-pin" />
          </div>
        </div>
      </div>
      {open && <LevelCard level={open} onClose={() => setOpen(null)} />}
      {backpack && <Backpack profile={profile} onClose={() => setBackpack(false)} />}
    </div>
  );
}

/** Terrains of a place, most frequent first (what the track will look like). */
function mainTerrains(l: CampaignLevel): TerrainId[] {
  return (Object.entries(l.terrainPool) as [TerrainId, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([t]) => t);
}

function LevelCard({ level, onClose }: { level: CampaignLevel; onClose: () => void }) {
  const profile = useApp((s) => s.profile);
  const stars = levelStars(profile, level.id);
  const mode = MODES[level.mode];
  const region = REGIONS[level.region];
  const ghost = profile.ghosts[ghostKeyCampaign(level.id, profile.campaign.difficulty)];
  const friend = level.friend ? DINO_BY_ID[level.friend] : null;
  const met = level.friend ? profile.campaign.friends.includes(level.friend) : false;
  const fossil = level.fossil ? FOSSILS[level.fossil] : null;
  const found = level.fossil ? profile.campaign.fossils.includes(level.fossil) : false;
  return (
    <Modal onClose={onClose}>
      <div className="level-card" data-testid="level-card">
        <div className="lc-hero" style={{ background: `linear-gradient(150deg, ${region.colors[0]}, ${region.colors[1]})` }}>
          <span className={'lc-num' + (level.boss ? ' boss' : '')}>{level.boss ? <Icon name={level.bossKind === 'rival' ? 'trophy' : 'trex'} size={40} /> : level.index + 1}</span>
          <div className="lc-title">
            <small>{region.name}</small>
            <h2>{level.title}</h2>
            <div className="lc-mode">
              <Icon name={mode.icon} size={20} />
              {level.boss ? (level.bossKind === 'rival' ? 'Boss: předběhni šampiona oblasti!' : 'Boss: uteč obřímu T-Rexovi!') : mode.name}
            </div>
          </div>
          <Stars count={stars} size={30} />
        </div>
        <div className="lc-terrain" data-testid="level-terrains">
          <span>Na trati:</span>
          {mainTerrains(level).map((t) => (
            <span key={t} className="lc-t">
              <TerrainIcon icon={TERRAINS[t].icon} size={34} />
              <small>{TERRAINS[t].name}</small>
            </span>
          ))}
          {skyLabel(level.look) && (
            <span className="lc-t lc-sky" data-testid="level-sky">
              <Icon name={skyLabel(level.look)!.icon} size={30} />
              <small>{skyLabel(level.look)!.name}</small>
            </span>
          )}
        </div>
        <GoalList goals={level.goals} text={goalText} icon={goalIcon} />
        <div className="lc-extras">
          {friend && (
            <div className={'lc-friend' + (met ? ' met' : '')} data-testid="level-friend">
              <DinoThumb defId={friend.id} size={64} locked={!met} />
              <span>
                <b>{met ? `${friend.name} je tvůj kamarád` : 'Potkáš tu nového dinosaura!'}</b>
                <small>{met ? friend.species : 'Doběhni a přidá se k tobě.'}</small>
              </span>
            </div>
          )}
          {fossil && (
            <div className={'lc-fossil' + (found ? ' found' : '')}>
              <span className="lc-fossil-icon">
                <Icon name={found ? fossil.icon : 'star'} size={34} />
              </span>
              <span>
                <b>{found ? fossil.name : 'Skrytá fosilie'}</b>
                <small>{found ? 'Máš ji v batohu' : 'Najdeš ji za 3 hvězdy'}</small>
              </span>
            </div>
          )}
          {ghost && (
            <div className="lc-ghost">
              <Icon name="ghost" size={26} /> Tvůj duch: {ghost.time.toFixed(1)} s
            </div>
          )}
        </div>
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

function Backpack({ profile, onClose }: { profile: PlayerProfile; onClose: () => void }) {
  const c = profile.campaign;
  const friends = CAMPAIGN_LEVELS.filter((l) => l.friend).map((l) => ({ id: l.friend!, region: l.region }));
  const fossils = CAMPAIGN_LEVELS.filter((l) => l.fossil).map((l) => ({ id: l.fossil!, region: l.region }));
  return (
    <Modal onClose={onClose}>
      <div className="backpack" data-testid="backpack">
        <div className="bp-head">
          <ExplorerBadge profile={profile} />
          <Button color="white" size="sm" icon="close" onClick={onClose} />
        </div>
        <h3>
          <Icon name="trophy" size={24} /> Odznaky oblastí
        </h3>
        <div className="bp-badges">
          {REGION_LIST.map((r) => (
            <span key={r.id} className={'bp-badge' + (c.badges.includes(r.id) ? ' on' : '')} style={{ ['--b1' as string]: r.colors[0], ['--b2' as string]: r.colors[1] }} title={r.badge}>
              <Icon name={c.badges.includes(r.id) ? 'trophy' : 'lock'} size={28} />
              <small>{r.name}</small>
            </span>
          ))}
        </div>
        <h3>
          <Icon name="heart" size={24} /> Kamarádi z cest ({c.friends.length}/{friends.length})
        </h3>
        <div className="bp-friends">
          {friends.map((f) => {
            const d = DINO_BY_ID[f.id];
            const met = c.friends.includes(f.id);
            return (
              <span key={f.id} className={'bp-friend' + (met ? ' on' : '')}>
                <DinoThumb defId={f.id} size={70} locked={!met} />
                <small>{met ? d.name : REGIONS[f.region as RegionId].name}</small>
              </span>
            );
          })}
        </div>
        <h3>
          <Icon name="f-bone" size={24} /> Fosilie ({c.fossils.length}/{fossils.length})
        </h3>
        <div className="bp-fossils">
          {fossils.map((f) => {
            const fd = FOSSILS[f.id];
            const has = c.fossils.includes(f.id);
            return (
              <span key={f.id} className={'bp-fossil' + (has ? ' on' : '')} title={has ? fd.name : '?'}>
                <Icon name={has ? fd.icon : 'lock'} size={30} />
                <small>{has ? fd.name : '???'}</small>
              </span>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
