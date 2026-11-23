import { memo } from 'react';
import { CAMPAIGN_LEVELS, LEVEL_BY_ID, REGIONS } from '../../config/campaign';
import { Rng } from '../../core/rng';
import type { RegionId } from '../../types';

/**
 * Illustrated career map (SVG, 1000 × 700): ocean, the island, six regions
 * with their own decorations, the paths between places and fog over
 * regions that are still closed. Drawn once – it does not depend on time.
 */

type Pt = [number, number];

/** Closed Catmull-Rom curve through points as an SVG path. */
function closedCurve(pts: Pt[]): string {
  const n = pts.length;
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0]} ${p2[1]}`;
  }
  return d + ' Z';
}

/** Organic blob around a centre. */
function blob(cx: number, cy: number, rx: number, ry: number, seed: number, n = 10): string {
  const rng = new Rng(seed);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.82 + rng.next() * 0.3;
    pts.push([Math.round(cx + Math.cos(a) * rx * k), Math.round(cy + Math.sin(a) * ry * k)]);
  }
  return closedCurve(pts);
}

const ISLAND: Pt[] = [
  [70, 560], [40, 420], [60, 260], [150, 140], [290, 60], [500, 30], [700, 30], [860, 70], [975, 170], [985, 330], [975, 470], [960, 600], [840, 670], [640, 685], [430, 690], [240, 690], [100, 660],
];

interface RegionShape {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export const REGION_SHAPES: Record<RegionId, RegionShape> = {
  jungle: { cx: 225, cy: 540, rx: 185, ry: 125 },
  swamp: { cx: 200, cy: 290, rx: 165, ry: 120 },
  canyon: { cx: 548, cy: 555, rx: 160, ry: 115 },
  volcano: { cx: 628, cy: 325, rx: 165, ry: 115 },
  ice: { cx: 548, cy: 105, rx: 255, ry: 85 },
  islands: { cx: 878, cy: 285, rx: 105, ry: 190 },
};

const nodes = CAMPAIGN_LEVELS.map((l) => [l.x, l.y] as Pt);
const nearNode = (x: number, y: number, d = 34) => nodes.some(([nx, ny]) => Math.hypot(nx - x, ny - y) < d);

/** Deterministic scatter of decoration points inside a region. */
function scatter(region: RegionId, count: number, seed: number, minDist = 34): Pt[] {
  const s = REGION_SHAPES[region];
  const rng = new Rng(seed);
  const out: Pt[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 30) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * 0.86;
    const x = s.cx + Math.cos(a) * s.rx * r;
    const y = s.cy + Math.sin(a) * s.ry * r;
    if (nearNode(x, y, minDist)) continue;
    if (out.some(([ox, oy]) => Math.hypot(ox - x, oy - y) < 16)) continue;
    out.push([x, y]);
  }
  return out;
}

function Tree({ x, y, s = 1, dark = '#1f7a3a', light = '#3cb460' }: { x: number; y: number; s?: number; dark?: string; light?: string }) {
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s})`}>
      <rect x={-2} y={0} width={4} height={10} rx={1.5} fill="#7a4b22" />
      <circle cx={0} cy={-4} r={10} fill={dark} />
      <circle cx={-4} cy={-7} r={6} fill={light} />
    </g>
  );
}

function Palm({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <path d="M0 10 Q-2 0 2 -12" stroke="#9c6b30" strokeWidth={3} fill="none" strokeLinecap="round" />
      <path d="M2 -12 Q-10 -16 -16 -8 M2 -12 Q14 -18 18 -8 M2 -12 Q-4 -22 -10 -22 M2 -12 Q10 -24 16 -20" stroke="#2ecc71" strokeWidth={4} fill="none" strokeLinecap="round" />
    </g>
  );
}

function Mesa({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s})`}>
      <path d="M-20 10 L-13 -10 L13 -10 L20 10 Z" fill="#c8662f" />
      <path d="M-13 -10 L13 -10 L11 -5 L-11 -5 Z" fill="#f0a560" />
      <path d="M-16 1 L16 1" stroke="#a9501f" strokeWidth={2} />
    </g>
  );
}

function Mountain({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s})`}>
      <path d="M-22 12 L0 -20 L22 12 Z" fill="#8fb8de" />
      <path d="M-8 -8 L0 -20 L8 -8 L4 -5 L0 -9 L-4 -5 Z" fill="#ffffff" />
    </g>
  );
}

function Reeds({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} stroke="#2f5d36" strokeWidth={2} strokeLinecap="round">
      <path d="M0 8 L-3 -8 M3 8 L4 -10 M6 8 L9 -6" />
      <ellipse cx={4} cy={-11} rx={2} ry={4} fill="#7a4b22" stroke="none" />
    </g>
  );
}

function Rock({ x, y }: { x: number; y: number }) {
  return <path d={`M${x - 8} ${y + 5} L${x - 5} ${y - 4} L${x + 3} ${y - 6} L${x + 9} ${y + 5} Z`} fill="#6b5b57" />;
}

/** Path between two places: a soft curve. */
export function pathBetween(a: Pt, b: Pt): string {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const bend = 0.18;
  return `M ${a[0]} ${a[1]} Q ${mx - dy * bend} ${my + dx * bend} ${b[0]} ${b[1]}`;
}

