import * as THREE from 'three';
import type { Archetype, DinoPalette } from '../types';
import {
  creatureMaterial,
  hornGeometry,
  limbGeometry,
  loftBody,
  mix,
  noise3,
  Parts,
  PG,
  shade,
  skinByRings,
  smooth,
  type BodyKey,
  type ColorFn,
  type Loft,
} from './creature';

/**
 * Dinosaur workshop shared by all species: rig types, the skinned spine,
 * skin colouring, eyes, teeth and the jointed limbs. Species builders live
 * in dinoModels.ts (classic four + T-Rex + Ptero) and species.ts (newer).
 */
export type DinoAnimMode = 'run' | 'swim' | 'wade' | 'mud' | 'slip' | 'climb' | 'smash' | 'idle' | 'celebrate';

export interface LegRig {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group | null;
  foot: THREE.Group;
  phase: number;
  front: boolean;
  rest: [number, number, number];
}

export interface ArmRig {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  rest: [number, number];
}

export interface DinoRig {
  archetype: Archetype | 'trex' | 'ptero';
  root: THREE.Group;
  hips: THREE.Group;
  body: THREE.SkinnedMesh | null;
  head: THREE.Object3D;
  neck: THREE.Object3D;
  neckBones: THREE.Bone[];
  chest: THREE.Bone | null;
  jaw: THREE.Group | null;
  tail: THREE.Bone[];
  legs: LegRig[];
  arms: ArmRig[];
  wings: THREE.Group[];
  headTop: THREE.Group;
  face: THREE.Group;
  hipHeight: number;
  height: number;
  length: number;
  stride: number;
  quadruped: boolean;
  phase: number;
  animatedMaterials: THREE.MeshStandardMaterial[];
  effect: NonNullable<DinoPalette['effect']>;
  accessory: THREE.Object3D | null;
}

export const CLAW = 0x3b3430;
export const IVORY = 0xf3ead2;
export const BEAK = 0x3c3a3f;

// ---------------------------------------------------------------------------
// Skeleton + skin
// ---------------------------------------------------------------------------

export interface SpineSpec {
  keys: BodyKey[];
  head: number;
  neck: number[];
  chest: number;
  pelvis: number;
  tail: number[];
  squareness?: number;
  bellyFlat?: number;
  rings?: number;
  color: ColorFn;
}

export interface Spine {
  loft: Loft;
  mesh: THREE.SkinnedMesh;
  head: THREE.Bone;
  neck: THREE.Bone[];
  chest: THREE.Bone;
  pelvis: THREE.Bone;
  tail: THREE.Bone[];
  rest: Map<THREE.Bone, THREE.Vector3>;
  parts: Map<THREE.Bone, Parts>;
  /** Point given in body space → local space of a bone (rest pose has no rotations). */
  local(bone: THREE.Bone, p: THREE.Vector3 | [number, number, number]): [number, number, number];
}

export function buildSpine(spec: SpineSpec, skinMat: THREE.Material): Spine {
  const radial = 16;
  const loft = loftBody(spec.keys, { rings: spec.rings ?? 68, radial, squareness: spec.squareness, bellyFlat: spec.bellyFlat, color: spec.color });
  const order = [spec.head, ...spec.neck, spec.chest, spec.pelvis, ...spec.tail];
  for (let i = 1; i < order.length; i++) if (order[i] <= order[i - 1]) throw new Error('bone keys must ascend');
  skinByRings(loft, radial, order.map((k) => loft.tOfKey(k)));
  const bones = order.map(() => new THREE.Bone());
  const rest = new Map<THREE.Bone, THREE.Vector3>();
  order.forEach((k, i) => rest.set(bones[i], loft.keyPoint(k)));
  const head = bones[0];
  const neck = bones.slice(1, 1 + spec.neck.length);
  const chest = bones[1 + spec.neck.length];
  const pelvis = bones[2 + spec.neck.length];
  const tail = bones.slice(3 + spec.neck.length);
  const link = (child: THREE.Bone, parent: THREE.Bone | null) => {
    const p = rest.get(child)!.clone();
    if (parent) {
      p.sub(rest.get(parent)!);
      parent.add(child);
    }
    child.position.copy(p);
  };
  link(pelvis, null);
  link(chest, pelvis);
  // neck: nearest to chest first
  let prev: THREE.Bone = chest;
  for (let i = neck.length - 1; i >= 0; i--) {
    link(neck[i], prev);
    prev = neck[i];
  }
  link(head, prev);
  prev = pelvis;
  for (const t of tail) {
    link(t, prev);
    prev = t;
  }
  const mesh = new THREE.SkinnedMesh(loft.geometry, skinMat);
  mesh.add(pelvis);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.frustumCulled = false;
  const parts = new Map<THREE.Bone, Parts>();
  for (const b of bones) parts.set(b, new Parts());
  return {
    loft,
    mesh,
    head,
    neck,
    chest,
    pelvis,
    tail,
    rest,
    parts,
    local(bone, p) {
      const v = Array.isArray(p) ? new THREE.Vector3(...p) : p.clone();
      v.sub(rest.get(bone)!);
      return [v.x, v.y, v.z];
    },
  };
}

