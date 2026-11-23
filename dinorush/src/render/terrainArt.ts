import * as THREE from 'three';

/**
 * Natural, seamless terrain textures painted procedurally (no image files)
 * and packed into one texture array so the trail shader can blend any two
 * terrains smoothly.
 */

export const TRAIL_LAYERS = ['grass', 'path', 'water', 'deepWater', 'stones', 'woodBarrier', 'scree', 'mud', 'sand', 'snow', 'ice', 'lava'] as const;
export type TrailLayer = (typeof TRAIL_LAYERS)[number];

const S = 512;

/** Tileable value noise built from a random lattice. */
function lattice(seed: number, n: number) {
  const g = new Float32Array(n * n);
  let s = seed * 9301 + 49297;
  for (let i = 0; i < g.length; i++) {
    s = (s * 16807) % 2147483647;
    g[i] = s / 2147483647;
  }
  return (x: number, y: number) => {
    const fx = (x / S) * n;
    const fy = (y / S) * n;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const at = (a: number, b: number) => g[(((b % n) + n) % n) * n + (((a % n) + n) % n)];
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

function fbm(seed: number) {
  const o = [lattice(seed, 4), lattice(seed + 1, 8), lattice(seed + 2, 16), lattice(seed + 3, 32), lattice(seed + 4, 64)];
  const w = [0.35, 0.27, 0.18, 0.12, 0.08];
  return (x: number, y: number) => {
    let v = 0;
    for (let i = 0; i < o.length; i++) v += o[i](x, y) * w[i];
    return v;
  };
}

/** Tileable cell (Voronoi) distance: returns [nearest, second] distances in px. */
function cells(seed: number, n: number) {
  const pts: [number, number][] = [];
  let s = seed * 7919 + 17;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const cell = S / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pts.push([(i + rnd()) * cell, (j + rnd()) * cell]);
  return (x: number, y: number): [number, number] => {
    const ci = Math.floor(x / cell);
    const cj = Math.floor(y / cell);
    let d1 = 1e9;
    let d2 = 1e9;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ii = (((ci + di) % n) + n) % n;
        const jj = (((cj + dj) % n) + n) % n;
        const p = pts[jj * n + ii];
        const px = p[0] + (ci + di - ii) * cell;
        const py = p[1] + (cj + dj - jj) * cell;
        const d = Math.hypot(x - px, y - py);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
    }
    return [d1, d2];
  };
}

type RGB = [number, number, number];
const hex = (h: number): RGB => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

function field(fn: (x: number, y: number) => RGB, ctx: CanvasRenderingContext2D) {
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const c = fn(x, y);
      const i = (y * S + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Draw a feature so that it wraps around the tile edges. */
function wrapped(_ctx: CanvasRenderingContext2D, x: number, y: number, r: number, draw: (x: number, y: number) => void) {
  for (const dx of [-S, 0, S]) {
    for (const dy of [-S, 0, S]) {
      const px = x + dx;
      const py = y + dy;
      if (px + r < 0 || px - r > S || py + r < 0 || py - r > S) continue;
      draw(px, py);
    }
  }
}

function pebbles(ctx: CanvasRenderingContext2D, seed: number, count: number, rMin: number, rMax: number, colors: number[]) {
  const r = seeded(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = rMin + r() * (rMax - rMin);
    const c = colors[Math.floor(r() * colors.length)];
    const rot = r() * 3;
    const sq = 0.6 + r() * 0.4;
    wrapped(ctx, x, y, rad * 2, (px, py) => {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(px + rad * 0.25, py + rad * 0.3, rad, rad * sq, rot, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#' + c.toString(16).padStart(6, '0');
      ctx.beginPath();
      ctx.ellipse(px, py, rad, rad * sq, rot, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.ellipse(px - rad * 0.3, py - rad * 0.3, rad * 0.45, rad * 0.3 * sq, rot, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

function paintLayer(layer: TrailLayer, ctx: CanvasRenderingContext2D) {
  const n = fbm(TRAIL_LAYERS.indexOf(layer) * 13 + 5);
  const n2 = fbm(TRAIL_LAYERS.indexOf(layer) * 29 + 11);
  const rnd = seeded(TRAIL_LAYERS.indexOf(layer) * 101 + 7);
  switch (layer) {
    case 'grass': {
      const a = hex(0x3f8f2f);
      const b = hex(0x82d04e);
      const c = hex(0xa6d65a);
      field((x, y) => {
        const v = n(x, y);
        let col = mixc(a, b, clamp((v - 0.3) * 2.2));
        col = mixc(col, c, clamp((n2(x, y) - 0.62) * 3) * 0.6);
        return col;
      }, ctx);
      ctx.lineCap = 'round';
      for (let i = 0; i < 2600; i++) {
        const x = rnd() * S;
        const y = rnd() * S;
        const len = 4 + rnd() * 9;
        const ang = -Math.PI / 2 + (rnd() - 0.5) * 1.2;
        const dark = rnd() > 0.5;
        ctx.strokeStyle = dark ? 'rgba(40,110,30,0.55)' : 'rgba(170,230,110,0.5)';
        ctx.lineWidth = 1.2 + rnd();
        wrapped(ctx, x, y, len, (px, py) => {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
          ctx.stroke();
        });
      }
      for (let i = 0; i < 26; i++) {
        const x = rnd() * S;
        const y = rnd() * S;
        const col = ['#ffffff', '#ffe066', '#ff9ff3', '#ffd1dc'][Math.floor(rnd() * 4)];
        wrapped(ctx, x, y, 6, (px, py) => {
          ctx.fillStyle = col;
          for (let k = 0; k < 5; k++) {
            ctx.beginPath();
            ctx.arc(px + Math.cos(k * 1.26) * 2.6, py + Math.sin(k * 1.26) * 2.6, 2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#ffd32a';
          ctx.beginPath();
          ctx.arc(px, py, 1.6, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      break;
    }
    case 'path':
    case 'woodBarrier': {
      const a = hex(0x9b7146);
      const b = hex(0xc49a63);
      const dk = hex(0x6e4f30);
      field((x, y) => {
        const v = n(x, y);
        let col = mixc(a, b, clamp((v - 0.3) * 2));
        col = mixc(col, dk, clamp((0.38 - n2(x, y)) * 3) * 0.6);
        return col;
      }, ctx);
      pebbles(ctx, 40 + TRAIL_LAYERS.indexOf(layer), layer === 'path' ? 260 : 120, 1.5, 5, [0x8a7a6a, 0xa59382, 0x7a6450, 0xb8a58c]);
      if (layer === 'woodBarrier') {
        for (let i = 0; i < 220; i++) {
          const x = rnd() * S;
          const y = rnd() * S;
          const w = 6 + rnd() * 12;
          const rot = rnd() * Math.PI;
          wrapped(ctx, x, y, w, (px, py) => {
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(rot);
            ctx.fillStyle = rnd() > 0.5 ? '#d9b07a' : '#b8854c';
            ctx.fillRect(-w / 2, -1.5, w, 3);
            ctx.restore();
          });
        }
      }
      break;
    }
    case 'water':
    case 'deepWater': {
      const deep = layer === 'deepWater';
      const a = hex(deep ? 0x0f4f99 : 0x1d8fd0);
      const b = hex(deep ? 0x1d6fc2 : 0x3cc3ef);
      const cl = cells(deep ? 5 : 3, 10);
      field((x, y) => {
        const v = n(x, y);
        let col = mixc(a, b, clamp((v - 0.25) * 1.8));
        const [d1, d2] = cl(x, y);
        const edge = clamp(1 - (d2 - d1) / 7);
        col = mixc(col, [220, 250, 255], edge * (deep ? 0.18 : 0.32));
        return col;
      }, ctx);
      ctx.strokeStyle = deep ? 'rgba(200,230,255,0.25)' : 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (let i = 0; i < (deep ? 40 : 70); i++) {
        const x = rnd() * S;
        const y = rnd() * S;
        const w = 10 + rnd() * 22;
        wrapped(ctx, x, y, w, (px, py) => {
          ctx.beginPath();
          ctx.moveTo(px - w / 2, py);
          ctx.quadraticCurveTo(px, py - 4, px + w / 2, py);
          ctx.stroke();
        });
      }
      break;
    }
    case 'stones':
    case 'scree': {
      const scree = layer === 'scree';
      const a = hex(scree ? 0x6e655f : 0x9c8f80);
      const b = hex(scree ? 0x8f857c : 0xbcae9c);
      field((x, y) => mixc(a, b, clamp((n(x, y) - 0.3) * 2)), ctx);
      pebbles(ctx, 77 + (scree ? 3 : 0), 900, 2, 6, scree ? [0x5c534d, 0x77695f, 0x8c8076, 0x4a433e] : [0x8c8076, 0xa59a8f, 0x77695f, 0xc2b6a6]);
      pebbles(ctx, 91 + (scree ? 3 : 0), scree ? 90 : 45, 8, scree ? 18 : 13, scree ? [0x6e655f, 0x5c534d, 0x857a72] : [0x9a8f84, 0xa89c90, 0x857a70]);
      break;
    }
    case 'mud': {
      const a = hex(0x4a2f17);
      const b = hex(0x6e4826);
      field((x, y) => {
        let col = mixc(a, b, clamp((n(x, y) - 0.3) * 2));
        const wet = clamp((n2(x, y) - 0.58) * 5);
        col = mixc(col, [40, 26, 14], wet * 0.8);
        return col;
      }, ctx);
      for (let i = 0; i < 70; i++) {
        const x = rnd() * S;
        const y = rnd() * S;
        const rr = 3 + rnd() * 8;
        wrapped(ctx, x, y, rr + 2, (px, py) => {
          ctx.strokeStyle = 'rgba(190,150,110,0.55)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px, py, rr, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,240,220,0.35)';
          ctx.beginPath();
          ctx.arc(px - rr * 0.35, py - rr * 0.35, rr * 0.25, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      break;
    }
    case 'sand': {
      const a = hex(0xd9b766);
      const b = hex(0xf3dc95);
      field((x, y) => {
        const warp = n2(x, y) * 40;
        const ripple = 0.5 + 0.5 * Math.sin(((y + warp) / S) * Math.PI * 2 * 14);
        let col = mixc(a, b, clamp((n(x, y) - 0.3) * 1.8));
        col = mixc(col, hex(0xc9a24f), (1 - ripple) * 0.35);
        return col;
      }, ctx);
      for (let i = 0; i < 1400; i++) {
        ctx.fillStyle = rnd() > 0.5 ? 'rgba(150,110,40,0.4)' : 'rgba(255,250,230,0.5)';
        ctx.fillRect(rnd() * S, rnd() * S, 1.5, 1.5);
      }
      break;
    }
    case 'snow': {
      const a = hex(0xdbe9f6);
      const b = hex(0xffffff);
      field((x, y) => {
        let col = mixc(a, b, clamp((n(x, y) - 0.25) * 1.8));
        col = mixc(col, hex(0xb9d3ec), clamp((0.35 - n2(x, y)) * 3) * 0.5);
        return col;
      }, ctx);
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        const x = rnd() * S;
        const y = rnd() * S;
        ctx.fillRect(x, y, 1.6, 1.6);
      }
      break;
    }
    case 'ice': {
      const a = hex(0x8fd3f0);
      const b = hex(0xd2f3ff);
      const cl = cells(21, 6);
      field((x, y) => {
        let col = mixc(a, b, clamp((n(x, y) - 0.25) * 1.6));
        const [d1, d2] = cl(x, y);
        const crack = clamp(1 - (d2 - d1) / 2.5);
        col = mixc(col, hex(0x5fb4dc), crack * 0.8);
        return col;
      }, ctx);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineCap = 'round';
      for (let i = 0; i < 30; i++) {
        const x = rnd() * S;
        const y = rnd() * S;
        const w = 20 + rnd() * 40;
        ctx.lineWidth = 2 + rnd() * 3;
        wrapped(ctx, x, y, w, (px, py) => {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + w, py - w * 0.4);
          ctx.stroke();
        });
      }
      break;
    }
    case 'lava': {
      const cl = cells(33, 9);
      field((x, y) => {
        const [d1, d2] = cl(x, y);
        const glow = clamp(1 - (d2 - d1) / 9);
        const crust = mixc(hex(0x3a1a10), hex(0x5a2a16), n(x, y));
        return mixc(crust, mixc(hex(0xff5a00), hex(0xffd24a), glow * glow), clamp(glow * 1.4));
      }, ctx);
      break;
    }
  }
}

let arrayTex: THREE.DataArrayTexture | null = null;
const flatCache = new Map<TrailLayer, THREE.Texture>();

/** All trail layers packed into one sRGB texture array (built once). */
export function trailTextureArray(): THREE.DataArrayTexture {
  if (arrayTex) return arrayTex;
  const data = new Uint8Array(S * S * 4 * TRAIL_LAYERS.length);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  TRAIL_LAYERS.forEach((layer, i) => {
    ctx.clearRect(0, 0, S, S);
    paintLayer(layer, ctx);
    data.set(ctx.getImageData(0, 0, S, S).data, i * S * S * 4);
  });
  const t = new THREE.DataArrayTexture(data, S, S, TRAIL_LAYERS.length);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  t.userData.shared = true;
  arrayTex = t;
  return t;
}

/** Single painted layer as an ordinary texture (e.g. for menus). */
export function trailLayerTexture(layer: TrailLayer): THREE.Texture {
  let t = flatCache.get(layer);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    paintLayer(layer, c.getContext('2d')!);
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.userData.shared = true;
    flatCache.set(layer, t);
  }
  return t;
}
