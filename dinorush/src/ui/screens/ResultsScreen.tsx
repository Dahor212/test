import { useEffect, useState } from 'react';
import { goalIcon, goalText, LEVEL_BY_ID } from '../../config/campaign';
import { ARCHETYPE_INFO, DINO_BY_ID } from '../../config/dinosaurs';
import { WORLDS } from '../../config/worlds';
import { dailySpec, formatDailyValue } from '../../progression/daily';
import { MODES } from '../../config/modes';
import { sound } from '../../audio/sound';
import { store, useApp } from '../../state/store';
import type { ParticipantResult } from '../../types';
import { Button, CoinCounter, DinoThumb, formatTime, GoalList, Icon, Stars } from '../components/common';

function useCountUp(target: number, ms = 1200) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function mainValue(r: ParticipantResult, ranking: string): string {
  if (ranking === 'coins') return `${r.coins} mincí`;
  if (ranking === 'score') return `${r.score} bodů`;
  if (ranking === 'trex') return r.caught ? 'Dohoněn' : `Utekl o ${r.score} m`;
  return formatTime(r.finishTime);
}

/** Dino the racer used the most (shown on the podium). */
function favouriteDino(r: ParticipantResult): string {
  const entries = Object.entries(r.used) as [keyof typeof r.used, number][];
  entries.sort((a, b) => b[1] - a[1]);
  return r.loadout[entries[0][0]];
}

