/**
 * Procedural SVG icons (no external image files). The same markup is used by
 * React (inline) and by the 3D renderer (rasterised into canvas textures).
 */
import type { Archetype } from '../types';

export interface DinoIconColors {
  body: string;
  belly: string;
  accent: string;
  outline: string;
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function paletteToIconColors(p: { body: number; belly: number; accent: number }): DinoIconColors {
  return { body: hex(p.body), belly: hex(p.belly), accent: hex(p.accent), outline: '#1d1d35' };
}

function eye(cx: number, cy: number, r = 6) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="#1d1d35" stroke-width="2"/><circle cx="${cx + r * 0.25}" cy="${cy + r * 0.05}" r="${r * 0.55}" fill="#1d1d35"/><circle cx="${cx + r * 0.45}" cy="${cy - r * 0.3}" r="${r * 0.22}" fill="#fff"/>`;
}

const dinoBodies: Record<Archetype, (c: DinoIconColors) => string> = {
  raptor: (c) => `
    <g stroke="${c.outline}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
      <path d="M44 50 Q22 44 4 30 Q16 52 44 62 Z" fill="${c.body}"/>
      <path d="M46 62 L40 84 L50 86" fill="none" stroke="${c.outline}" stroke-width="9"/>
      <path d="M46 62 L40 84 L50 86" fill="none" stroke="${c.accent}" stroke-width="5"/>
      <path d="M58 62 L62 84 L72 86" fill="none" stroke="${c.outline}" stroke-width="9"/>
      <path d="M58 62 L62 84 L72 86" fill="none" stroke="${c.body}" stroke-width="5"/>
      <ellipse cx="54" cy="54" rx="21" ry="14" fill="${c.body}" transform="rotate(-16 54 54)"/>
      <path d="M46 62 Q56 68 68 58" fill="${c.belly}" stroke="none"/>
      <path d="M62 50 Q66 34 74 26 L84 32 Q76 42 74 54 Z" fill="${c.body}"/>
      <path d="M68 24 Q80 12 94 22 Q98 30 90 36 L74 38 Q66 32 68 24 Z" fill="${c.body}"/>
      <path d="M78 34 Q86 36 94 31" fill="none" stroke-width="2.5"/>
      <path d="M68 58 L76 62 L78 58" fill="none" stroke-width="3"/>
      <path d="M44 44 L48 38 L52 44 M52 42 L56 36 L60 42" fill="${c.accent}" stroke-width="2"/>
    </g>
    ${eye(80, 24, 6.5)}`,
  spino: (c) => `
    <g stroke="${c.outline}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
      <path d="M26 50 Q30 12 52 10 Q70 12 72 44 Z" fill="${c.accent}"/>
      <path d="M36 46 L38 22 M46 44 L48 14 M56 44 L58 16 M64 46 L66 26" stroke-width="2" fill="none" opacity="0.6"/>
      <path d="M34 54 Q16 52 2 62 Q18 68 36 64 Z" fill="${c.body}"/>
      <path d="M40 64 L36 86 L46 88" fill="none" stroke-width="9"/>
      <path d="M40 64 L36 86 L46 88" fill="none" stroke="${c.body}" stroke-width="5"/>
      <path d="M58 64 L60 86 L70 88" fill="none" stroke-width="9"/>
      <path d="M58 64 L60 86 L70 88" fill="none" stroke="${c.body}" stroke-width="5"/>
      <ellipse cx="50" cy="56" rx="24" ry="14" fill="${c.body}"/>
      <path d="M34 62 Q50 72 66 62" fill="${c.belly}" stroke="none"/>
      <path d="M66 50 Q72 40 78 38 L82 48 Q76 52 72 60 Z" fill="${c.body}"/>
      <path d="M72 36 Q80 30 98 40 Q98 46 90 46 L74 48 Q68 42 72 36 Z" fill="${c.body}"/>
      <path d="M80 44 L96 43" fill="none" stroke-width="2.5"/>
    </g>
    ${eye(78, 36, 6)}`,
  ankylo: (c) => `
    <g stroke="${c.outline}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
      <path d="M22 60 Q12 58 8 52" fill="none" stroke-width="9"/>
      <path d="M22 60 Q12 58 8 52" fill="none" stroke="${c.body}" stroke-width="5"/>
      <ellipse cx="8" cy="50" rx="8" ry="7" fill="${c.accent}"/>
      <rect x="26" y="66" width="10" height="18" rx="4" fill="${c.body}"/>
      <rect x="62" y="66" width="10" height="18" rx="4" fill="${c.body}"/>
      <path d="M18 66 Q20 30 50 28 Q80 30 82 66 Z" fill="${c.accent}"/>
      <path d="M24 66 Q50 74 78 66" fill="${c.body}"/>
      <circle cx="36" cy="44" r="5" fill="${c.belly}"/><circle cx="50" cy="38" r="5" fill="${c.belly}"/><circle cx="64" cy="44" r="5" fill="${c.belly}"/>
      <circle cx="30" cy="56" r="4" fill="${c.belly}"/><circle cx="50" cy="52" r="4" fill="${c.belly}"/><circle cx="70" cy="56" r="4" fill="${c.belly}"/>
      <path d="M22 50 L14 46 L20 56 M78 50 L86 46 L80 56 M40 32 L38 22 L46 30 M58 30 L62 22 L62 32" fill="${c.belly}" stroke-width="2"/>
      <path d="M76 56 Q86 46 96 54 Q98 64 88 66 L78 66 Z" fill="${c.body}"/>
      <path d="M88 62 L97 60" fill="none" stroke-width="2.5"/>
    </g>
    ${eye(86, 54, 5.5)}`,
  trike: (c) => `
    <g stroke="${c.outline}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
      <path d="M20 58 Q8 58 4 66 Q14 68 22 66 Z" fill="${c.body}"/>
      <rect x="24" y="64" width="11" height="22" rx="4" fill="${c.body}"/>
      <rect x="54" y="64" width="11" height="22" rx="4" fill="${c.body}"/>
      <ellipse cx="44" cy="58" rx="26" ry="17" fill="${c.body}"/>
      <path d="M26 66 Q44 76 62 66" fill="${c.belly}" stroke="none"/>
      <path d="M58 26 Q74 14 80 30 Q84 48 66 58 Q56 52 54 40 Z" fill="${c.accent}"/>
      <path d="M62 30 L60 24 M70 24 L70 18 M78 28 L82 24" fill="none" stroke-width="2.5"/>
      <path d="M64 48 Q76 36 90 46 Q98 54 92 62 L74 64 Q64 60 64 48 Z" fill="${c.body}"/>
      <path d="M76 42 L92 24 L80 44 Z" fill="${c.belly}" stroke-width="2"/>
      <path d="M68 44 L80 28 L72 46 Z" fill="${c.belly}" stroke-width="2"/>
      <path d="M90 50 L98 44 L94 54 Z" fill="${c.belly}" stroke-width="2"/>
    </g>
    ${eye(78, 50, 5.5)}`,
};

export function dinoIconSvg(arch: Archetype, colors: DinoIconColors): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${dinoBodies[arch](colors)}</svg>`;
}

