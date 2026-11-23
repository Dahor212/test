import { useEffect, useRef } from 'react';
import { ARCHETYPES } from '../../config/dinosaurs';
import { sound } from '../../audio/sound';
import { DinoStage } from '../../render/stage';
import { store, useApp } from '../../state/store';
import { Button, CoinCounter, Icon, Modal } from '../components/common';

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
  return (
    <div className="screen menu-screen" data-testid="main-menu">
      <div className="menu-bg" />
      <div className="menu-stage" ref={stageRef} />
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
        <Button color="orange" size="xl" icon="play" onClick={() => store.startSetup()} testId="play" className="play-btn">
          HRÁT
        </Button>
        {cup && !cup.finished && (
          <Button color="yellow" size="md" icon="trophy" onClick={() => store.startCupRace()} testId="continue-cup">
            Pokračovat v poháru ({cup.raceIndex + 1}/5)
          </Button>
        )}
      </div>
      <nav className="menu-grid">
        <Button color="blue" size="lg" icon="book" onClick={() => store.go('COLLECTION')} testId="nav-collection">
          Dino sbírka
        </Button>
        <Button color="green" size="lg" icon="park" onClick={() => store.go('DINO_PARK')} testId="nav-park">
          Dino Park
        </Button>
        <Button color="purple" size="lg" icon="list" onClick={() => store.go('MISSIONS')} testId="nav-missions">
          Úkoly
        </Button>
        <Button color="yellow" size="lg" icon="egg" onClick={() => store.go('EGG_HATCHING')} testId="nav-eggs" className={eggs > 0 ? 'has-badge' : ''}>
          Vajíčka{eggs > 0 && <b className="badge">{eggs}</b>}
        </Button>
        <Button color="white" size="lg" icon="gear" onClick={() => store.go('SETTINGS')} testId="nav-settings">
          Nastavení
        </Button>
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
