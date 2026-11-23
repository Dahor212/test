import { useState } from 'react';
import { DIFFICULTY_LIST } from '../../config/difficulty';
import { sound } from '../../audio/sound';
import { store, useApp } from '../../state/store';
import { Button, Icon, Modal, TopBar } from '../components/common';

function Toggle({ on, onChange, testId }: { on: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      className={'toggle' + (on ? ' on' : '')}
      onClick={() => {
        sound.unlock();
        onChange(!on);
      }}
    >
      <span className="knob" />
      <span className="toggle-label">{on ? 'ZAP' : 'VYP'}</span>
    </button>
  );
}

export function SettingsScreen() {
  const profileName = useApp((s) => s.profile.players[0].name);
  const s = useApp((x) => x.settings);
  const [confirm, setConfirm] = useState(0);
  return (
    <div className="screen settings-screen" data-testid="settings">
      <TopBar title="Nastavení" icon="gear" />
      <div className="settings-body">
        <section className="settings-group">
        <h3>Zvuk</h3>
        <div className="setting-row">
          <Icon name="sound" size={34} />
          <span>Hlasitost</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.volume}
            data-testid="volume"
            onChange={(e) => store.updateSettings({ volume: Number(e.target.value) })}
            onPointerUp={() => {
              sound.unlock();
              sound.play('coin');
            }}
          />
        </div>
        <div className="setting-row">
          <Icon name="music" size={34} />
          <span>Hudba</span>
          <Toggle on={s.music} onChange={(v) => store.updateSettings({ music: v })} testId="toggle-music" />
        </div>
        <div className="setting-row">
          <Icon name="bolt" size={34} />
          <span>Zvukové efekty</span>
          <Toggle on={s.sfx} onChange={(v) => store.updateSettings({ sfx: v })} testId="toggle-sfx" />
        </div>
        <h3>Hráč</h3>
        <div className="setting-row">
          <Icon name="user" size={34} />
          <span>Profily hráčů</span>
          <Button color="blue" size="sm" onClick={() => store.go('PROFILES')} testId="to-profiles">
            Kdo hraje?
          </Button>
        </div>
        <div className="setting-row danger">
          <Icon name="trash" size={34} />
          <span>Smazat postup hráče {profileName}</span>
          <Button color="red" size="sm" onClick={() => setConfirm(1)} testId="reset">
            Začít od nuly
          </Button>
        </div>
        </section>
        <section className="settings-group">
        <h3>Hra</h3>
        <div className="setting-row">
          <Icon name="star" size={34} />
          <span>Omezit animace</span>
          <Toggle on={s.reducedMotion} onChange={(v) => store.updateSettings({ reducedMotion: v })} testId="toggle-motion" />
        </div>
        <div className="setting-row">
          <Icon name="gear" size={34} />
          <span>Vysoká kvalita grafiky</span>
          <Toggle on={s.quality === 'high'} onChange={(v) => store.updateSettings({ quality: v ? 'high' : 'low' })} testId="toggle-quality" />
        </div>
        <div className="setting-row">
          <Icon name="flag" size={34} />
          <span>Výchozí obtížnost</span>
          <div className="seg">
            {DIFFICULTY_LIST.map((d) => (
              <button type="button" key={d.id} className={s.defaultDifficulty === d.id ? 'on' : ''} onClick={() => store.updateSettings({ defaultDifficulty: d.id })}>
                {d.name}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <Icon name="play" size={34} />
          <span>Výuka</span>
          <Button color="blue" size="sm" onClick={() => store.startTutorial()} testId="replay-tutorial">
            Spustit znovu
          </Button>
        </div>
        </section>
        <p className="about">DinoRUSH – Závod evoluce · verze 0.2 · funguje i bez internetu</p>
      </div>
      {confirm > 0 && (
        <Modal onClose={() => setConfirm(0)}>
          <div className="offer">
            <Icon name="warning" size={60} />
            <h2>{confirm === 1 ? 'Opravdu smazat všechno?' : 'Úplně jistě?'}</h2>
            <p>Smažou se mince, dinosauři, park, úkoly i hvězdy hráče {profileName}. Ostatní hráči o nic nepřijdou.</p>
            <div className="row">
              <Button color="white" size="md" onClick={() => setConfirm(0)} testId="reset-cancel">
                Ne, nechat
              </Button>
              <Button
                color="red"
                size="md"
                testId="reset-confirm"
                onClick={() => {
                  if (confirm === 1) setConfirm(2);
                  else {
                    setConfirm(0);
                    store.resetProgress();
                  }
                }}
              >
                {confirm === 1 ? 'Ano, smazat' : 'Smazat!'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