// ---------------------------------------------------------------------------
// Terrain icons (round badges)
// ---------------------------------------------------------------------------

const terrainArt: Record<string, string> = {
  grass: `<circle cx="50" cy="50" r="46" fill="#6ccf3d"/>
    <path d="M18 72 L26 40 L32 72 M34 72 L44 30 L50 72 M52 72 L60 36 L66 72 M68 72 L76 44 L82 72" fill="#2f8f1c" stroke="#1f5f12" stroke-width="2" stroke-linejoin="round"/>`,
  path: `<circle cx="50" cy="50" r="46" fill="#e8b878"/>
    <path d="M38 92 Q46 50 40 8 L60 8 Q54 50 62 92 Z" fill="#c48a52"/>
    <circle cx="30" cy="30" r="4" fill="#9c6b3c"/><circle cx="72" cy="60" r="5" fill="#9c6b3c"/><circle cx="26" cy="68" r="3" fill="#9c6b3c"/>`,
  bridge: `<circle cx="50" cy="50" r="46" fill="#5ec8f0"/>
    <rect x="14" y="40" width="72" height="22" rx="3" fill="#a0632e" stroke="#5c3512" stroke-width="3"/>
    <path d="M26 40 V62 M38 40 V62 M50 40 V62 M62 40 V62 M74 40 V62" stroke="#5c3512" stroke-width="2.5"/>
    <path d="M14 34 H86" stroke="#5c3512" stroke-width="4" stroke-linecap="round"/>`,
  water: `<circle cx="50" cy="50" r="46" fill="#2ec4f0"/>
    <path d="M14 40 Q24 30 34 40 T54 40 T74 40 T90 38" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
    <path d="M10 62 Q20 52 30 62 T50 62 T70 62 T90 60" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`,
  deepWater: `<circle cx="50" cy="50" r="46" fill="#1259b5"/>
    <path d="M12 32 Q22 22 32 32 T52 32 T72 32 T90 30" fill="none" stroke="#8fd8ff" stroke-width="5" stroke-linecap="round"/>
    <path d="M10 50 Q20 40 30 50 T50 50 T70 50 T90 48" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
    <path d="M40 62 L50 82 L60 62" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
  stones: `<circle cx="50" cy="50" r="46" fill="#cfc2b0"/>
    <path d="M14 76 L22 50 L40 42 L52 58 L48 78 Z" fill="#8c8076" stroke="#4d4640" stroke-width="3" stroke-linejoin="round"/>
    <path d="M44 78 L52 40 L70 30 L86 52 L82 78 Z" fill="#a59a8f" stroke="#4d4640" stroke-width="3" stroke-linejoin="round"/>
    <path d="M58 44 L66 40" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
  wood: `<circle cx="50" cy="50" r="46" fill="#7ccf5a"/>
    <rect x="16" y="36" width="68" height="12" rx="3" fill="#b07a3c" stroke="#5c3512" stroke-width="3"/>
    <rect x="16" y="54" width="68" height="12" rx="3" fill="#b07a3c" stroke="#5c3512" stroke-width="3"/>
    <rect x="22" y="28" width="10" height="48" rx="3" fill="#8a5a28" stroke="#5c3512" stroke-width="3"/>
    <rect x="68" y="28" width="10" height="48" rx="3" fill="#8a5a28" stroke="#5c3512" stroke-width="3"/>`,
  scree: `<circle cx="50" cy="50" r="46" fill="#9b928b"/>
    <path d="M30 70 L40 38 L62 32 L74 56 L66 74 Z" fill="#6e655f" stroke="#3b3531" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="22" cy="58" r="6" fill="#58504a"/><circle cx="80" cy="72" r="5" fill="#58504a"/><circle cx="76" cy="34" r="4" fill="#58504a"/><circle cx="26" cy="36" r="4" fill="#58504a"/>`,
  mud: `<circle cx="50" cy="50" r="46" fill="#7a4f2a"/>
    <ellipse cx="50" cy="62" rx="32" ry="14" fill="#5e3b1e"/>
    <circle cx="36" cy="44" r="7" fill="none" stroke="#c49a6c" stroke-width="4"/>
    <circle cx="62" cy="36" r="5" fill="none" stroke="#c49a6c" stroke-width="4"/>
    <circle cx="58" cy="60" r="4" fill="#c49a6c"/>`,
  sand: `<circle cx="50" cy="50" r="46" fill="#f5d97a"/>
    <path d="M8 66 Q30 44 52 62 T94 58 L94 80 L8 80 Z" fill="#e2b84a"/>
    <circle cx="30" cy="34" r="3" fill="#c79a2e"/><circle cx="52" cy="28" r="3" fill="#c79a2e"/><circle cx="72" cy="40" r="3" fill="#c79a2e"/><circle cx="40" cy="48" r="3" fill="#c79a2e"/>`,
  snow: `<circle cx="50" cy="50" r="46" fill="#9fd3f5"/>
    <g stroke="#fff" stroke-width="6" stroke-linecap="round"><path d="M50 18 V82 M22 34 L78 66 M22 66 L78 34"/></g>
    <g stroke="#fff" stroke-width="4" stroke-linecap="round"><path d="M42 24 L50 32 L58 24 M42 76 L50 68 L58 76"/></g>`,
  ice: `<circle cx="50" cy="50" r="46" fill="#aee7ff"/>
    <path d="M20 30 L80 22 L86 70 L18 78 Z" fill="#d8f5ff" stroke="#4aa3c9" stroke-width="3" stroke-linejoin="round"/>
    <path d="M40 30 L48 50 L36 62 M48 50 L66 56" fill="none" stroke="#4aa3c9" stroke-width="3" stroke-linecap="round"/>
    <path d="M28 40 L36 34" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`,
};