export interface SkinStyle {
  stripes?: (t: number, s: number) => number;
  spots?: number;
  beakUntil?: number;
  dorsal?: number;
}

export function skinColor(p: DinoPalette, style: SkinStyle = {}): ColorFn {
  const body = new THREE.Color(p.body);
  const back = shade(p.body, style.dorsal ?? 0.7);
  const belly = new THREE.Color(p.belly);
  const accent = new THREE.Color(p.accent);
  const beak = new THREE.Color(BEAK);
  return (t, sa, ca, s) => {
    const c = body.clone();
    if (sa > 0) c.lerp(back, sa * sa * 0.85);
    c.lerp(belly, smooth(-0.1, -0.8, sa));
    if (style.stripes && sa > -0.25) {
      const k = style.stripes(t, s);
      if (k > 0) c.lerp(accent, k * smooth(-0.25, 0.35, sa));
    }
    if (style.spots && sa > -0.2) {
      const n = noise3(Math.round(s * 9), Math.round(ca * 4), 3.1);
      if (n > 1 - style.spots) c.lerp(accent, 0.6);
    }
    if (style.beakUntil !== undefined && t < style.beakUntil) c.lerp(beak, smooth(style.beakUntil, style.beakUntil * 0.55, t));
    const m = noise3(Math.round(s * 16), Math.round(sa * 7), Math.round(ca * 7));
    c.multiplyScalar(0.9 + m * 0.14);
    return c;
  };
}

export function bandStripes(from: number, to: number, perMetre: number, width = 0.32) {
  return (t: number, s: number) => {
    if (t < from || t > to) return 0;
    const f = (s * perMetre) % 1;
    return smooth(0, 0.08, f) * (1 - smooth(width - 0.08, width, f));
  };
}

export function bodyEmissive(p: DinoPalette): number {
  return p.effect === 'gold' ? 0x3a2600 : p.effect === 'frost' ? 0x0f2633 : 0;
}

export function makeSkinMaterial(p: DinoPalette, anim: THREE.MeshStandardMaterial[]): THREE.MeshStandardMaterial {
  if (p.effect === 'rainbow') {
    const m = creatureMaterial('skin').clone();
    m.userData.shared = false;
    anim.push(m);
    return m;
  }
  return creatureMaterial('skin', bodyEmissive(p));
}

// ---------------------------------------------------------------------------
// Parts: eyes, teeth, limbs
// ---------------------------------------------------------------------------