export const WorldMapArt = memo(function WorldMapArt({ openRegions, openEdges }: { openRegions: RegionId[]; openEdges: Set<string> }) {
  const edges: { id: string; a: Pt; b: Pt }[] = [];
  for (const l of CAMPAIGN_LEVELS) for (const f of l.from) edges.push({ id: `${f}>${l.id}`, a: [LEVEL_BY_ID[f].x, LEVEL_BY_ID[f].y], b: [l.x, l.y] });
  return (
    <svg className="world-map-art" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <radialGradient id="ocean" cx="50%" cy="45%" r="75%">
          <stop offset="0%" stopColor="#5fd0ff" />
          <stop offset="100%" stopColor="#1c7fd6" />
        </radialGradient>
        {Object.values(REGIONS).map((r) => (
          <radialGradient key={r.id} id={`rg-${r.id}`} cx="45%" cy="40%" r="70%">
            <stop offset="0%" stopColor={r.colors[0]} />
            <stop offset="100%" stopColor={r.colors[1]} />
          </radialGradient>
        ))}
      </defs>
      <rect x={0} y={0} width={1000} height={700} fill="url(#ocean)" />
      {/* gentle waves */}
      {Array.from({ length: 26 }, (_, i) => {
        const rng = new Rng(900 + i);
        const x = rng.next() * 1000;
        const y = rng.next() * 700;
        return <path key={i} d={`M${x} ${y} q8 -6 16 0 t16 0`} stroke="rgba(255,255,255,0.45)" strokeWidth={2.5} fill="none" strokeLinecap="round" />;
      })}
      {/* the island: sandy beach and green inland */}
      <path d={closedCurve(ISLAND)} fill="#f6dfa8" stroke="#fff3cf" strokeWidth={10} />
      <path d={closedCurve(ISLAND.map(([x, y]) => [500 + (x - 500) * 0.95, 360 + (y - 360) * 0.94] as Pt))} fill="#8fd16a" />
      {/* regions */}
      {(Object.keys(REGION_SHAPES) as RegionId[]).map((id, i) => {
        const s = REGION_SHAPES[id];
        return <path key={id} d={blob(s.cx, s.cy, s.rx, s.ry, 40 + i * 7, 11)} fill={`url(#rg-${id})`} opacity={0.95} />;
      })}
      {/* decorations per region */}
      {scatter('jungle', 26, 11).map(([x, y], i) => (
        <Tree key={`j${i}`} x={x} y={y} s={0.9 + (i % 3) * 0.15} />
      ))}
      {scatter('swamp', 8, 21, 40).map(([x, y], i) => (
        <ellipse key={`sw${i}`} cx={x} cy={y} rx={16 + (i % 3) * 5} ry={7 + (i % 2) * 3} fill="#4f8f88" opacity={0.75} />
      ))}
      {scatter('swamp', 18, 22).map(([x, y], i) => (i % 3 ? <Reeds key={`sr${i}`} x={x} y={y} /> : <Tree key={`st${i}`} x={x} y={y} s={0.8} dark="#2e5e3a" light="#4f8a54" />))}
      {scatter('canyon', 12, 31, 38).map(([x, y], i) => (
        <Mesa key={`c${i}`} x={x} y={y} s={0.8 + (i % 3) * 0.2} />
      ))}
      {scatter('canyon', 8, 32).map(([x, y], i) => (
        <Rock key={`cr${i}`} x={x} y={y} />
      ))}
      {/* the volcano */}
      <g transform="translate(632 332)">
        <path d="M-62 34 L-18 -36 L18 -36 L62 34 Z" fill="#5b3a33" />
        <path d="M-18 -36 L18 -36 L12 -26 L-12 -26 Z" fill="#ff7a1a" />
        <path d="M-6 -30 Q-10 -6 -22 30 M6 -30 Q14 0 30 30" stroke="#ff9f1a" strokeWidth={5} fill="none" strokeLinecap="round" />
        <circle cx={-6} cy={-52} r={12} fill="rgba(120,110,110,0.55)" />
        <circle cx={10} cy={-66} r={16} fill="rgba(120,110,110,0.45)" />
      </g>
      {scatter('volcano', 10, 41).map(([x, y], i) => (
        <Rock key={`vr${i}`} x={x} y={y} />
      ))}
      {scatter('ice', 16, 51, 36).map(([x, y], i) => (
        <Mountain key={`im${i}`} x={x} y={y} s={0.7 + (i % 3) * 0.25} />
      ))}
      {scatter('ice', 5, 52, 40).map(([x, y], i) => (
        <ellipse key={`il${i}`} cx={x} cy={y} rx={18} ry={7} fill="#d8f3ff" stroke="#9fd6f5" strokeWidth={2} />
      ))}
      {scatter('islands', 14, 61).map(([x, y], i) => (
        <Palm key={`ip${i}`} x={x} y={y} />
      ))}
      {/* paths between places (open ones are bright) */}
      {edges.map((e) => (
        <path key={e.id} d={pathBetween(e.a, e.b)} className={'map-trail' + (openEdges.has(e.id) ? ' open' : '')} />
      ))}
      {/* fog over closed regions */}
      {(Object.keys(REGION_SHAPES) as RegionId[])
        .filter((id) => !openRegions.includes(id))
        .map((id, i) => {
          const s = REGION_SHAPES[id];
          return (
            <g key={`fog-${id}`} className="map-fog">
              <path d={blob(s.cx, s.cy, s.rx * 1.08, s.ry * 1.1, 70 + i * 3, 12)} fill="rgba(240,246,255,0.78)" />
              <circle cx={s.cx - s.rx * 0.4} cy={s.cy - s.ry * 0.2} r={s.ry * 0.45} fill="rgba(255,255,255,0.55)" />
              <circle cx={s.cx + s.rx * 0.35} cy={s.cy + s.ry * 0.15} r={s.ry * 0.5} fill="rgba(255,255,255,0.5)" />
            </g>
          );
        })}
    </svg>
  );
});
