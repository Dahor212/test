import { CUP_CONFIG } from '../../config/modes';
import { WORLDS } from '../../config/worlds';
import { cupStandings } from '../../progression/cup';
import { store, useApp } from '../../state/store';
import { Button, Icon, TopBar } from '../components/common';

export function CupScreen() {
  const active = useApp((s) => s.profile.activeCup);
  const last = useApp((s) => s.last);
  const cup = active ?? store.lastCup;
  if (!cup) {
    return (
      <div className="screen">
        <TopBar title="Dino pohár" />
        <p className="empty">Žádný pohár neprobíhá.</p>
      </div>
    );
  }
  const standings = cupStandings(cup);
  const finished = cup.finished || !active;
  return (
    <div className="screen cup-screen" data-testid="cup-screen">
      <TopBar title={finished ? 'Konec poháru!' : `Dino pohár – po ${cup.raceIndex}. závodě`} icon="trophy" />
      <div className="cup-body">
        <div className="cup-worlds">
          {cup.worlds.map((w, i) => (
            <div key={i} className={'cup-world' + (i < cup.raceIndex ? ' done' : i === cup.raceIndex && !finished ? ' next' : '')} style={{ background: `linear-gradient(135deg, ${WORLDS[w].cardColors[0]}, ${WORLDS[w].cardColors[1]})` }}>
              <b>{i + 1}.</b> {WORLDS[w].name}
              {i < cup.raceIndex && <Icon name="check" size={20} />}
            </div>
          ))}
        </div>
        <table className="cup-table" data-testid="cup-table">
          <thead>
            <tr>
              <th>Pořadí</th>
              <th>Závodník</th>
              {cup.races.map((_, i) => (
                <th key={i}>{i + 1}.</th>
              ))}
              <th>Body</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr key={s.id} className={s.human ? 'human' : ''}>
                <td>
                  <span className={`rank-badge place-${i + 1}`}>{i + 1}.</span>
                </td>
                <td>
                  <span className="rank-dot" style={{ background: s.color }} /> {s.name}
                </td>
                {cup.races.map((r, k) => (
                  <td key={k}>{CUP_CONFIG.points[(r.places[s.id] ?? 3) - 1] ?? 0}</td>
                ))}
                <td className="pts">{s.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {finished && last?.cupRewards && (
          <div className="cup-final" data-testid="cup-final">
            <Icon name="trophy" size={70} className="star-on" />
            <h2>{last.cupRewards.humanWon ? 'Vyhrál jsi Dino pohár!' : 'Skvělý pohár!'}</h2>
            <p>
              +{last.cupRewards.coins} mincí · +{last.cupRewards.eggs} vajíčko
            </p>
          </div>
        )}
      </div>
      <footer className="results-actions">
        {!finished ? (
          <>
            <Button color="orange" size="lg" icon="play" onClick={() => store.startCupRace()} testId="next-cup-race">
              Další závod ({cup.raceIndex + 1}/5)
            </Button>
            <Button
              color="red"
              size="sm"
              icon="close"
              onClick={() => {
                store.abandonCup();
                store.go('MENU');
              }}
            >
              Ukončit pohár
            </Button>
          </>
        ) : (
          <Button color="yellow" size="lg" icon="egg" onClick={() => store.go('EGG_HATCHING')} testId="cup-eggs">
            Otevřít vajíčko
          </Button>
        )}
        <Button color="white" size="md" icon="home" onClick={() => store.go('MENU')}>
          Menu
        </Button>
      </footer>
    </div>
  );
}