export function addEye(parts: Parts, pos: [number, number, number], r: number, side: number, iris: number, body: number, friendly = false) {
  const dir = new THREE.Vector3(side, 0.12, -0.55).normalize();
  const at = (k: number, up = 0): [number, number, number] => [pos[0] + dir.x * k, pos[1] + dir.y * k + up, pos[2] + dir.z * k];
  parts.add(PG.sphere(16, 12), iris, pos, [0, 0, 0], r, 'gloss');
  const look = new THREE.Euler(0, Math.atan2(-dir.x, -dir.z), 0);
  parts.add(PG.sphere(10, 8), 0x0c0c12, at(r * 0.86), [look.x, look.y, look.z], friendly ? [r * 0.48, r * 0.6, r * 0.25] : [r * 0.2, r * 0.68, r * 0.2], 'gloss');
  parts.add(PG.sphere(8, 6), 0xffffff, at(r * 0.9, r * 0.32), [0, 0, 0], r * 0.17, 'gloss');
  // brow ridge / eyelid
  parts.add(PG.sphere(12, 8), shade(body, 0.8), [pos[0] - side * r * 0.05, pos[1] + r * 0.78, pos[2] + r * 0.05], [0.2, 0, side * 0.15], [r * 1.25, r * 0.45, r * 1.35]);
}

export function addTeeth(parts: Parts, zFrom: number, zTo: number, count: number, xAt: (z: number) => number, yAt: (z: number) => number, len: number, down: boolean) {
  for (let i = 0; i < count; i++) {
    const z = zFrom + ((zTo - zFrom) * i) / Math.max(1, count - 1);
    for (const side of [-1, 1]) {
      parts.add(PG.cone(5), IVORY, [side * xAt(z), yAt(z), z], [down ? Math.PI : 0, 0, 0], [len * 0.32, len, len * 0.32], 'gloss');
    }
  }
}

/** UV repeat so scales keep roughly the same size on limbs of any size. */
export function limbUv(r: number, L: number): [number, number] {
  return [Math.max(1, 2 * Math.PI * r * 9), Math.max(1, L * 9)];
}

export function theropodLeg(side: number, attach: [number, number, number], L: [number, number, number], r: number, rest: [number, number, number], p: DinoPalette, sickle: boolean, emissive: number, skin: THREE.Material): LegRig {
  const hip = new THREE.Group();
  hip.position.set(...attach);
  const knee = new THREE.Group();
  knee.position.y = -L[0];
  hip.add(knee);
  const ankle = new THREE.Group();
  ankle.position.y = -L[1];
  knee.add(ankle);
  const foot = new THREE.Group();
  foot.position.y = -L[2];
  ankle.add(foot);
  const dark = shade(p.body, 0.8);
  const darker = shade(p.body, 0.62);
  // thigh: a big muscular drumstick whose top is buried in the hip
  const sink = r * 0.55;
  new Parts()
    .add(limbGeometry(L[0] + sink, r * 1.75, r * 0.82, r * 0.42, 0.2), (q) => mix(p.body, dark, smooth(-0.25 * L[0], -L[0], q.y)), [0, sink, 0], [0, 0, 0], [0.76, 1, 1.2], 'skin', limbUv(r * 1.5, L[0]))
    .build(hip, emissive, skin);
  // shin with a calf muscle at the back
  new Parts()
    .add(limbGeometry(L[1], r * 0.8, r * 0.44, r * 0.2, 0.18), (q) => mix(dark, shade(p.body, 0.72), smooth(0, -L[1], q.y)), [0, 0, 0], [0, 0, 0], [0.8, 1, 1.12], 'skin', limbUv(r * 0.6, L[1]))
    .build(knee, emissive, skin);
  // slender metatarsus (dinosaurs walk on their toes)
  new Parts()
    .add(limbGeometry(L[2], r * 0.44, r * 0.34), (q) => mix(shade(p.body, 0.72), darker, smooth(0, -L[2], q.y)), [0, 0, 0], [0, 0, 0], [0.85, 1, 1], 'skin', limbUv(r * 0.4, L[2]))
    .build(ankle, emissive, skin);
  // three forward toes with two pads each and a claw, plus a small dew claw
  const fp = new Parts();
  const toeLen = r * 1.9;
  for (const [i, x] of [-1, 0, 1].entries()) {
    const yaw = x * 0.34;
    const len = toeLen * (i === 1 ? 1.12 : 0.86);
    const dir = new THREE.Vector3(Math.sin(-yaw), 0, -Math.cos(yaw));
    const base = new THREE.Vector3(x * r * 0.2, 0.0, -r * 0.1);
    for (let k = 0; k < 2; k++) {
      const c = base.clone().addScaledVector(dir, len * (0.28 + k * 0.42));
      fp.add(PG.sphere(10, 8), k ? darker : shade(p.body, 0.7), [c.x, r * 0.17 - k * r * 0.03, c.z], [0, -yaw, 0], [r * 0.2, r * 0.17, len * 0.27]);
    }
    const tip = base.clone().addScaledVector(dir, len * 0.92);
    fp.add(hornGeometry(r * 0.48, r * 0.1, 0.65), CLAW, [tip.x, r * 0.12, tip.z], [-1.2, -yaw, 0], 1, 'gloss');
  }
  fp.add(PG.sphere(10, 8), darker, [0, r * 0.14, r * 0.08], [0, 0, 0], [r * 0.3, r * 0.2, r * 0.32]);
  if (sickle) fp.add(hornGeometry(r * 0.9, r * 0.13, 0.95), CLAW, [-side * r * 0.32, r * 0.3, -r * 0.3], [-0.3, 0, 0], 1, 'gloss');
  else fp.add(hornGeometry(r * 0.3, r * 0.08, 0.5), CLAW, [-side * r * 0.28, r * 0.42, r * 0.15], [-0.8, 0, 0], 1, 'gloss');
  fp.build(foot, emissive, skin);
  return { hip, knee, ankle, foot, phase: side > 0 ? Math.PI : 0, front: false, rest };
}

