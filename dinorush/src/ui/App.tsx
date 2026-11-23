import { useEffect } from 'react';
import { sound } from '../audio/sound';
import { store, useApp } from '../state/store';
import { Icon, Toasts } from './components/common';
import { RaceScreen } from './race/RaceScreen';
import { CampaignScreen } from './screens/CampaignScreen';
import { CollectionScreen } from './screens/CollectionScreen';
import { CupScreen } from './screens/CupScreen';
import { DailyScreen } from './screens/DailyScreen';
import { EggScreen } from './screens/EggScreen';
import { MainMenu } from './screens/MainMenu';
import { MissionsScreen } from './screens/MissionsScreen';
import { ParkScreen } from './screens/ParkScreen';
import { ProfilesScreen } from './screens/ProfilesScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SetupScreen } from './screens/SetupScreen';

export function App() {
  const screen = useApp((s) => s.screen);
  const race = useApp((s) => s.race);
  const reduced = useApp((s) => s.settings.reducedMotion);

  useEffect(() => {
    // audio may only start after a user gesture (mobile browsers)
    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    const save = () => store.persistNow();
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', save);
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', save);
    };
  }, []);

  let content: React.ReactNode = null;
  switch (screen) {
    case 'PROFILES':
      content = <ProfilesScreen />;
      break;
    case 'MENU':
      content = <MainMenu />;
      break;
    case 'CAMPAIGN':
      content = <CampaignScreen />;
      break;
    case 'DAILY':
      content = <DailyScreen />;
      break;
    case 'RACE_SETUP':
      content = <SetupScreen />;
      break;
    case 'RACE':
    case 'TUTORIAL':
      content = race ? <RaceScreen key={race.id} session={race} /> : <MainMenu />;
      break;
    case 'REWARDS':
      content = <ResultsScreen />;
      break;
    case 'CUP_STANDINGS':
      content = <CupScreen />;
      break;
    case 'COLLECTION':
      content = <CollectionScreen />;
      break;
    case 'EGG_HATCHING':
      content = <EggScreen />;
      break;
    case 'DINO_PARK':
      content = <ParkScreen />;
      break;
    case 'MISSIONS':
      content = <MissionsScreen />;
      break;
    case 'SETTINGS':
      content = <SettingsScreen />;
      break;
  }

  return (
    <div className={'app' + (reduced ? ' reduced-motion' : '')} data-screen={screen}>
      {content}
      <Toasts />
      <div className="rotate-notice">
        <Icon name="rotate" size={90} />
        <p>Otoč tablet na šířku</p>
      </div>
    </div>
  );
}