export function terrainIconSvg(icon: string): string {
  const art = terrainArt[icon] ?? terrainArt.grass;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g>${art}</g><circle cx="50" cy="50" r="46" fill="none" stroke="#1d1d35" stroke-width="4"/></svg>`;
}

// ---------------------------------------------------------------------------
// UI icons (single colour, uses currentColor)
// ---------------------------------------------------------------------------

const ui: Record<string, string> = {
  play: `<path d="M34 20 L82 50 L34 80 Z" fill="currentColor" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/>`,
  pause: `<rect x="26" y="20" width="16" height="60" rx="5" fill="currentColor"/><rect x="58" y="20" width="16" height="60" rx="5" fill="currentColor"/>`,
  home: `<path d="M14 50 L50 18 L86 50 M26 42 V82 H74 V42" fill="none" stroke="currentColor" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/><rect x="42" y="58" width="16" height="24" fill="currentColor"/>`,
  back: `<path d="M60 18 L28 50 L60 82" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`,
  gear: `<circle cx="50" cy="50" r="16" fill="none" stroke="currentColor" stroke-width="9"/><g stroke="currentColor" stroke-width="12" stroke-linecap="round"><path d="M50 12 V22 M50 78 V88 M12 50 H22 M78 50 H88 M23 23 L30 30 M70 70 L77 77 M23 77 L30 70 M70 30 L77 23"/></g>`,
  star: `<path d="M50 10 L61 37 L90 39 L67 58 L75 87 L50 71 L25 87 L33 58 L10 39 L39 37 Z" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>`,
  bolt: `<path d="M58 8 L22 56 H46 L40 92 L78 40 H54 Z" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>`,
  heart: `<path d="M50 84 L16 50 Q4 34 18 22 Q34 10 50 28 Q66 10 82 22 Q96 34 84 50 Z" fill="currentColor"/>`,
  swap: `<path d="M20 36 H74 M60 20 L76 36 L60 52 M80 64 H26 M40 48 L24 64 L40 80" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`,
  coin: `<circle cx="50" cy="50" r="38" fill="#ffd32a" stroke="#c98a00" stroke-width="7"/><circle cx="50" cy="50" r="24" fill="none" stroke="#e0a800" stroke-width="5"/><path d="M44 36 L52 32 V68" fill="none" stroke="#c98a00" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
  egg: `<path d="M50 10 Q78 14 82 56 Q82 90 50 90 Q18 90 18 56 Q22 14 50 10 Z" fill="currentColor"/><circle cx="38" cy="44" r="6" fill="#fff" opacity="0.6"/><circle cx="62" cy="62" r="8" fill="#fff" opacity="0.4"/>`,
  trophy: `<path d="M30 14 H70 V40 Q70 62 50 64 Q30 62 30 40 Z" fill="currentColor"/><path d="M30 22 H16 Q14 42 32 46 M70 22 H84 Q86 42 68 46" fill="none" stroke="currentColor" stroke-width="7"/><rect x="44" y="62" width="12" height="14" fill="currentColor"/><rect x="28" y="76" width="44" height="12" rx="4" fill="currentColor"/>`,
  flag: `<path d="M24 90 V12" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><path d="M28 14 H84 V54 H28 Z" fill="#fff" stroke="currentColor" stroke-width="5"/><g fill="currentColor"><rect x="28" y="14" width="14" height="13"/><rect x="56" y="14" width="14" height="13"/><rect x="42" y="27" width="14" height="14"/><rect x="70" y="27" width="14" height="14"/><rect x="28" y="41" width="14" height="13"/><rect x="56" y="41" width="14" height="13"/></g>`,
  trex: `<path d="M14 60 Q16 26 52 20 Q86 18 90 40 Q92 54 80 56 L58 58 L60 66 L44 70 Q30 78 18 72 Z" fill="currentColor"/><circle cx="62" cy="34" r="7" fill="#fff"/><circle cx="64" cy="34" r="3.5" fill="#222"/><path d="M60 56 L64 62 L68 56 L72 62 L76 56" fill="#fff"/>`,
  infinity: `<path d="M50 50 C38 30 14 30 14 50 C14 70 38 70 50 50 C62 30 86 30 86 50 C86 70 62 70 50 50 Z" fill="none" stroke="currentColor" stroke-width="10"/>`,
  team: `<circle cx="28" cy="40" r="12" fill="currentColor"/><circle cx="72" cy="40" r="12" fill="currentColor"/><circle cx="50" cy="32" r="14" fill="currentColor"/><path d="M8 84 Q10 58 28 58 Q38 58 42 66 M92 84 Q90 58 72 58 Q62 58 58 66 M26 88 Q28 52 50 52 Q72 52 74 88 Z" fill="currentColor" stroke="currentColor" stroke-width="5"/>`,
  combo: `<path d="M14 72 L34 30 L50 58 L66 20 L86 72" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><circle cx="66" cy="20" r="8" fill="currentColor"/>`,
  tree: `<path d="M50 8 L80 56 H20 Z" fill="currentColor"/><path d="M50 26 L86 74 H14 Z" fill="currentColor"/><rect x="42" y="72" width="16" height="20" fill="currentColor"/>`,
  globe: `<circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" stroke-width="8"/><path d="M12 50 H88 M50 12 Q26 50 50 88 Q74 50 50 12" fill="none" stroke="currentColor" stroke-width="6"/>`,
  dinos: `<circle cx="26" cy="54" r="14" fill="#4cd137"/><circle cx="50" cy="40" r="14" fill="#2e86ff"/><circle cx="74" cy="54" r="14" fill="#ff8c1a"/><circle cx="50" cy="70" r="14" fill="#a55eea"/>`,
  stones: `<path d="M12 78 L20 46 L42 36 L56 56 L50 80 Z M46 80 L54 36 L74 26 L90 52 L86 80 Z" fill="currentColor"/>`,
  lock: `<rect x="22" y="44" width="56" height="44" rx="8" fill="currentColor"/><path d="M34 44 V32 Q34 14 50 14 Q66 14 66 32 V44" fill="none" stroke="currentColor" stroke-width="9"/>`,
  check: `<path d="M16 52 L40 76 L86 24" fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`,
  close: `<path d="M22 22 L78 78 M78 22 L22 78" stroke="currentColor" stroke-width="13" stroke-linecap="round"/>`,
  music: `<path d="M36 74 V22 L80 12 V64" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/><circle cx="26" cy="74" r="12" fill="currentColor"/><circle cx="70" cy="64" r="12" fill="currentColor"/>`,
  sound: `<path d="M14 38 H32 L54 18 V82 L32 62 H14 Z" fill="currentColor"/><path d="M66 32 Q78 50 66 68 M76 20 Q96 50 76 80" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>`,
  park: `<path d="M30 10 L50 44 H10 Z" fill="currentColor"/><rect x="25" y="44" width="10" height="16" fill="currentColor"/><circle cx="72" cy="36" r="16" fill="currentColor"/><rect x="68" y="50" width="8" height="12" fill="currentColor"/><path d="M8 70 H92 M8 86 H92 M16 62 V92 M38 62 V92 M62 62 V92 M84 62 V92" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>`,
  book: `<path d="M50 24 Q34 12 12 16 V80 Q34 76 50 88 Q66 76 88 80 V16 Q66 12 50 24 Z" fill="currentColor"/><path d="M50 26 V86" stroke="#fff" stroke-width="4" opacity="0.6"/>`,
  list: `<g fill="currentColor"><circle cx="18" cy="24" r="8"/><circle cx="18" cy="50" r="8"/><circle cx="18" cy="76" r="8"/><rect x="34" y="18" width="54" height="12" rx="6"/><rect x="34" y="44" width="54" height="12" rx="6"/><rect x="34" y="70" width="54" height="12" rx="6"/></g>`,
  plus: `<path d="M50 16 V84 M16 50 H84" stroke="currentColor" stroke-width="14" stroke-linecap="round"/>`,
  move: `<path d="M50 10 V90 M10 50 H90 M38 22 L50 10 L62 22 M38 78 L50 90 L62 78 M22 38 L10 50 L22 62 M78 38 L90 50 L78 62" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,
  trash: `<path d="M20 26 H80 M40 26 V16 H60 V26 M26 26 L32 88 H68 L74 26" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>`,
  shop: `<path d="M14 36 L22 14 H78 L86 36 Z" fill="currentColor"/><rect x="18" y="40" width="64" height="46" rx="4" fill="currentColor" opacity="0.8"/><rect x="40" y="56" width="20" height="30" fill="#fff" opacity="0.7"/>`,
  rotate: `<rect x="14" y="30" width="72" height="44" rx="8" fill="none" stroke="currentColor" stroke-width="7"/><path d="M50 8 A40 40 0 0 1 88 20 M88 20 L78 8 M88 20 L74 24" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>`,
  hand: `<path d="M40 88 Q24 70 22 56 Q22 48 30 50 L38 58 V18 Q38 10 46 10 Q54 10 54 18 V44 L56 36 Q62 32 66 38 V46 Q72 40 76 46 V52 Q82 48 84 56 Q86 74 72 88 Z" fill="#fff" stroke="#1d1d35" stroke-width="5" stroke-linejoin="round"/>`,
  warning: `<path d="M50 10 L92 86 H8 Z" fill="#ffd32a" stroke="#1d1d35" stroke-width="6" stroke-linejoin="round"/><path d="M50 36 V60" stroke="#1d1d35" stroke-width="10" stroke-linecap="round"/><circle cx="50" cy="74" r="6" fill="#1d1d35"/>`,
};

export function uiIconSvg(name: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${ui[name] ?? ui.star}</svg>`;
}

export function svgToDataUrl(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// ---------------------------------------------------------------------------
// Image cache (for canvas textures)
// ---------------------------------------------------------------------------

const imageCache = new Map<string, HTMLImageElement>();

export function loadSvgImage(key: string, svg: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(key);
  if (cached && cached.complete) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const img = cached ?? new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    if (!cached) {
      img.src = svgToDataUrl(svg);
      imageCache.set(key, img);
    }
  });
}

export function getCachedImage(key: string): HTMLImageElement | undefined {
  return imageCache.get(key);
}