/**
 * Column-like leg of a heavy four-legged dinosaur: muscular upper limb
 * buried in the body, thick lower limb and a round padded foot with nails.
 */
export function quadLeg(side: number, attach: [number, number, number], L: [number, number], r: number, rest: [number, number], p: DinoPalette, front: boolean, emissive: number, skin: THREE.Material, toes = 4): LegRig {
  const hip = new THREE.Group();
  hip.position.set(...attach);
  const knee = new THREE.Group();
  knee.position.y = -L[0];
  hip.add(knee);
  const foot = new THREE.Group();
  foot.position.y = -L[1];
  knee.add(foot);
  const dark = shade(p.body, 0.76);
  const darker = shade(p.body, 0.6);
  const sink = r * 0.75;
  new Parts()
    .add(limbGeometry(L[0] + sink, r * 1.6, r * 1.0, r * 0.3, 0.22), (q) => mix(p.body, dark, smooth(0, -L[0], q.y)), [0, sink, 0], [0, 0, 0], [0.84, 1, front ? 1.06 : 1.18], 'skin', limbUv(r * 1.4, L[0]))
    .build(hip, emissive, skin);
  new Parts()
    .add(limbGeometry(L[1], r * 0.98, r * 0.86, r * 0.05, 0.3), (q) => mix(dark, darker, smooth(-L[1] * 0.4, -L[1], q.y)), [0, 0, 0], [0, 0, 0], [0.95, 1, 1.0], 'skin', limbUv(r, L[1]))
    .build(knee, emissive, skin);
  const fp = new Parts();
  // padded, slightly flared foot like an elephant's
  fp.add(limbGeometry(r * 0.34, r * 0.86, r * 1.1), darker, [0, r * 0.4, -r * 0.06], [0, 0, 0], [1, 0.9, 1.1]);
  for (let i = 0; i < toes; i++) {
    const a = -0.95 + (1.9 * i) / Math.max(1, toes - 1);
    const big = 1 - Math.abs(a) * 0.25;
    fp.add(PG.sphere(10, 8), IVORY, [Math.sin(a) * r * 1.02, r * 0.08, -Math.cos(a) * r * 1.02], [0, -a, 0], [r * 0.24 * big, r * 0.2 * big, r * 0.28 * big], 'gloss');
  }
  fp.build(foot, emissive, skin);
  return { hip, knee, ankle: null, foot, phase: side > 0 ? 0 : Math.PI, front, rest: [rest[0], rest[1], 0] };
}

export function legDrop(L: number[], rest: number[]): number {
  let a = 0;
  let d = 0;
  for (let i = 0; i < L.length; i++) {
    a += rest[i];
    d += L[i] * Math.cos(a);
  }
  return d;
}

