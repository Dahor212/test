import type { DinoRig, LegRig } from './dinoKit';

/**
 * Foot-planting gait. Every leg alternates between a stance (the foot
 * stands on the ground and moves backwards exactly as fast as the ground
 * passes under the dinosaur, so it never slides) and a swing (the foot
 * is lifted and brought forward). Joint angles come from inverse
 * kinematics, so the feet really reach the ground whatever the body does.
 *
 * Angles follow the rigs' convention: rotation.x = angle from straight
 * down towards the front; positions are (forward, up) in the leg plane.
 */

interface LegGeo {
  /** Segment lengths: thigh, shin(, metatarsus). */
  L: number[];
  /** Pivot of the leg in hips space: forward / up. */
  pf: number;
  py: number;
  /** Rest foot position relative to the pivot (forward / up). */
  restF: number;
  restY: number;
  /** Absolute rest angle of the metatarsus (three-segment legs). */
  restA3: number;
  /** The middle joint points forwards (theropod knee) or backwards. */
  bendForward: boolean;
}

interface RigGait {
  legs: LegGeo[];
  /** Typical leg drop (pivot height above the ground). */
  reach: number;
  restHipsY: number;
}

const cache = new WeakMap<DinoRig, RigGait>();
const legCache = new WeakMap<LegRig, LegGeo>();

function legGeo(leg: LegRig): LegGeo {
  let g = legCache.get(leg);
  if (g) return g;
  const L = [-leg.knee.position.y, leg.ankle ? -leg.ankle.position.y : -leg.foot.position.y];
  if (leg.ankle) L.push(-leg.foot.position.y);
  const rest = leg.rest.slice(0, L.length);
  let a = 0;
  let f = 0;
  let y = 0;
  rest.forEach((r, i) => {
    a += r;
    f += L[i] * Math.sin(a);
    y -= L[i] * Math.cos(a);
  });
  g = {
    L,
    pf: -leg.hip.position.z,
    py: leg.hip.position.y,
    restF: f,
    restY: y,
    restA3: a,
    bendForward: rest[1] < 0 || (rest[1] === 0 && !leg.front),
  };
  legCache.set(leg, g);
  return g;
}

function gaitOf(rig: DinoRig): RigGait {
  let g = cache.get(rig);
  if (g) return g;
  const legs = rig.legs.map(legGeo);
  const reach = legs.length ? legs.reduce((s, l) => s + -l.restY, 0) / legs.length : 1;
  g = { legs, reach: Math.max(0.2, reach), restHipsY: rig.hipHeight };
  cache.set(rig, g);
  return g;
}

export interface GaitState {
  /** Stance share of a cycle (rest is the swing). */
  beta: number;
  /** Steps per second (full cycles). */
  freq: number;
  /** Distance the ground moves during one stance (rig units). */
  stance: number;
  /** 0 standing … 1 full run. */
  run: number;
  /** Rig-space ground speed. */
  v: number;
}

/**
 * Cadence for a speed (world m/s): long legs take long strides, short legs
 * patter quickly. A flight phase appears when running fast.
 */
export function gaitFor(rig: DinoRig, speed: number, heavy: boolean): GaitState {
  const g = gaitOf(rig);
  const scale = rig.root.scale.y || 1;
  const v = Math.max(0, speed) / scale;
  const vn = v / g.reach;
  const quad = rig.quadruped;
  let beta = quad ? clamp(0.68 - 0.024 * vn, 0.34, 0.68) : clamp(0.62 - 0.03 * vn, 0.3, 0.62);
  if (heavy) beta = Math.min(0.7, beta + 0.12);
  const sweep = (quad ? 1.0 : 1.15) * g.reach * (heavy ? 0.75 : 1);
  const fMax = quad ? 4.4 : 3.3;
  let freq = v > 0.05 ? (v * beta) / sweep : 0.7;
  if (freq > fMax) {
    freq = fMax;
    // keep the stance within reach by shortening the ground contact
    beta = Math.max(0.22, Math.min(beta, (fMax * 1.45 * g.reach) / Math.max(v, 1e-3)));
  }
  freq = Math.max(0.7, freq);
  return { beta, freq, stance: (v * beta) / freq, run: Math.min(1, vn / 6), v };
}

