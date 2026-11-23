import { goalIcon, goalText } from '../../config/campaign';
import { DIFFICULTIES } from '../../config/difficulty';
import { MODES } from '../../config/modes';
import { WORLDS } from '../../config/worlds';
import { ghostKeyDaily } from '../../game/ghost';
import { DAILY_REWARDS, dailyKey, dailySpec, formatDailyValue } from '../../progression/daily';
import { profileName } from '../../progression/profile';
import { store, useApp } from '../../state/store';
import { Button, GoalList, Icon, ProfileAvatar, Stars, TopBar } from '../components/common';
import { WorldArt } from './SetupScreen';

const DAYS = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];

/** Today's challenge plus a small family table of everybody's best run today. */
export function DailyScreen() {
  const profile = useApp((s) => s.profile);
  const profiles = useApp((s) => s.profiles);
  const now = new Date();
  const key = dailyKey(now);
  const spec = dailySpec(key);
  const world = WORLDS[spec.worldId];
  const mode = MODES[spec.mode];
  const mine = profile.daily.key === key ? profile.daily : null;
  const ghost = profile.ghosts[`${ghostKeyDaily(key, profile.campaign.difficulty)}:${profile.roles.length}`];
  const table = profiles
    .map((p) => ({ p, d: p.daily.key === key ? p.daily : null }))
    .sort((a, b) => {
      const va = a.d?.best ?? null;
      const vb = b.d?.best ?? null;
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return spec.mode === 'classic' ? va - vb : vb - va;
    });

  return (
    <div className="screen daily-screen" data-testid="daily">
      <TopBar title={`Denní výzva · ${DAYS[now.getDay()]} ${now.getDate()}. ${now.getMonth() + 1}.`} icon="calendar" />
      <div className="daily-body">
        <section className="daily-card">
          <div className="dc-hero" style={{ background: `linear-gradient(160deg, ${world.cardColors[0]}, ${world.cardColors[1]})` }}>
            <WorldArt id={spec.worldId} className="dc-art" />
            <div className="dc-head">
              <span className="dc-mode">
                <Icon name={mode.icon} size={40} />
              </span>
              <div>
                <h2>{mode.name}</h2>
                <span>
                  {world.name} · {DIFFICULTIES[profile.campaign.difficulty].name}
                </span>
              </div>
              <Stars count={mine?.stars ?? 0} size={32} />
            </div>
          </div>
          <div className="dc-content">
          <GoalList goals={spec.goals} text={goalText} icon={goalIcon} />
          <div className="dc-info">
            {mine?.best !== null && mine?.best !== undefined && (
              <span>
                <Icon name="trophy" size={24} /> Tvůj dnešní nejlepší: {formatDailyValue(spec.mode, mine.best)}
              </span>
            )}
            {ghost && (
              <span>
                <Icon name="ghost" size={24} /> Duch: {ghost.time.toFixed(1)} s
              </span>
            )}
            <span className={mine?.rewarded ? 'dc-done' : ''}>
              <Icon name={mine?.rewarded ? 'check' : 'coin'} size={24} />
              {mine?.rewarded ? 'Dnešní odměna je tvoje' : `Za dokončení +${DAILY_REWARDS.complete}, za 3 hvězdy +${DAILY_REWARDS.threeStars}`}
            </span>
          </div>
          <Button color="orange" size="lg" icon="play" onClick={() => store.startDaily()} testId="start-daily" className="dc-play">
            Závodit!
          </Button>
          </div>
        </section>
        <section className="daily-side">
          <h3>
            <Icon name="team" size={26} /> Dnešní tabulka
          </h3>
          <ol className="family-table" data-testid="family-table">
            {table.map(({ p, d }) => (
              <li key={p.id} className={p.id === profile.id ? 'me' : ''}>
                <ProfileAvatar avatar={p.avatar} size={44} />
                <span className="ft-name">{profileName(p)}</span>
                <span className="ft-val">{d && d.best !== null ? formatDailyValue(spec.mode, d.best) : 'Zatím bez jízdy'}</span>
                {d && d.best !== null && <Stars count={d.stars} size={18} />}
              </li>
            ))}
          </ol>
          <p className="daily-note">
            Každý den nová trať. Když jeden den vynecháš, nic se neděje. Splněno celkem: <b>{profile.daily.completed}</b>
          </p>
        </section>
      </div>
    </div>
  );
}