export function theropodArm(side: number, parent: THREE.Object3D, at: [number, number, number], L: [number, number], r: number, rest: [number, number], p: DinoPalette, emissive: number, skin: THREE.Material, feathers: boolean, thumb = false): ArmRig {
  const shoulder = new THREE.Group();
  shoulder.position.set(...at);
  parent.add(shoulder);
  const elbow = new THREE.Group();
  elbow.position.y = -L[0];
  shoulder.add(elbow);
  new Parts().add(limbGeometry(L[0], r, r * 0.65, r * 0.2, 0.3), p.body, [0, 0, 0], [0, 0, 0], 1, 'skin', limbUv(r, L[0])).build(shoulder, emissive, skin);
  const ep = new Parts();
  ep.add(limbGeometry(L[1], r * 0.68, r * 0.5), shade(p.body, 0.85), [0, 0, 0], [0, 0, 0], 1, 'skin', limbUv(r * 0.6, L[1]));
  for (const x of [-1, 0, 1]) ep.add(hornGeometry(r * 1.2, r * 0.22, 0.8), CLAW, [x * r * 0.35, -L[1] - r * 0.4, 0], [Math.PI + 0.3, 0, x * 0.15], 1, 'gloss');
  if (thumb) ep.add(hornGeometry(r * 2.2, r * 0.35, 0.9), CLAW, [side * r * 0.5, -L[1] * 0.85, -r * 0.3], [Math.PI + 0.6, 0, side * 0.4], 1, 'gloss');
  if (feathers) {
    for (let i = 0; i < 5; i++) {
      ep.add(PG.sphere(8, 6), i % 2 ? p.accent : mix(p.accent, p.detail, 0.35), [side * r * 0.15, -L[1] * (0.2 + i * 0.17), r * 0.9], [0.55 - i * 0.05, 0, 0], [r * 0.1, r * 1.4, r * 0.55]);
    }
  }
  ep.build(elbow, emissive, skin);
  return { shoulder, elbow, rest };
}

// ---------------------------------------------------------------------------
// Rig assembly
// ---------------------------------------------------------------------------

export function newRig(kind: DinoRig['archetype'], p: DinoPalette): DinoRig {
  const root = new THREE.Group();
  const hips = new THREE.Group();
  root.add(hips);
  const dummy = new THREE.Group();
  return {
    archetype: kind,
    root,
    hips,
    body: null,
    head: dummy,
    neck: dummy,
    neckBones: [],
    chest: null,
    jaw: null,
    tail: [],
    legs: [],
    arms: [],
    wings: [],
    headTop: new THREE.Group(),
    face: new THREE.Group(),
    hipHeight: 1,
    height: 2,
    length: 3,
    stride: 2.5,
    quadruped: false,
    phase: Math.random() * 6,
    animatedMaterials: [],
    effect: p.effect ?? 'none',
    accessory: null,
  };
}

export function finishSpine(rig: DinoRig, sp: Spine, emissive: number, skin: THREE.Material) {
  rig.hips.add(sp.mesh);
  rig.body = sp.mesh;
  rig.head = sp.head;
  rig.neckBones = sp.neck;
  rig.neck = sp.neck[sp.neck.length - 1] ?? sp.chest;
  rig.chest = sp.chest;
  rig.tail = sp.tail;
  for (const [bone, parts] of sp.parts) parts.build(bone, emissive, skin);
  sp.head.add(rig.headTop, rig.face);
}

export function keyExtents(keys: BodyKey[], hip: number) {
  let top = 0;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const k of keys) {
    top = Math.max(top, hip + k.y + k.h);
    minZ = Math.min(minZ, k.z);
    maxZ = Math.max(maxZ, k.z);
  }
  return { top, length: maxZ - minZ };
}

// ---------------------------------------------------------------------------

export function orient(n: THREE.Vector3, pos: THREE.Vector3, scale: THREE.Vector3): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  return new THREE.Matrix4().compose(pos, q, scale);
}