export function ResultsScreen() {
  const last = useApp((s) => s.last);
  const profile = useApp((s) => s.profile);
  const race = useApp((s) => s.race);
  useEffect(() => {
    sound.play('victory');
  }, []);
  const totalCoins = useCountUp(last?.rewards.totalCoins ?? 0);
  if (!last) return null;
  const { result, rewards } = last;
  const mode = MODES[result.config.mode];
  const podium = [result.results[1], result.results[0], result.results[2]].filter(Boolean);
  const heights = { 1: 150, 2: 110, 3: 80 } as Record<number, number>;
  const camp = last.campaign;
  const level = camp ? LEVEL_BY_ID[camp.levelId] : null;
  const daily = last.daily;
  const dspec = daily ? dailySpec(daily.key) : null;
  const ghost = last.ghost;
  const compactPodium = !!(camp || daily);
  const title = last.tutorial
    ? 'Výborně! Umíš to!'
    : camp
      ? camp.stars > 0
        ? 'Úroveň splněna!'
        : 'Skoro! Zkus to znovu'
      : daily
        ? 'Denní výzva'
        : mode.id === 'team'
          ? result.teamWon
            ? 'Tým vyhrál!'
            : 'Příště to dáte!'
          : 'Výsledky';

  return (
    <div className="screen results-screen" data-testid="results">
      <header className="results-head">
        <h1>{title}</h1>
        <CoinCounter big />
      </header>
      <div className="results-body">
        <div className={'podium-wrap' + (compactPodium ? ' compact' : '')}>
          {camp && level && (
            <div className={'level-result' + (camp.stars > 0 ? ' passed' : '')} data-testid="campaign-result">
              <div className="lr-head">
                <span className="lr-title">
                  {level.number}. {level.title}
                </span>
                <span className="lr-stars" data-testid="level-stars" data-stars={camp.stars}>
                  <Stars count={camp.stars} size={46} />
                </span>
              </div>
              <GoalList goals={level.goals} met={camp.met} text={goalText} icon={goalIcon} />
              {camp.newStars > 0 && (
                <div className="lr-new">
                  <Icon name="star" size={24} className="star-on" /> Nové hvězdy: +{camp.newStars}
                </div>
              )}
              {camp.unlockedWorld && (
                <div className="lr-new world">
                  <Icon name="map" size={24} /> Odemčen nový svět: {WORLDS[camp.unlockedWorld].name}!
                </div>
              )}
            </div>
          )}
          {daily && dspec && (
            <div className={'level-result daily' + (daily.stars > 0 ? ' passed' : '')} data-testid="daily-result">
              <div className="lr-head">
                <span className="lr-title">
                  <Icon name="calendar" size={28} /> {formatDailyValue(dspec.mode, daily.value)}
                  {daily.improved && <b className="lr-best">Nejlepší dnes!</b>}
                </span>
                <Stars count={daily.stars} size={42} />
              </div>
              <GoalList goals={dspec.goals} met={daily.met} text={goalText} icon={goalIcon} />
            </div>
          )}
          {mode.id === 'team' && (
            <div className={'team-result' + (result.teamWon ? ' won' : '')} data-testid="team-result">
              <Icon name="team" size={30} /> Tým: {formatTime(result.teamTime)} · Ptéro: {formatTime(result.rivalTime)} · Body: {result.teamScore}
            </div>
          )}
          <div className="podium">
            {podium.map((r) => (
              <div key={r.id} className={`podium-col place-${r.place}`} data-testid={`podium-${r.place}`}>
                <DinoThumb defId={favouriteDino(r)} accessory={null} size={r.place === 1 ? 130 : 105} />
                <div className="podium-name" style={{ color: r.color }}>
                  {r.name}
                </div>
                <Stars count={r.stars} size={r.place === 1 ? 26 : 20} />
                <div className="podium-block" style={{ height: heights[r.place] ?? 70 }}>
                  <span>{r.place}.</span>
                  <small>{mainValue(r, mode.ranking)}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="results-side">
          <table className="stats-table" data-testid="stats-table">
            <thead>
              <tr>
                <th />
                <th title="Správné úseky">
                  <Icon name="check" size={20} />
                </th>
                <th title="Perfektní proměny">
                  <Icon name="star" size={20} />
                </th>
                <th title="Nejdelší kombo">
                  <Icon name="combo" size={20} />
                </th>
                <th title="Mince">
                  <Icon name="coin" size={20} />
                </th>
                <th>{mode.ranking === 'finishTime' || mode.ranking === 'team' ? 'Čas' : mode.ranking === 'trex' ? 'T-Rex' : 'Body'}</th>
              </tr>
            </thead>
            <tbody>
              {result.results.map((r) => (
                <tr key={r.id} className={r.kind === 'human' ? 'human' : ''}>
                  <td>
                    <span className="rank-dot" style={{ background: r.color }} /> {r.place}. {r.name}
                  </td>
                  <td>{r.correctSegments}</td>
                  <td>{r.perfects}</td>
                  <td>{r.maxCombo}×</td>
                  <td>{r.coins}</td>
                  <td>{mode.ranking === 'score' ? r.score : mode.ranking === 'coins' ? r.coins : mode.ranking === 'trex' ? (r.caught ? <Icon name="trex" size={18} /> : `+${r.score} m`) : formatTime(r.finishTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="rewards-box" data-testid="rewards">
            <div className="reward-total">
              <Icon name="coin" size={40} /> +{totalCoins}
            </div>
            {rewards.players.map((pr) => (
              <div key={pr.participantId} className="reward-player">
                {rewards.players.length > 1 && <b>{pr.name}</b>}
                <ul>
                  {pr.lines.map((l, i) => (
                    <li key={i}>
                      <span>{l.label}</span>
                      <span>+{l.amount}</span>
                    </li>
                  ))}
                </ul>
                <div className="xp-lines">
                  {pr.xp.map((x) => (
                    <span key={x.defId} className="xp-chip" style={{ background: ARCHETYPE_INFO[x.archetype].color }}>
                      {DINO_BY_ID[x.defId].name} +{x.xp} XP{x.levelAfter > x.levelBefore ? ` · úroveň ${x.levelAfter}!` : ''}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {ghost && ghost.had && (
              <div className={'record-line ghost-line' + (ghost.beaten ? ' beaten' : '')} data-testid="ghost-result">
                <Icon name="ghost" size={24} />
                {ghost.beaten
                  ? `Duch poražen o ${Math.abs(ghost.delta ?? 0).toFixed(1)} s!`
                  : ghost.delta !== null
                    ? `Duch byl rychlejší o ${ghost.delta.toFixed(1)} s`
                    : 'Duch tentokrát vyhrál'}
              </div>
            )}
            {ghost && !ghost.had && ghost.saved && (
              <div className="record-line ghost-line" data-testid="ghost-result">
                <Icon name="ghost" size={24} /> Tvoje jízda se uložila jako duch. Zkus ho příště porazit!
              </div>
            )}
            {rewards.records.map((r) => (
              <div key={r} className="record-line">
                <Icon name="trophy" size={22} /> {r}
              </div>
            ))}
            {rewards.missions.map((m) => (
              <div key={m.id} className="mission-line">
                <Icon name="check" size={22} /> Úkol: {m.title} (+{m.reward.coins})
              </div>
            ))}
            {rewards.eggsEarned > 0 ? (
              <div className="egg-line" data-testid="egg-earned">
                <Icon name="egg" size={30} /> Nové vajíčko!
              </div>
            ) : (
              <div className="egg-line muted">
                <Icon name="egg" size={24} /> Vajíčko: {profile.eggs.racesTowardNext}/3 závodů
              </div>
            )}
            {last.cupRewards && (
              <div className="record-line">
                <Icon name="trophy" size={22} /> Pohár dokončen: +{last.cupRewards.coins} mincí a vajíčko!
              </div>
            )}
          </div>
        </div>
      </div>
      <footer className="results-actions">
        {mode.id === 'cup' ? (
          <Button color="yellow" size="lg" icon="trophy" onClick={() => store.go('CUP_STANDINGS')} testId="cup-standings">
            Pořadí poháru
          </Button>
        ) : last.tutorial ? (
          <Button color="orange" size="lg" icon="play" onClick={() => store.startSetup()} testId="play-after-tutorial">
            Hrát závod!
          </Button>
        ) : camp ? (
          <>
            {camp.nextLevelId && camp.stars > 0 && (
              <Button color="orange" size="lg" icon="next" onClick={() => store.startCampaignLevel(camp.nextLevelId!)} testId="next-level">
                Další úroveň
              </Button>
            )}
            <Button color={camp.stars > 0 ? 'blue' : 'orange'} size={camp.stars > 0 ? 'md' : 'lg'} icon="play" onClick={() => race && store.replay(race)} testId="play-again">
              Zkusit znovu
            </Button>
            <Button color="green" size="md" icon="map" onClick={() => store.go('CAMPAIGN')} testId="to-map">
              Mapa
            </Button>
          </>
        ) : daily ? (
          <>
            <Button color="orange" size="lg" icon="play" onClick={() => race && store.replay(race)} testId="play-again">
              Zkusit znovu
            </Button>
            <Button color="blue" size="md" icon="calendar" onClick={() => store.openDaily()} testId="to-daily">
              Denní tabulka
            </Button>
          </>
        ) : (
          <>
            <Button color="orange" size="lg" icon="play" onClick={() => race && store.replay(race)} testId="play-again">
              HRÁT ZNOVU
            </Button>
            <Button color="blue" size="md" icon="swap" onClick={() => race && store.startRace(undefined, race.setup)} testId="new-track">
              Nová trať
            </Button>
          </>
        )}
        {profile.eggs.pending > 0 && (
          <Button color="yellow" size="md" icon="egg" onClick={() => store.go('EGG_HATCHING')} testId="go-eggs">
            Otevřít vajíčko
          </Button>
        )}
        <Button color="white" size="md" icon="home" onClick={() => store.go('MENU')} testId="to-menu">
          HLAVNÍ MENU
        </Button>
      </footer>
      <p className="seed-note">Trať č. {result.config.seed}</p>
    </div>
  );
}