/** Body bob for a gait: lowest when a foot is in mid-stance, highest in flight. */
export function gaitBob(rig: DinoRig, gs: GaitState, phase: number): number {
  const g = gaitOf(rig);
  const u0 = frac(phase / (Math.PI * 2) + (rig.legs[0]?.phase ?? 0) / (Math.PI * 2));
  const wave = 0.5 - 0.5 * Math.cos(Math.PI * 4 * (u0 - gs.beta / 2));
  return wave * g.reach * (rig.quadruped ? 0.03 : 0.075) * gs.run;
}

/**
 * Places the legs for the current body pose (hips already positioned and
 * pitched). `lift` scales how high the feet rise (lower in water/mud).
 */
export function solveLegs(rig: DinoRig, gs: GaitState, phase: number, lift = 1) {
  const g = gaitOf(rig);
  const pitch = rig.hips.rotation.x;
  const hy = rig.hips.position.y;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  rig.legs.forEach((leg, i) => {
    const lg = g.legs[i];
    const u = frac(phase / (Math.PI * 2) + leg.phase / (Math.PI * 2));
    let footF: number;
    let footY = 0;
    let swing = 0;
    let stanceT = 0;
    if (u < gs.beta) {
      stanceT = u / gs.beta;
      footF = gs.stance * (0.5 - stanceT);
    } else {
      const w = (u - gs.beta) / (1 - gs.beta);
      const e = w * w * (3 - 2 * w);
      footF = gs.stance * (-0.5 + e);
      swing = Math.sin(Math.PI * w);
      footY = swing * g.reach * (rig.quadruped ? 0.1 + 0.12 * gs.run : 0.1 + 0.2 * gs.run) * lift;
    }
    // target in rig space: under the leg's rest position, on the ground (y = 0)
    const tf = lg.pf + lg.restF + footF;
    const ty = footY;
    // animated pivot (hips move and pitch)
    const pf = lg.pf * cp - lg.py * sp;
    const py = hy + lg.py * cp + lg.pf * sp;
    // into the hips' frame
    const vf = tf - pf;
    const vy = ty - py;
    let lf = vf * cp + vy * sp;
    let ly = vy * cp - vf * sp;
    let a3abs = 0;
    if (lg.L.length === 3) {
      // metatarsus: heel lifts at the end of the stance, folds back in the swing
      a3abs = lg.restA3 - 0.3 * stanceT * stanceT * gs.run - 0.55 * swing * (0.4 + 0.6 * gs.run);
      lf -= lg.L[2] * Math.sin(a3abs);
      ly += lg.L[2] * Math.cos(a3abs);
    }
    const [A1, A2] = ik2(lf, ly, lg.L[0], lg.L[1], lg.bendForward);
    leg.hip.rotation.x = A1;
    leg.knee.rotation.x = A2 - A1;
    let last = A2;
    if (leg.ankle) {
      leg.ankle.rotation.x = a3abs - A2;
      last = a3abs;
    }
    // foot flat on the ground in the stance, toes hanging in the swing
    leg.foot.rotation.x = -(pitch + last) - swing * 0.5;
  });
}

/** Two-bone inverse kinematics in the leg plane: returns absolute angles. */
function ik2(tf: number, ty: number, L0: number, L1: number, bendForward: boolean): [number, number] {
  let d = Math.hypot(tf, ty);
  const maxD = (L0 + L1) * 0.999;
  const minD = Math.abs(L0 - L1) + 1e-3;
  if (d > maxD) {
    tf *= maxD / d;
    ty *= maxD / d;
    d = maxD;
  } else if (d < minD) {
    const k = minD / Math.max(d, 1e-6);
    tf *= k;
    ty *= k;
    d = minD;
  }
  const phi = Math.atan2(tf, -ty);
  const alpha = Math.acos(clamp((L0 * L0 + d * d - L1 * L1) / (2 * L0 * d), -1, 1));
  const A1 = bendForward ? phi + alpha : phi - alpha;
  const kf = L0 * Math.sin(A1);
  const ky = -L0 * Math.cos(A1);
  const A2 = Math.atan2(tf - kf, -(ty - ky));
  return [A1, A2];
}

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

function frac(x: number) {
  return x - Math.floor(x);
}
