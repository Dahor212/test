import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ABILITIES, ACCESSORIES, ARCHETYPES, ARCHETYPE_INFO, DINOSAURS, DINO_BY_ID } from '../../config/dinosaurs';
import { STAT_INFO } from '../../config/economy';
import { GAME_CONFIG } from '../../config/gameConfig';
import { sound } from '../../audio/sound';
import { equipAccessory } from '../../progression/eggs';
import { evaluateMissions } from '../../progression/missions';
import { buyUpgrade, checkUpgrade, levelProgress, statEffectText } from '../../progression/rpg';
import { setAccessory } from '../../render/dinoModels';
import { DinoStage, type StageActor } from '../../render/stage';
import { store, useApp } from '../../state/store';
import type { StatId } from '../../types';
import { Button, DinoThumb, Icon, ProgressBar, Stars, TopBar } from '../components/common';

const STATS: StatId[] = ['speed', 'transform', 'stamina'];
const SILHOUETTE = new THREE.MeshBasicMaterial({ color: 0x2d3436 });
SILHOUETTE.userData.shared = true;

export function CollectionScreen() {
  const profile = useApp((s) => s.profile);
  const quality = useApp((s) => s.settings.quality);
  const [selected, setSelected] = useState<string>(profile.players[0].lineup.raptor);
  const stageEl = useRef<HTMLDivElement>(null);
  const stageRef = useRef<DinoStage | null>(null);
  const actorRef = useRef<StageActor | null>(null);
  const inst = profile.dinos[selected];
  const def = DINO_BY_ID[selected];

  useEffect(() => {
    if (!stageEl.current) return;
    try {
      const st = new DinoStage(stageEl.current, { quality });
      st.camera.position.set(0, 2.0, 5.6);
      st.camera.lookAt(0, 1.05, 0);
      st.start();
      stageRef.current = st;
    } catch {
      stageRef.current = null;
    }
    const onResize = () => stageRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      stageRef.current?.dispose();
      stageRef.current = null;
    };
  }, [quality]);

  useEffect(() => {
    const st = stageRef.current;
    if (!st) return;
    st.clearActors();
    const a = st.addDino(selected, inst?.accessory ?? null, [0, 0, 0], 2.6, 'idle', 0, 3.6);
    a.spin = 0.5;
    if (!inst) {
      // locked: show a dark silhouette only
      a.rig.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.material = SILHOUETTE;
      });
    }
    actorRef.current = a;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    if (actorRef.current) setAccessory(actorRef.current.rig, inst?.accessory ?? null);
  }, [inst?.accessory]);

  const lineup = profile.players[0].lineup;
  const inLineup = def && lineup[def.archetype] === selected;
  const prog = inst ? levelProgress(inst) : null;
  const ability = ABILITIES[ARCHETYPE_INFO[def.archetype].ability];

  return (
    <div className="screen collection-screen" data-testid="collection">
      <TopBar title="Dino sbírka" icon="book" />
      <div className="collection-body">
        <div className="collection-grid">
          {ARCHETYPES.map((a) => (
            <div key={a} className="arch-row">
              <div className={'arch-label' + (profile.roles.includes(a) ? '' : ' locked')} style={{ background: ARCHETYPE_INFO[a].color }} title={profile.roles.includes(a) ? '' : 'Odemkne se v Dobrodružství'}>
                {!profile.roles.includes(a) && <Icon name="lock" size={14} />}
                {ARCHETYPE_INFO[a].role}
              </div>
              {DINOSAURS.filter((d) => d.archetype === a).map((d) => {
                const owned = !!profile.dinos[d.id];
                return (
                  <button
                    type="button"
                    key={d.id}
                    data-testid={`card-${d.id}`}
                    className={'dino-card' + (selected === d.id ? ' selected' : '') + (owned ? '' : ' locked')}
                    style={{ ['--dc' as string]: ARCHETYPE_INFO[a].color }}
                    onClick={() => {
                      sound.play('tap');
                      setSelected(d.id);
                    }}
                  >
                    <DinoThumb defId={d.id} accessory={profile.dinos[d.id]?.accessory ?? null} size={84} locked={!owned} />
                    <span className="dc-name">{owned ? d.name : '???'}</span>
                    {owned && <span className="dc-level">Úr. {profile.dinos[d.id].level}</span>}
                    {lineup[a] === d.id && <Icon name="check" size={18} className="dc-check" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="dino-detail" data-testid="dino-detail">
          <div className="detail-stage" ref={stageEl} />
          <div className="detail-info">
            <div className="detail-head">
              <h2>{inst ? def.name : 'Zamčený dinosaurus'}</h2>
              <Stars count={def.rarity} size={20} />
            </div>
            <div className="detail-sub">
              {def.species} · <b style={{ color: ARCHETYPE_INFO[def.archetype].colorDark }}>{def.role}</b>
            </div>
            {inst && prog ? (
              <>
                <div className="level-row">
                  <span className="level-badge">Úroveň {prog.level}</span>
                  <ProgressBar value={prog.ratio} color={ARCHETYPE_INFO[def.archetype].color} label={prog.max ? 'MAX' : `${prog.current}/${prog.needed} XP`} />
                </div>
                <div className="ability-box">
                  <Icon name="bolt" size={26} />
                  <div>
                    <b>{ability.name}</b>
                    <p>{ability.description}</p>
                  </div>
                </div>
                {def.perk && <p className="perk">{def.perk.description}</p>}
                <div className="stats" data-testid="stats">
                  {STATS.map((st) => {
                    const pts = inst.stats[st];
                    const chk = checkUpgrade(profile, selected, st);
                    return (
                      <div key={st} className="stat-row" data-testid={`stat-${st}`}>
                        <div className="stat-name">
                          {STAT_INFO[st].name}
                          <small>{statEffectText(st, pts)}</small>
                        </div>
                        <div className="stat-pips">
                          {Array.from({ length: GAME_CONFIG.rpg.maxStatPoints }, (_, i) => (
                            <span key={i} className={'pip' + (i < pts ? ' on' : '')} />
                          ))}
                        </div>
                        {pts >= GAME_CONFIG.rpg.maxStatPoints ? (
                          <span className="stat-max">MAX</span>
                        ) : (
                          <Button
                            color={chk.ok ? 'green' : 'white'}
                            size="sm"
                            disabled={!chk.ok}
                            testId={`upgrade-${st}`}
                            onClick={() => {
                              const out = store.updateProfile((p) => {
                                const res = buyUpgrade(p, selected, st);
                                return { res, missions: res.ok ? evaluateMissions(p) : [] };
                              });
                              if (out.res.ok) {
                                sound.play('buy');
                                store.toast(`${STAT_INFO[st].name}: ${statEffectText(st, out.res.from)} → ${statEffectText(st, out.res.to)}`, 'bolt');
                                for (const m of out.missions) store.toast(`Úkol splněn: ${m.title}`, 'check');
                              }
                            }}
                          >
                            <Icon name="coin" size={16} />
                            {chk.ok || chk.reason === 'coins' ? chk.cost : chk.reason === 'level' ? `úr. ${chk.requiredLevel}` : ''}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="accessories">
                  <span>Doplněk:</span>
                  <button type="button" className={'acc' + (!inst.accessory ? ' on' : '')} onClick={() => store.updateProfile((p) => equipAccessory(p, selected, null))}>
                    <Icon name="close" size={18} />
                  </button>
                  {ACCESSORIES.filter((a) => profile.accessories.includes(a.id)).map((a) => (
                    <button
                      type="button"
                      key={a.id}
                      data-testid={`acc-${a.id}`}
                      className={'acc' + (inst.accessory === a.id ? ' on' : '')}
                      style={{ background: '#' + a.color.toString(16).padStart(6, '0') }}
                      onClick={() => store.updateProfile((p) => equipAccessory(p, selected, a.id))}
                    >
                      {a.name}
                    </button>
                  ))}
                  {profile.accessories.length === 0 && <small>Doplňky najdeš ve vajíčkách</small>}
                </div>
                <Button
                  color={inLineup ? 'white' : 'orange'}
                  size="md"
                  icon="check"
                  disabled={inLineup}
                  testId="set-lineup"
                  onClick={() => store.updateProfile((p) => (p.players[0].lineup[def.archetype] = selected))}
                >
                  {inLineup ? 'V sestavě' : 'Do sestavy'}
                </Button>
              </>
            ) : (
              <p className="locked-text">
                <Icon name="egg" size={30} /> Tohoto dinosaura najdeš ve vajíčku. Vajíčko dostaneš za každé 3 závody!
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
