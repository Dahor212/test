import { useEffect, useRef } from 'react';
import { ARCHETYPES } from '../../config/dinosaurs';
import { sound } from '../../audio/sound';
import { DinoStage } from '../../render/stage';
import { explorerTitle, MAX_STARS, totalStars } from '../../progression/campaign';
import { dailyKey } from '../../progression/daily';
import { profileName } from '../../progression/profile';
import { store, useApp } from '../../state/store';
import { Button, CoinCounter, Icon, Modal, ProfileAvatar } from '../components/common';

function DockTile({ icon, label, color, onClick, testId, badge = 0 }: { icon: string; label: string; color: string; onClick: () => void; testId: string; badge?: number }) {
  return (
    <button
      type="button"
      className={'dock-tile' + (badge > 0 ? ' has-badge' : '')}
      data-testid={testId}
      style={{ ['--tc' as string]: color }}
      onClick={() => {
        sound.unlock();
        sound.play('tap');
        onClick();
      }}
    >
      <span className="dock-icon">
        <Icon name={icon} size={30} />
      </span>
      <span className="dock-label">{label}</span>
      {badge > 0 && <b className="badge">{badge}</b>}
    </button>
  );
}

export function MainMenu() {
  const profile = useApp((s) => s.profile);
  const quality = useApp((s) => s.settings.quality);
  const showOffer = useApp((s) => s.showTutorialOffer);
  const stageRef = useRef<HTMLDivElement>(null);
  const lineup = profile.players[0].lineup;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let stage: DinoStage | null = null;
    try {
      stage = new DinoStage(el, { quality });
      stage.camera.position.set(0, 2.6, 9.5);
      stage.camera.lookAt(0, 0.9, 0);
      stage.floor.scale.set(1.3, 1, 1);
      ARCHETYPES.forEach((a, i) => {
        const id = lineup[a];
        const inst = profile.dinos[id];
        stage!.addDino(id, inst?.accessory ?? null, [-3.3 + i * 2.2, 0, (i % 2) * 0.6], Math.PI - 0.45 + i * 0.3, 'run', 7 + i, 2.6);
      });
      let t = 0;
      stage.onFrame = (dt) => {
        t += dt;
        stage!.actors.forEach((a, i) => {
          // little hops and look-arounds
          a.rig.root.position.y = Math.max(0, Math.sin(t * 2.2 + i * 1.7)) * 0.12;
          a.mode = Math.sin(t * 0.5 + i) > 0.6 ? 'celebrate' : 'run';
        });
      };
      stage.start();
    } catch {
      /* WebGL unavailable – menu still works */
    }
    const onResize = () => stage?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      stage?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineup.raptor, lineup.spino, lineup.ankylo, lineup.trike, quality]);

  useEffect(() => {
    sound.setMusic('menu');
  }, []);

  const cup = profile.activeCup;
  const eggs = profile.eggs.pending;
  const dailyDone = profile.daily.key === dailyKey() && profile.daily.rewarded;
  return (
    <div className="screen menu-screen" data-testid="main-menu">
      <div className="menu-bg" />
      <div className="menu-stage" ref={stageRef} />
      <button type="button" className="profile-chip" data-testid="profile-chip" onClick={() => store.go('PROFILES')} style={{ ['--pc' as string]: profile.avatar.color }}>
        <ProfileAvatar avatar={profile.avatar} size={50} />
        <span className="pc-name">{profileName(profile)}</span>
        <span className="pc-switch">
          <Icon name="swap" size={20} />
        </span>
      </button>
      <div className="menu-topbar">
        <CoinCounter big />
        <div className="egg-progress" title="Vajíčko">
          <Icon name="egg" size={30} />
          {eggs > 0 ? <b>{eggs}</b> : <span>{profile.eggs.racesTowardNext}/3</span>}
        </div>
      </div>
      <div className="logo" data-testid="logo">
        <div className="logo-main">
          <span className="logo-dino">Dino</span>
          <span className="logo-rush">RUSH</span>
        </div>
        <div className="logo-sub">Závod evoluce</div>
      </div>
      <div className="menu-actions">
        <div className="menu-main-row">
          <Button color="green" size="lg" icon="map" onClick={() => store.go('CAMPAIGN')} testId="nav-campaign" className="side-action">
            Dobrodružství
            <small className="action-sub">
              <Icon name="star" size={16} /> {totalStars(profile)}/{MAX_STARS} · {explorerTitle(profile.campaign.xp)}
            </small>
          </Button>
          <Button color="orange" size="xl" icon="play" onClick={() => store.startSetup()} testId="play" className="play-btn">
            HRÁT
          </Button>
          <Button color="blue" size="lg" icon="calendar" onClick={() => store.openDaily()} testId="nav-daily" className={'side-action' + (dailyDone ? '' : ' has-badge')}>
            Denní výzva
            <small className="action-sub">{dailyDone ? 'splněno ✓' : 'nová trať'}</small>
            {!dailyDone && <b className="badge">!</b>}
          </Button>
        </div>
        {cup && !cup.finished && (
          <Button color="yellow" size="md" icon="trophy" onClick={() => store.startCupRace()} testId="continue-cup">
            Pokračovat v poháru ({cup.raceIndex + 1}/5)
          </Button>
        )}
      </div>
      <nav className="menu-dock">
        <DockTile icon="book" label="Dino sbírka" color="var(--blue)" onClick={() => store.go('COLLECTION')} testId="nav-collection" />
        <DockTile icon="park" label="Dino Park" color="var(--green)" onClick={() => store.go('DINO_PARK')} testId="nav-park" />
        <DockTile icon="list" label="Úkoly" color="var(--purple)" onClick={() => store.go('MISSIONS')} testId="nav-missions" />
        <DockTile icon="egg" label="Vajíčka" color="var(--orange)" onClick={() => store.go('EGG_HATCHING')} testId="nav-eggs" badge={eggs} />
        <DockTile icon="gear" label="Nastavení" color="#7f8fa6" onClick={() => store.go('SETTINGS')} testId="nav-settings" />
      </nav>
      {showOffer && (
        <Modal>
          <div className="offer">
            <Icon name="star" size={60} className="star-on" />
            <h2>Ahoj, závodníku!</h2>
            <p>Chceš se naučit, jak se dinosauři proměňují?</p>
            <div className="row">
              <Button color="green" size="lg" icon="play" onClick={() => store.startTutorial()} testId="start-tutorial">
                Ano, naučit!
              </Button>
              <Button color="white" size="md" onClick={() => store.finishTutorialOffer(true)} testId="skip-offer">
                Přeskočit
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
