import { DIFFICULTIES } from '../../config/difficulty';
import { WORLDS } from '../../config/worlds';
import { missionStatus } from '../../progression/missions';
import { useApp } from '../../state/store';
import type { DifficultyId, WorldId } from '../../types';
import { formatTime, Icon, ProgressBar, TopBar } from '../components/common';

export function MissionsScreen() {
  const profile = useApp((s) => s.profile);
  const list = missionStatus(profile);
  const done = list.filter((m) => m.completed).length;
  const r = profile.records;
  return (
    <div className="screen missions-screen" data-testid="missions">
      <TopBar title={`Úkoly (${done}/${list.length})`} icon="list" />
      <div className="missions-body">
        <div className="mission-list">
          {list.map((m) => (
            <div key={m.def.id} className={'mission' + (m.completed ? ' done' : '')} data-testid={`mission-${m.def.id}`}>
              <span className="mission-icon">
                <Icon name={m.def.icon} size={34} />
              </span>
              <div className="mission-main">
                <b>{m.def.title}</b>
                <small>{m.def.description}</small>
                <ProgressBar value={m.progress / m.def.target} color={m.completed ? '#2ed573' : '#ffa502'} label={`${Math.floor(m.progress)}/${m.def.target}`} />
              </div>
              <span className="mission-reward">
                {m.completed ? (
                  <Icon name="check" size={34} />
                ) : (
                  <>
                    <Icon name="coin" size={22} />
                    {m.def.reward.coins}
                    {m.def.reward.eggs ? (
                      <>
                        {' '}
                        <Icon name="egg" size={20} />
                      </>
                    ) : null}
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="records" data-testid="records">
          <h2>
            <Icon name="trophy" size={28} /> Rekordy
          </h2>
          <ul>
            <li>
              Závody: <b>{profile.stats.racesFinished}</b> · Výhry: <b>{profile.stats.wins}</b>
            </li>
            <li>
              Nekonečná výprava: <b>{r.endlessBest}</b> bodů
            </li>
            <li>
              Zlatá horečka: <b>{r.goldBest}</b> mincí
            </li>
            <li>
              Náskok před T-Rexem: <b>{r.trexBestLead}</b> m
            </li>
            <li>
              Nejdelší kombo: <b>{profile.stats.maxCombo}×</b> · Perfektní proměny: <b>{profile.stats.perfects}</b>
            </li>
          </ul>
          <h3>Nejlepší časy</h3>
          <ul className="best-times">
            {Object.entries(r.bestTimes).length === 0 && <li className="muted">Zatím žádné</li>}
            {Object.entries(r.bestTimes).map(([k, v]) => {
              const [w, d] = k.split('-') as [WorldId, DifficultyId];
              return (
                <li key={k}>
                  {WORLDS[w]?.name} · {DIFFICULTIES[d]?.name}: <b>{formatTime(v)}</b>
                </li>
              );
            })}
          </ul>
          <h3>Poháry</h3>
          <ul>
            {profile.cupHistory.length === 0 && <li className="muted">Zatím žádný pohár</li>}
            {[...profile.cupHistory].reverse().map((c, i) => (
              <li key={i}>
                {new Date(c.date).toLocaleDateString('cs-CZ')}: {c.standings.map((s) => `${s.name} ${s.points}`).join(' · ')}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
