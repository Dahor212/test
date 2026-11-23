import * as THREE from 'three';
import { getCachedImage, loadSvgImage, terrainIconSvg, dinoIconSvg, paletteToIconColors } from '../assets/icons';
import { ARCHETYPE_INFO, DINO_BY_ID, STARTER_LINEUP } from '../config/dinosaurs';
import { TERRAINS } from '../config/terrain';
import type { Archetype, TerrainId } from '../types';

/** Procedural canvas textures for terrains and signs (no image files). */

const texCache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function css(n: number, alpha = 1) {
  const c = new THREE.Color(n);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${alpha})`;
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function paint(id: TerrainId, ctx: CanvasRenderingContext2D, S: number) {
  const t = TERRAINS[id];
  const r = seeded(id.length * 977 + 13);
  ctx.fillStyle = css(t.color);
  ctx.fillRect(0, 0, S, S);
  switch (id) {
    case 'grass': {
      ctx.fillStyle = css(t.color2);
      for (let i = 0; i < 4; i++) ctx.fillRect(0, i * (S / 4), S, S / 8);
      for (let i = 0; i < 260; i++) {
        const x = r() * S;
        const y = r() * S;
        ctx.strokeStyle = r() > 0.5 ? css(0x3d9a22) : css(0x8be05a);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (r() - 0.5) * 6, y - 8 - r() * 6);
        ctx.stroke();
      }
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = r() > 0.5 ? '#fff6a0' : '#ffffff';
        ctx.beginPath();
        ctx.arc(r() * S, r() * S, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'path':
    case 'bridge': {
      if (id === 'bridge') {
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 ? css(t.color) : css(t.color2);
          ctx.fillRect(0, i * (S / 8), S, S / 8 - 3);
          ctx.fillStyle = css(0x4a2a10);
          ctx.fillRect(0, i * (S / 8) + S / 8 - 3, S, 3);
          ctx.fillStyle = css(0x3a200c);
          ctx.beginPath();
          ctx.arc(S * 0.1, i * (S / 8) + S / 16, 3, 0, 7);
          ctx.arc(S * 0.9, i * (S / 8) + S / 16, 3, 0, 7);
          ctx.fill();
        }
      } else {
        for (let i = 0; i < 160; i++) {
          ctx.fillStyle = r() > 0.5 ? css(t.color2) : css(0xe8b878);
          ctx.beginPath();
          ctx.ellipse(r() * S, r() * S, 2 + r() * 5, 1.5 + r() * 3, r() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = css(0xb87a40, 0.5);
        ctx.lineWidth = 4;
        ctx.setLineDash([18, 18]);
        ctx.beginPath();
        ctx.moveTo(S / 2, 0);
        ctx.lineTo(S / 2, S);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      break;
    }
    case 'water':
    case 'deepWater': {
      const g = ctx.createLinearGradient(0, 0, S, 0);
      g.addColorStop(0, css(t.color));
      g.addColorStop(0.5, css(t.color2));
      g.addColorStop(1, css(t.color));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (let i = 0; i < 12; i++) {
        const x = r() * S;
        const y = r() * S;
        ctx.beginPath();
        ctx.moveTo(x - 14, y);
        ctx.quadraticCurveTo(x - 7, y - 6, x, y);
        ctx.quadraticCurveTo(x + 7, y + 6, x + 14, y);
        ctx.stroke();
      }
      break;
    }
    case 'stones':
    case 'scree': {
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = r() > 0.5 ? css(t.color2) : css(0x7d7268);
        ctx.beginPath();
        const x = r() * S;
        const y = r() * S;
        const rr = 3 + r() * (id === 'scree' ? 9 : 6);
        ctx.moveTo(x + rr, y);
        for (let k = 1; k < 6; k++) ctx.lineTo(x + Math.cos(k * 1.2) * rr, y + Math.sin(k * 1.2) * rr);
        ctx.fill();
      }
      break;
    }
    case 'woodBarrier': {
      for (let i = 0; i < 120; i++) {
        ctx.fillStyle = r() > 0.5 ? css(0x8a6a3c, 0.6) : css(0xd8b47c, 0.6);
        ctx.fillRect(r() * S, r() * S, 10 + r() * 16, 3);
      }
      break;
    }
    case 'mud': {
      ctx.fillStyle = css(t.color2);
      for (let i = 0; i < 26; i++) {
        ctx.beginPath();
        ctx.ellipse(r() * S, r() * S, 10 + r() * 20, 6 + r() * 10, r() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = css(0xa87a4c, 0.9);
      ctx.lineWidth = 3;
      for (let i = 0; i < 14; i++) {
        ctx.beginPath();
        ctx.arc(r() * S, r() * S, 3 + r() * 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'sand': {
      ctx.strokeStyle = css(t.color2);
      ctx.lineWidth = 5;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        const y = (i + 0.5) * (S / 6);
        ctx.moveTo(0, y);
        ctx.quadraticCurveTo(S * 0.25, y - 10, S * 0.5, y);
        ctx.quadraticCurveTo(S * 0.75, y + 10, S, y);
        ctx.stroke();
      }
      for (let i = 0; i < 200; i++) {
        ctx.fillStyle = css(0xc79a2e, 0.6);
        ctx.fillRect(r() * S, r() * S, 2, 2);
      }
      break;
    }
    case 'snow': {
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = css(t.color2, 0.8);
        ctx.beginPath();
        ctx.ellipse(r() * S, r() * S, 8 + r() * 18, 4 + r() * 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(r() * S, r() * S, 3, 3);
      }
      break;
    }
    case 'ice': {
      ctx.strokeStyle = css(0x6ec6e8);
      ctx.lineWidth = 2;
      for (let i = 0; i < 10; i++) {
        let x = r() * S;
        let y = r() * S;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (r() - 0.5) * 50;
          y += (r() - 0.5) * 50;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 6;
      for (let i = 0; i < 5; i++) {
        const x = r() * S;
        const y = r() * S;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 22, y - 12);
        ctx.stroke();
      }
      break;
    }
  }
}

export function terrainTexture(id: TerrainId): THREE.Texture {
  const key = 'terrain:' + id;
  let tex = texCache.get(key);
  if (!tex) {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    paint(id, ctx, S);
    tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.userData.shared = true;
    texCache.set(key, tex);
  }
  return tex;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Preload all SVG images used by 3D signs. */
export async function preloadSignImages(): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  for (const t of Object.values(TERRAINS)) jobs.push(loadSvgImage('t:' + t.icon, terrainIconSvg(t.icon)));
  for (const a of Object.keys(ARCHETYPE_INFO) as Archetype[]) {
    const def = DINO_BY_ID[STARTER_LINEUP[a]];
    jobs.push(loadSvgImage('d:' + a, dinoIconSvg(a, paletteToIconColors(def.palette))));
  }
  await Promise.all(jobs);
}

/**
 * Sign texture shown above the lane at a change point: terrain icon, a ring
 * in the colour of the needed dino and (optionally) the dino itself.
 */
export function signTexture(terrain: TerrainId, showDino: boolean): THREE.Texture {
  const key = `sign:${terrain}:${showDino}`;
  let tex = texCache.get(key);
  if (tex) return tex;
  const W = 256;
  const H = showDino ? 384 : 256;
  const [c, ctx] = canvas(W, H);
  const def = TERRAINS[terrain];
  const color = ARCHETYPE_INFO[def.best].color;
  // pole shadow / ring
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(W / 2, W / 2, W / 2 - 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(W / 2, W / 2, W / 2 - 22, 0, Math.PI * 2);
  ctx.fill();
  const icon = getCachedImage('t:' + def.icon);
  if (icon && icon.complete) ctx.drawImage(icon, 30, 30, W - 60, W - 60);
  if (showDino) {
    ctx.fillStyle = color;
    roundRect(ctx, 28, W - 6, W - 56, H - W, 30);
    ctx.fill();
    ctx.strokeStyle = '#1d1d35';
    ctx.lineWidth = 6;
    ctx.stroke();
    const dimg = getCachedImage('d:' + def.best);
    if (dimg && dimg.complete) ctx.drawImage(dimg, W / 2 - 62, W - 4, 124, 124);
  }
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.shared = true;
  texCache.set(key, tex);
  return tex;
}

export function nameTagTexture(name: string, color: string): THREE.Texture {
  const [c, ctx] = canvas(256, 72);
  ctx.fillStyle = color;
  roundRect(ctx, 4, 4, 248, 64, 30);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 38px "Trebuchet MS", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 4;
  ctx.fillText(name.slice(0, 12), 128, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function bannerTexture(text: string, bg: string, fg = '#ffffff'): THREE.Texture {
  const [c, ctx] = canvas(512, 128);
  ctx.fillStyle = bg;
  roundRect(ctx, 4, 4, 504, 120, 24);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = 'bold 84px "Trebuchet MS", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function checkerTexture(): THREE.Texture {
  const key = 'checker';
  let tex = texCache.get(key);
  if (tex) return tex;
  const [c, ctx] = canvas(64, 64);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#1d1d35' : '#ffffff';
    ctx.fillRect(x * 16, y * 16, 16, 16);
  }
  tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.shared = true;
  texCache.set(key, tex);
  return tex;
}

/** Soft round sprite for particles. */
export function particleTexture(): THREE.Texture {
  const key = 'particle';
  let tex = texCache.get(key);
  if (tex) return tex;
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  tex = new THREE.CanvasTexture(c);
  tex.userData.shared = true;
  texCache.set(key, tex);
  return tex;
}
