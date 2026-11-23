import { useEffect, useRef, useState } from 'react';
import { DECORATION_LIST, DECORATIONS } from '../../config/economy';
import { sound } from '../../audio/sound';
import { buyDecoration, moveDecoration, placeDecoration, removeDecoration } from '../../progression/park';
import { ParkRenderer } from '../../render/parkRenderer';
import { store, useApp } from '../../state/store';
import type { DecorationId } from '../../types';
import { Button, Icon, TopBar } from '../components/common';

type Tool = { kind: 'none' } | { kind: 'place'; id: DecorationId } | { kind: 'selected'; cell: number } | { kind: 'move'; cell: number };

export function ParkScreen() {
  const profile = useApp((s) => s.profile);
  const park = profile.park;
  const el = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ParkRenderer | null>(null);
  const [tool, setTool] = useState<Tool>({ kind: 'none' });
  const [tab, setTab] = useState<'shop' | 'inventory'>('inventory');
  const toolRef = useRef(tool);
  toolRef.current = tool;

  useEffect(() => {
    if (!el.current) return;
    try {
      const r = new ParkRenderer(el.current, park.cols, park.rows);
      rendererRef.current = r;
      (window as unknown as { __park?: ParkRenderer }).__park = r;
      r.onCellTap = (cell) => onCell(cell);
    } catch {
      rendererRef.current = null;
    }
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rendererRef.current?.setCells(park.cells);
  }, [park.cells]);

  const dinoKey = Object.keys(profile.dinos).join(',') + Object.values(profile.dinos).map((d) => d.accessory).join(',');
  useEffect(() => {
    rendererRef.current?.setDinos(Object.values(profile.dinos).map((d) => ({ defId: d.defId, accessory: d.accessory })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dinoKey]);

  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    if (tool.kind === 'place') r.setHighlight('place', null);
    else if (tool.kind === 'move') r.setHighlight('move', tool.cell);
    else if (tool.kind === 'selected') r.setHighlight('none', tool.cell);
    else r.setHighlight('none', null);
  }, [tool]);

  function onCell(cell: number) {
    const t = toolRef.current;
    const cells = store.get().profile.park.cells;
    if (t.kind === 'place') {
      if (cells[cell]) return;
      const res = store.updateProfile((p) => placeDecoration(p, cell, t.id));
      if (res.ok) {
        sound.play('buy');
        for (const m of res.missions ?? []) store.toast(`Úkol splněn: ${m.title}`, 'check');
        const left = store.get().profile.park.inventory[t.id] ?? 0;
        if (left <= 0) setTool({ kind: 'none' });
      }
      return;
    }
    if (t.kind === 'move') {
      if (!cells[cell]) {
        store.updateProfile((p) => moveDecoration(p, t.cell, cell));
        sound.play('tap');
      }
      setTool({ kind: 'none' });
      return;
    }
    if (cells[cell]) setTool({ kind: 'selected', cell });
    else setTool({ kind: 'none' });
  }

  const inventory = DECORATION_LIST.filter((d) => (park.inventory[d.id] ?? 0) > 0);
  const placed = park.cells.filter(Boolean).length;

  return (
    <div className="screen park-screen" data-testid="park">
      <TopBar title="Dino Park" icon="park" />
      <div className="park-body">
        <div className="park-view" ref={el} data-testid="park-view">
          <div className="park-hint">
            {tool.kind === 'place' && (
              <>
                <Icon name="hand" size={30} /> Klepni na volné políčko: {DECORATIONS[tool.id].name}
              </>
            )}
            {tool.kind === 'move' && (
              <>
                <Icon name="move" size={26} /> Klepni, kam to přesunout
              </>
            )}
            {tool.kind === 'none' && `Dinosauři: ${Object.keys(profile.dinos).length} · Dekorace: ${placed}/${park.cells.length}`}
          </div>
          {tool.kind === 'selected' && park.cells[tool.cell] && (
            <div className="park-actions" data-testid="park-actions">
              <b>{DECORATIONS[park.cells[tool.cell]!].name}</b>
              <Button color="blue" size="sm" icon="move" onClick={() => setTool({ kind: 'move', cell: tool.cell })} testId="deco-move">
                Přesunout
              </Button>
              <Button
                color="red"
                size="sm"
                icon="trash"
                testId="deco-remove"
                onClick={() => {
                  store.updateProfile((p) => removeDecoration(p, tool.cell));
                  setTool({ kind: 'none' });
                }}
              >
                Uklidit
              </Button>
              <Button color="white" size="sm" icon="close" onClick={() => setTool({ kind: 'none' })} />
            </div>
          )}
        </div>
        <aside className="park-panel">
          <div className="tabs">
            <button type="button" className={tab === 'inventory' ? 'on' : ''} onClick={() => setTab('inventory')} data-testid="tab-inventory">
              Moje věci
            </button>
            <button type="button" className={tab === 'shop' ? 'on' : ''} onClick={() => setTab('shop')} data-testid="tab-shop">
              Obchod
            </button>
          </div>
          {tab === 'inventory' ? (
            <div className="deco-list">
              {inventory.length === 0 && <p className="empty">Nic tu není. Kup si něco v obchodě!</p>}
              {inventory.map((d) => (
                <button
                  type="button"
                  key={d.id}
                  data-testid={`inv-${d.id}`}
                  className={'deco-item' + (tool.kind === 'place' && tool.id === d.id ? ' on' : '')}
                  onClick={() => {
                    sound.play('tap');
                    setTool({ kind: 'place', id: d.id });
                  }}
                >
                  <span className={`deco-swatch deco-${d.id}`} />
                  <span className="deco-name">{d.name}</span>
                  <span className="deco-count">×{park.inventory[d.id]}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="deco-list">
              {DECORATION_LIST.map((d) => (
                <div key={d.id} className="deco-item shop">
                  <span className={`deco-swatch deco-${d.id}`} />
                  <span className="deco-name">
                    {d.name}
                    <small>{d.description}</small>
                  </span>
                  <Button
                    color={profile.coins >= d.price ? 'green' : 'white'}
                    size="sm"
                    disabled={profile.coins < d.price}
                    testId={`buy-${d.id}`}
                    onClick={() => {
                      const r = store.updateProfile((p) => buyDecoration(p, d.id));
                      if (r.ok) {
                        sound.play('buy');
                        store.toast(`Koupeno: ${d.name}`, 'shop');
                        setTab('inventory');
                        setTool({ kind: 'place', id: d.id });
                      }
                    }}
                  >
                    <Icon name="coin" size={16} />
                    {d.price}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
