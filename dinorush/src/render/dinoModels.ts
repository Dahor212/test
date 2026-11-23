import * as THREE from 'three';
import { ACCESSORY_BY_ID, DINO_BY_ID } from '../config/dinosaurs';
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
  fanGeometry,
  sheetGeometry,
  shade,
  skinByRings,
  smooth,
  type BodyKey,
  type ColorFn,
  type Loft,
} from './creature';
import { GEO, group, mat, mesh } from './util';

/**
 * Procedural dinosaurs: one smooth skinned body (snout → tail tip) whose
 * neck and tail bend, jointed legs with toes and claws, and the typical
 * features of every species. Models face -Z (direction of travel).
 * Game logic never touches this file.
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

const CLAW = 0x3b3430;
const IVORY = 0xf3ead2;
const BEAK = 0x3c3a3f;

// ---------------------------------------------------------------------------
// Skeleton + skin
// ---------------------------------------------------------------------------

interface SpineSpec {
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

interface Spine {
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

function buildSpine(spec: SpineSpec, skinMat: THREE.Material): Spine {
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

interface SkinStyle {
  stripes?: (t: number, s: number) => number;
  spots?: number;
  beakUntil?: number;
  dorsal?: number;
}

function skinColor(p: DinoPalette, style: SkinStyle = {}): ColorFn {
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

function bandStripes(from: number, to: number, perMetre: number, width = 0.32) {
  return (t: number, s: number) => {
    if (t < from || t > to) return 0;
    const f = (s * perMetre) % 1;
    return smooth(0, 0.08, f) * (1 - smooth(width - 0.08, width, f));
  };
}

function bodyEmissive(p: DinoPalette): number {
  return p.effect === 'gold' ? 0x3a2600 : p.effect === 'frost' ? 0x0f2633 : 0;
}

function makeSkinMaterial(p: DinoPalette, anim: THREE.MeshStandardMaterial[]): THREE.MeshStandardMaterial {
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

function addEye(parts: Parts, pos: [number, number, number], r: number, side: number, iris: number, body: number, friendly = false) {
  const dir = new THREE.Vector3(side, 0.12, -0.55).normalize();
  const at = (k: number, up = 0): [number, number, number] => [pos[0] + dir.x * k, pos[1] + dir.y * k + up, pos[2] + dir.z * k];
  parts.add(PG.sphere(16, 12), iris, pos, [0, 0, 0], r, 'gloss');
  const look = new THREE.Euler(0, Math.atan2(-dir.x, -dir.z), 0);
  parts.add(PG.sphere(10, 8), 0x0c0c12, at(r * 0.86), [look.x, look.y, look.z], friendly ? [r * 0.48, r * 0.6, r * 0.25] : [r * 0.2, r * 0.68, r * 0.2], 'gloss');
  parts.add(PG.sphere(8, 6), 0xffffff, at(r * 0.9, r * 0.32), [0, 0, 0], r * 0.17, 'gloss');
  // brow ridge / eyelid
  parts.add(PG.sphere(12, 8), shade(body, 0.8), [pos[0] - side * r * 0.05, pos[1] + r * 0.78, pos[2] + r * 0.05], [0.2, 0, side * 0.15], [r * 1.25, r * 0.45, r * 1.35]);
}

function addTeeth(parts: Parts, zFrom: number, zTo: number, count: number, xAt: (z: number) => number, yAt: (z: number) => number, len: number, down: boolean) {
  for (let i = 0; i < count; i++) {
    const z = zFrom + ((zTo - zFrom) * i) / Math.max(1, count - 1);
    for (const side of [-1, 1]) {
      parts.add(PG.cone(5), IVORY, [side * xAt(z), yAt(z), z], [down ? Math.PI : 0, 0, 0], [len * 0.32, len, len * 0.32], 'gloss');
    }
  }
}

/** UV repeat so scales keep roughly the same size on limbs of any size. */
function limbUv(r: number, L: number): [number, number] {
  return [Math.max(1, 2 * Math.PI * r * 9), Math.max(1, L * 9)];
}

function theropodLeg(side: number, attach: [number, number, number], L: [number, number, number], r: number, rest: [number, number, number], p: DinoPalette, sickle: boolean, emissive: number, skin: THREE.Material): LegRig {
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
  const dark = shade(p.body, 0.75);
  new Parts().add(limbGeometry(L[0], r * 1.25, r * 0.82, r * 0.35, 0.3), (q) => mix(p.body, dark, smooth(-0.2 * L[0], -L[0], q.y)), [0, 0, 0], [0, 0, 0], [0.9, 1, 1.15], 'skin', limbUv(r * 1.2, L[0])).build(hip, emissive, skin);
  new Parts().add(limbGeometry(L[1], r * 0.66, r * 0.5, r * 0.08, 0.2), dark, [0, 0, 0], [0, 0, 0], [0.9, 1, 1.05], 'skin', limbUv(r * 0.7, L[1])).build(knee, emissive, skin);
  new Parts().add(limbGeometry(L[2], r * 0.43, r * 0.4), (q) => mix(dark, shade(p.body, 0.55), smooth(0, -L[2], q.y)), [0, 0, 0], [0, 0, 0], [0.9, 1, 1], 'skin', limbUv(r * 0.5, L[2])).build(ankle, emissive, skin);
  const fp = new Parts();
  const toeLen = r * 1.7;
  for (const [i, x] of [-1, 0, 1].entries()) {
    const yaw = x * 0.32;
    const len = toeLen * (i === 1 ? 1.15 : 0.85);
    const dx = Math.sin(-yaw) * len;
    const dz = -Math.cos(yaw) * len;
    fp.add(PG.sphere(10, 8), shade(p.body, 0.6), [x * r * 0.25 + dx * 0.5, 0.02, dz * 0.5], [0, -yaw, 0], [r * 0.24, r * 0.2, len * 0.55]);
    fp.add(hornGeometry(r * 0.5, r * 0.11, 0.6), CLAW, [x * r * 0.25 + dx, 0.03, dz], [-1.25, -yaw, 0], 1, 'gloss');
  }
  if (sickle) fp.add(hornGeometry(r * 0.85, r * 0.13, 0.9), CLAW, [-side * r * 0.3, 0.12, -r * 0.35], [-0.35, 0, 0], 1, 'gloss');
  // heel spur
  fp.add(PG.sphere(8, 6), shade(p.body, 0.55), [0, 0.04, r * 0.25], [0, 0, 0], [r * 0.26, r * 0.22, r * 0.3]);
  fp.build(foot, emissive, skin);
  return { hip, knee, ankle, foot, phase: side > 0 ? Math.PI : 0, front: false, rest };
}

function quadLeg(side: number, attach: [number, number, number], L: [number, number], r: number, rest: [number, number], p: DinoPalette, front: boolean, emissive: number, skin: THREE.Material, toes = 4): LegRig {
  const hip = new THREE.Group();
  hip.position.set(...attach);
  const knee = new THREE.Group();
  knee.position.y = -L[0];
  hip.add(knee);
  const foot = new THREE.Group();
  foot.position.y = -L[1];
  knee.add(foot);
  const dark = shade(p.body, 0.72);
  new Parts().add(limbGeometry(L[0], r * 1.38, r * 0.98, r * 0.25, 0.25), (q) => mix(p.body, dark, smooth(0, -L[0], q.y)), [0, 0, 0], [0, 0, 0], [0.95, 1, 1.1], 'skin', limbUv(r * 1.3, L[0])).build(hip, emissive, skin);
  new Parts().add(limbGeometry(L[1] + r * 0.4, r * 1.04, r * 1.07), dark, [0, r * 0.4, 0], [0, 0, 0], [1, 1, 1.05], 'skin', limbUv(r * 1.05, L[1])).build(knee, emissive, skin);
  const fp = new Parts();
  fp.add(PG.sphere(18, 10), shade(p.body, 0.55), [0, 0.06, -r * 0.06], [0, 0, 0], [r * 1.12, r * 0.62, r * 1.2]);
  for (let i = 0; i < toes; i++) {
    const a = -0.9 + (1.8 * i) / Math.max(1, toes - 1);
    fp.add(PG.sphere(8, 6), IVORY, [Math.sin(a) * r * 0.85, 0.05, -Math.cos(a) * r * 0.85], [0, 0, 0], [r * 0.22, r * 0.16, r * 0.24], 'gloss');
  }
  fp.build(foot, emissive, skin);
  return { hip, knee, ankle: null, foot, phase: side > 0 ? 0 : Math.PI, front, rest: [rest[0], rest[1], 0] };
}

function legDrop(L: number[], rest: number[]): number {
  let a = 0;
  let d = 0;
  for (let i = 0; i < L.length; i++) {
    a += rest[i];
    d += L[i] * Math.cos(a);
  }
  return d;
}

function theropodArm(side: number, parent: THREE.Object3D, at: [number, number, number], L: [number, number], r: number, rest: [number, number], p: DinoPalette, emissive: number, skin: THREE.Material, feathers: boolean, thumb = false): ArmRig {
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

function newRig(kind: DinoRig['archetype'], p: DinoPalette): DinoRig {
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

function finishSpine(rig: DinoRig, sp: Spine, emissive: number, skin: THREE.Material) {
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

function keyExtents(keys: BodyKey[], hip: number) {
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
// Species
// ---------------------------------------------------------------------------

function raptor(p: DinoPalette): DinoRig {
  const rig = newRig('raptor', p);
  const skin = makeSkinMaterial(p, rig.animatedMaterials);
  const em = bodyEmissive(p);
  const keys: BodyKey[] = [
    { z: -1.64, y: 0.8, w: 0.012, h: 0.012 },
    { z: -1.58, y: 0.8, w: 0.045, h: 0.05 },
    { z: -1.48, y: 0.81, w: 0.07, h: 0.075 },
    { z: -1.36, y: 0.84, w: 0.095, h: 0.1 },
    { z: -1.24, y: 0.87, w: 0.118, h: 0.122 },
    { z: -1.13, y: 0.84, w: 0.11, h: 0.12 },
    { z: -1.02, y: 0.72, w: 0.075, h: 0.09 },
    { z: -0.86, y: 0.55, w: 0.105, h: 0.115 },
    { z: -0.66, y: 0.33, w: 0.18, h: 0.2 },
    { z: -0.4, y: 0.17, w: 0.27, h: 0.3 },
    { z: -0.1, y: 0.12, w: 0.3, h: 0.32 },
    { z: 0.18, y: 0.12, w: 0.27, h: 0.29 },
    { z: 0.48, y: 0.15, w: 0.17, h: 0.18 },
    { z: 0.85, y: 0.18, w: 0.11, h: 0.11 },
    { z: 1.22, y: 0.2, w: 0.068, h: 0.068 },
    { z: 1.58, y: 0.21, w: 0.042, h: 0.042 },
    { z: 1.92, y: 0.22, w: 0.01, h: 0.01 },
  ];
  const sp = buildSpine(
    { keys, head: 4, neck: [6, 7], chest: 9, pelvis: 11, tail: [12, 13, 14, 15], color: skinColor(p, { stripes: bandStripes(0.42, 0.97, 3.4) }) },
    skin,
  );
  const hp = sp.parts.get(sp.head)!;
  for (const side of [-1, 1]) {
    addEye(hp, sp.local(sp.head, [side * 0.098, 0.915, -1.27]), 0.042, side, 0xffb300, p.body);
    hp.add(PG.sphere(8, 6), 0x1a1a1a, sp.local(sp.head, [side * 0.028, 0.835, -1.585]), [0, 0, 0], 0.012);
  }
  const rhz = sp.rest.get(sp.head)!.z;
  addTeeth(hp, -1.55 - rhz, -1.3 - rhz, 7, (z) => 0.82 * (0.118 + z * 0.22), () => -0.128, 0.032, true);
  // feather crest
  for (let i = 0; i < 4; i++) hp.add(PG.sphere(8, 6), i % 2 ? p.detail : p.accent, sp.local(sp.head, [0, 0.98 - i * 0.02, -1.15 + i * 0.07]), [-0.9, 0, 0], [0.025, 0.11, 0.03]);
  // lower jaw
  const jaw = new THREE.Group();
  jaw.position.set(...sp.local(sp.head, [0, 0.79, -1.16]));
  const jawLoft = loftBody(
    [
      { z: -0.45, y: -0.025, w: 0.012, h: 0.01 },
      { z: -0.4, y: -0.025, w: 0.038, h: 0.025 },
      { z: -0.27, y: -0.02, w: 0.06, h: 0.035 },
      { z: -0.12, y: -0.01, w: 0.085, h: 0.045 },
      { z: 0.0, y: 0.0, w: 0.09, h: 0.045 },
    ],
    { rings: 16, radial: 12, color: (_t, sa) => mix(p.body, p.belly, smooth(0.2, -0.6, sa)) },
  );
  jaw.add(new THREE.Mesh(jawLoft.geometry, skin));
  const jp = new Parts();
  addTeeth(jp, -0.38, -0.1, 6, (z) => 0.03 + (z + 0.4) * 0.12, () => 0.01, 0.026, false);
  jp.build(jaw, em, skin);
  sp.head.add(jaw);
  rig.jaw = jaw;
  rig.headTop.position.set(...sp.local(sp.head, [0, 0.99, -1.22]));
  rig.face.position.set(...sp.local(sp.head, [0, 0.93, -1.33]));
  rig.face.scale.setScalar(0.8);
  rig.headTop.scale.setScalar(0.75);
  // arms with feathers
  for (const side of [-1, 1]) rig.arms.push(theropodArm(side, sp.chest, sp.local(sp.chest, [side * 0.17, 0.06, -0.47]), [0.22, 0.2], 0.05, [0.7, -1.4], p, em, skin, true));
  finishSpine(rig, sp, em, skin);
  // legs
  const L: [number, number, number] = [0.44, 0.46, 0.3];
  const rest: [number, number, number] = [0.4, -1.05, 0.75];
  rig.hipHeight = legDrop(L, rest) + 0.04;
  for (const side of [-1, 1]) {
    const leg = theropodLeg(side, [side * 0.22, -0.03, 0.12], L, 0.13, rest, p, true, em, skin);
    rig.hips.add(leg.hip);
    rig.legs.push(leg);
  }
  const ext = keyExtents(keys, rig.hipHeight);
  rig.height = ext.top;
  rig.length = ext.length;
  rig.stride = 2.8;
  return rig;
}

function spino(p: DinoPalette): DinoRig {
  const rig = newRig('spino', p);
  const skin = makeSkinMaterial(p, rig.animatedMaterials);
  const em = bodyEmissive(p);
  const keys: BodyKey[] = [
    { z: -2.4, y: 0.92, w: 0.012, h: 0.012 },
    { z: -2.32, y: 0.92, w: 0.05, h: 0.045 },
    { z: -2.18, y: 0.92, w: 0.068, h: 0.062 },
    { z: -2.02, y: 0.93, w: 0.062, h: 0.068 },
    { z: -1.85, y: 0.95, w: 0.078, h: 0.085 },
    { z: -1.66, y: 0.99, w: 0.11, h: 0.12 },
    { z: -1.48, y: 1.03, w: 0.148, h: 0.158 },
    { z: -1.32, y: 0.98, w: 0.13, h: 0.15 },
    { z: -1.16, y: 0.82, w: 0.12, h: 0.15 },
    { z: -0.96, y: 0.6, w: 0.16, h: 0.19 },
    { z: -0.7, y: 0.4, w: 0.25, h: 0.29 },
    { z: -0.38, y: 0.26, w: 0.32, h: 0.36 },
    { z: 0.0, y: 0.2, w: 0.33, h: 0.37 },
    { z: 0.36, y: 0.2, w: 0.27, h: 0.31 },
    { z: 0.72, y: 0.22, w: 0.15, h: 0.26 },
    { z: 1.12, y: 0.25, w: 0.085, h: 0.29 },
    { z: 1.55, y: 0.27, w: 0.058, h: 0.27 },
    { z: 1.98, y: 0.28, w: 0.038, h: 0.19 },
    { z: 2.36, y: 0.29, w: 0.01, h: 0.03 },
  ];
  const sp = buildSpine(
    { keys, head: 6, neck: [8, 10], chest: 11, pelvis: 13, tail: [14, 15, 16, 17], color: skinColor(p, { spots: 0.22, dorsal: 0.62 }) },
    skin,
  );
  const hp = sp.parts.get(sp.head)!;
  const hz = sp.rest.get(sp.head)!.z;
  for (const side of [-1, 1]) {
    addEye(hp, sp.local(sp.head, [side * 0.118, 1.11, -1.55]), 0.045, side, 0xf9ca24, p.body);
    hp.add(PG.sphere(8, 6), 0x1a1a1a, sp.local(sp.head, [side * 0.03, 1.0, -2.1]), [0, 0, 0], 0.014);
  }
  addTeeth(hp, -2.3 - hz, -1.65 - hz, 10, (z) => 0.05 + (z + 0.85) * 0.07, (z) => -0.11 - (z + 0.85) * 0.04 - 0.03, 0.04, true);
  hp.add(PG.sphere(10, 8), shade(p.body, 0.75), sp.local(sp.head, [0, 1.2, -1.58]), [0, 0, 0], [0.04, 0.05, 0.12]);
  const jaw = new THREE.Group();
  jaw.position.set(...sp.local(sp.head, [0, 0.95, -1.36]));
  const jawLoft = loftBody(
    [
      { z: -1.02, y: -0.025, w: 0.012, h: 0.01 },
      { z: -0.92, y: -0.025, w: 0.042, h: 0.026 },
      { z: -0.6, y: -0.015, w: 0.055, h: 0.032 },
      { z: -0.28, y: -0.005, w: 0.09, h: 0.045 },
      { z: 0.0, y: 0.0, w: 0.12, h: 0.055 },
    ],
    { rings: 20, radial: 12, color: (_t, sa) => mix(p.body, p.belly, smooth(0.2, -0.6, sa)) },
  );
  jaw.add(new THREE.Mesh(jawLoft.geometry, skin));
  const jp = new Parts();
  addTeeth(jp, -0.95, -0.3, 8, (z) => 0.035 + (z + 0.95) * 0.04, () => 0.01, 0.034, false);
  jp.build(jaw, em, skin);
  sp.head.add(jaw);
  rig.jaw = jaw;
  // the sail – a thin skin sheet with bony spines
  const outline: [number, number][] = [[0.82, 0], [0.8, 0.35], [0.7, 0.72], [0.45, 1.15], [0.1, 1.36], [-0.15, 1.36], [-0.38, 1.12], [-0.55, 0.7], [-0.62, 0.25], [-0.64, 0]];
  const sailH = (x: number) => {
    for (let i = 0; i < outline.length - 1; i++) {
      const [x0, h0] = outline[i];
      const [x1, h1] = outline[i + 1];
      if (x <= x0 && x >= x1) return h0 + ((x - x0) / (x1 - x0)) * (h1 - h0);
    }
    return 0;
  };
  const sailColor = (q: THREE.Vector3) => {
    const h = Math.max(0, Math.min(1, q.y / Math.max(0.05, sailH(q.x))));
    let c = mix(shade(p.body, 0.85), p.accent, smooth(0, 0.45, h));
    c = mix(c, p.detail, smooth(0.78, 1, h) * 0.7);
    const ray = Math.abs(((((q.x - 0.68) / 0.155) % 1) + 1) % 1 - 0.5) > 0.42;
    return ray ? shade(c, 0.62) : c;
  };
  sp.parts.get(sp.pelvis)!.add(sheetGeometry(-0.64, 0.82, sailH, 30, 10), sailColor, sp.local(sp.pelvis, [0, 0.38, -0.05]), [0, Math.PI / 2, 0], 1, 'membrane');
  // bony spines inside the sail
  for (let i = 0; i < 9; i++) {
    const x = 0.68 - i * 0.155;
    const h = sailH(x) * 0.97;
    if (h < 0.15) continue;
    sp.parts.get(sp.pelvis)!.add(hornGeometry(h + 0.08, 0.026, 0.04 - x * 0.1), shade(p.accent, 0.5), sp.local(sp.pelvis, [0, 0.3, -0.05 - x]), [0, 0, 0], 1);
  }
  rig.headTop.position.set(...sp.local(sp.head, [0, 1.2, -1.45]));
  rig.face.position.set(...sp.local(sp.head, [0, 1.12, -1.66]));
  rig.face.scale.setScalar(0.9);
  rig.headTop.scale.setScalar(0.85);
  for (const side of [-1, 1]) rig.arms.push(theropodArm(side, sp.chest, sp.local(sp.chest, [side * 0.27, 0.08, -0.55]), [0.3, 0.27], 0.075, [0.6, -1.1], p, em, skin, false, true));
  finishSpine(rig, sp, em, skin);
  const L: [number, number, number] = [0.45, 0.45, 0.3];
  const rest: [number, number, number] = [0.35, -0.95, 0.7];
  rig.hipHeight = legDrop(L, rest) + 0.05;
  for (const side of [-1, 1]) {
    const leg = theropodLeg(side, [side * 0.25, -0.04, 0.34], L, 0.17, rest, p, false, em, skin);
    rig.hips.add(leg.hip);
    rig.legs.push(leg);
  }
  const ext = keyExtents(keys, rig.hipHeight);
  rig.height = rig.hipHeight + 1.7;
  rig.length = ext.length;
  rig.stride = 2.9;
  return rig;
}

function orient(n: THREE.Vector3, pos: THREE.Vector3, scale: THREE.Vector3): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  return new THREE.Matrix4().compose(pos, q, scale);
}

function ankylo(p: DinoPalette): DinoRig {
  const rig = newRig('ankylo', p);
  rig.quadruped = true;
  const skin = makeSkinMaterial(p, rig.animatedMaterials);
  const em = bodyEmissive(p);
  const keys: BodyKey[] = [
    { z: -1.68, y: 0.12, w: 0.03, h: 0.03 },
    { z: -1.62, y: 0.13, w: 0.12, h: 0.085 },
    { z: -1.5, y: 0.17, w: 0.21, h: 0.145 },
    { z: -1.34, y: 0.2, w: 0.28, h: 0.19 },
    { z: -1.17, y: 0.19, w: 0.26, h: 0.19 },
    { z: -0.95, y: 0.22, w: 0.44, h: 0.28 },
    { z: -0.6, y: 0.28, w: 0.66, h: 0.4 },
    { z: -0.15, y: 0.32, w: 0.76, h: 0.46 },
    { z: 0.3, y: 0.3, w: 0.7, h: 0.42 },
    { z: 0.68, y: 0.22, w: 0.4, h: 0.26 },
    { z: 0.98, y: 0.19, w: 0.21, h: 0.15 },
    { z: 1.3, y: 0.17, w: 0.12, h: 0.09 },
    { z: 1.6, y: 0.16, w: 0.08, h: 0.065 },
    { z: 1.82, y: 0.16, w: 0.03, h: 0.03 },
  ];
  const sp = buildSpine(
    { keys, head: 3, neck: [4], chest: 6, pelvis: 8, tail: [9, 10, 11, 12], squareness: 2.5, bellyFlat: 0.62, color: skinColor(p, { beakUntil: 0.06, dorsal: 0.8 }) },
    skin,
  );
  const hp = sp.parts.get(sp.head)!;
  for (const side of [-1, 1]) {
    addEye(hp, sp.local(sp.head, [side * 0.215, 0.27, -1.4]), 0.034, side, 0xe1b12c, p.body);
    hp.add(hornGeometry(0.2, 0.06, 0.4), p.detail, sp.local(sp.head, [side * 0.24, 0.3, -1.2]), [1.3, 0, -side * 0.8], 1);
    hp.add(hornGeometry(0.16, 0.05, 0.3), p.detail, sp.local(sp.head, [side * 0.27, 0.12, -1.26]), [2.4, 0, -side * 0.5], 1);
    hp.add(PG.sphere(8, 6), 0x1a1a1a, sp.local(sp.head, [side * 0.06, 0.17, -1.64]), [0, 0, 0], 0.016);
  }
  // head plates
  for (const [x, z] of [[0, -1.42], [-0.1, -1.3], [0.1, -1.3], [0, -1.22]]) hp.add(PG.sphere(8, 6), shade(p.accent, 1.2), sp.local(sp.head, [x, 0.38, z]), [0, 0, 0], [0.07, 0.03, 0.07]);
  // osteoderm armour on the back + side spikes
  const loft = sp.loft;
  const rows = [0.33, 0.38, 0.43, 0.48, 0.53, 0.58, 0.63];
  rows.forEach((t, ri) => {
    const bone = t < 0.46 ? sp.chest : sp.pelvis;
    const parts = sp.parts.get(bone)!;
    for (const a of [Math.PI / 2, Math.PI / 2 - 0.42, Math.PI / 2 + 0.42, Math.PI / 2 - 0.85, Math.PI / 2 + 0.85]) {
      const { p: sp0, n } = loft.surface(t + (ri % 2 ? 0.012 : 0), a);
      const pos = new THREE.Vector3(...sp.local(bone, sp0));
      const big = Math.abs(a - Math.PI / 2) < 0.1 ? 1.15 : 1;
      parts.addMatrix(PG.cone(6), (q) => mix(p.accent, p.detail, smooth(0.2, 1, q.y)), orient(n, pos, new THREE.Vector3(0.085 * big, 0.09 * big, 0.085 * big)));
    }
    for (const side of [-1, 1]) {
      const a = side > 0 ? 0.12 : Math.PI - 0.12;
      const { p: sp0, n } = loft.surface(t, a);
      const pos = new THREE.Vector3(...sp.local(bone, sp0));
      const dir = n.clone().add(new THREE.Vector3(0, -0.35, 0)).normalize();
      const len = 0.16 + Math.sin((ri / (rows.length - 1)) * Math.PI) * 0.14;
      parts.addMatrix(PG.cone(6), (q) => mix(shade(p.accent, 0.9), IVORY, smooth(0.3, 1, q.y)), orient(dir, pos, new THREE.Vector3(0.06, len, 0.06)));
    }
  });
  // tail spikes and the club
  sp.tail.forEach((bone, i) => {
    if (i > 2) return;
    const t = loft.tOfKey(9 + i) + 0.02;
    for (const side of [-1, 1]) {
      const { p: sp0, n } = loft.surface(t, side > 0 ? 0.2 : Math.PI - 0.2);
      sp.parts.get(bone)!.addMatrix(PG.cone(5), IVORY, orient(n.clone().add(new THREE.Vector3(0, 0, 0.5)).normalize(), new THREE.Vector3(...sp.local(bone, sp0)), new THREE.Vector3(0.04, 0.12, 0.04)));
    }
  });
  const clubBone = sp.tail[sp.tail.length - 1];
  const cp = sp.parts.get(clubBone)!;
  const clubAt = (x: number, y: number, z: number) => sp.local(clubBone, [x, y, z]);
  cp.add(PG.sphere(14, 10), (q) => mix(p.accent, shade(p.accent, 0.7), smooth(0.5, -0.5, q.y)), clubAt(0, 0.16, 1.78), [0, 0, 0], [0.16, 0.13, 0.2]);
  for (const side of [-1, 1]) cp.add(PG.sphere(12, 9), shade(p.accent, 1.1), clubAt(side * 0.17, 0.16, 1.76), [0, 0, 0], [0.13, 0.11, 0.15]);
  rig.headTop.position.set(...sp.local(sp.head, [0, 0.4, -1.32]));
  rig.face.position.set(...sp.local(sp.head, [0, 0.29, -1.5]));
  finishSpine(rig, sp, em, skin);
  const hindL: [number, number] = [0.32, 0.3];
  const hindRest: [number, number] = [-0.25, 0.45];
  const frontL: [number, number] = [0.3, 0.28];
  const frontRest: [number, number] = [0.15, -0.25];
  const hindDrop = legDrop(hindL, hindRest) + 0.07;
  const frontDrop = legDrop(frontL, frontRest) + 0.07;
  rig.hipHeight = hindDrop;
  for (const side of [-1, 1]) {
    const hind = quadLeg(side, [side * 0.44, 0, 0.38], hindL, 0.14, hindRest, p, false, em, skin);
    hind.phase = side > 0 ? 0 : Math.PI;
    const front = quadLeg(side, [side * 0.42, frontDrop - hindDrop, -0.66], frontL, 0.125, frontRest, p, true, em, skin, 5);
    front.phase = side > 0 ? Math.PI : 0;
    rig.hips.add(hind.hip, front.hip);
    rig.legs.push(hind, front);
  }
  const ext = keyExtents(keys, rig.hipHeight);
  rig.height = ext.top + 0.1;
  rig.length = ext.length;
  rig.stride = 1.75;
  return rig;
}

function trike(p: DinoPalette): DinoRig {
  const rig = newRig('trike', p);
  rig.quadruped = true;
  const skin = makeSkinMaterial(p, rig.animatedMaterials);
  const em = bodyEmissive(p);
  // head scaled up around the neck so it looks like a real Triceratops skull
  const hs = (x: number, y: number, z: number): [number, number, number] => [x * 1.25, 0.55 + (y - 0.55) * 1.25, -1.22 + (z + 1.22) * 1.25];
  const keys: BodyKey[] = [
    { z: -2.22, y: 0.29, w: 0.031, h: 0.038 },
    { z: -2.13, y: 0.35, w: 0.112, h: 0.15 },
    { z: -1.945, y: 0.45, w: 0.225, h: 0.275 },
    { z: -1.72, y: 0.55, w: 0.325, h: 0.375 },
    { z: -1.47, y: 0.64, w: 0.375, h: 0.41 },
    { z: -1.2, y: 0.55, w: 0.34, h: 0.36 },
    { z: -0.92, y: 0.52, w: 0.48, h: 0.5 },
    { z: -0.48, y: 0.53, w: 0.62, h: 0.57 },
    { z: -0.02, y: 0.55, w: 0.64, h: 0.58 },
    { z: 0.4, y: 0.52, w: 0.55, h: 0.54 },
    { z: 0.76, y: 0.43, w: 0.32, h: 0.33 },
    { z: 1.1, y: 0.36, w: 0.18, h: 0.18 },
    { z: 1.4, y: 0.31, w: 0.1, h: 0.1 },
    { z: 1.66, y: 0.28, w: 0.025, h: 0.025 },
  ];
  const sp = buildSpine(
    { keys, head: 4, neck: [5], chest: 7, pelvis: 9, tail: [10, 11, 12], squareness: 2.3, bellyFlat: 0.82, color: skinColor(p, { beakUntil: 0.1, stripes: bandStripes(0.45, 0.85, 2.2, 0.22), dorsal: 0.78 }) },
    skin,
  );
  const hp = sp.parts.get(sp.head)!;
  for (const side of [-1, 1]) {
    addEye(hp, sp.local(sp.head, hs(side * 0.265, 0.73, -1.55)), 0.058, side, 0xe1b12c, p.body);
    // long brow horns
    hp.add(hornGeometry(1.02, 0.1, 0.28, 10), (q) => mix(IVORY, shade(IVORY, 0.55), smooth(1.0, 0, q.y)), sp.local(sp.head, hs(side * 0.16, 0.86, -1.5)), [-1.0, side * 0.08, -side * 0.12], 1);
    hp.add(PG.sphere(8, 6), 0x1a1a1a, sp.local(sp.head, hs(side * 0.07, 0.48, -1.93)), [0, 0, 0], 0.024);
  }
  hp.add(hornGeometry(0.33, 0.075, 0.2), IVORY, sp.local(sp.head, hs(0, 0.6, -1.85)), [-0.55, 0, 0], 1);
  // frill – a dome-shaped sheet with a decorated rim
  const frillR = (a: number) => 0.8 + Math.cos(a * 9) * 0.02;
  const frillMatrix = new THREE.Matrix4().compose(new THREE.Vector3(...sp.local(sp.head, hs(0, 0.82, -1.25))), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.62, 0, 0)), new THREE.Vector3(1.25, 1.25, 1.25));
  const frillColor = (q: THREE.Vector3) => {
    const r = Math.hypot(q.x, q.y) / 0.8;
    let c = mix(shade(p.accent, 0.85), shade(p.accent, 1.3), smooth(0.1, 0.8, r));
    if (r > 0.82) c = mix(c, p.detail, smooth(0.82, 0.9, r));
    const a = Math.atan2(q.y, q.x);
    const spot = r > 0.52 && r < 0.74 && Math.floor((a / Math.PI) * 9) % 2 === 0;
    return spot ? mix(c, p.detail, 0.55) : c;
  };
  hp.addMatrix(fanGeometry(frillR, -0.18, Math.PI + 0.18, 10, 36, 0.12), frillColor, frillMatrix, 'membrane');
  const frillRot = new THREE.Matrix4().extractRotation(frillMatrix);
  for (let i = 0; i <= 12; i++) {
    const a = -0.12 + (i / 12) * (Math.PI + 0.24);
    const r = frillR(a) * 0.97;
    const edge = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.12 * 0.94).applyMatrix4(frillMatrix);
    const out = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.15).normalize().transformDirection(frillRot);
    hp.addMatrix(PG.cone(6), IVORY, orient(out, edge, new THREE.Vector3(0.055, 0.17, 0.055)));
  }
  rig.headTop.position.set(...sp.local(sp.head, hs(0, 0.97, -1.5)));
  rig.face.position.set(...sp.local(sp.head, hs(0, 0.79, -1.68)));
  rig.headTop.scale.setScalar(1.35);
  rig.face.scale.setScalar(1.6);
  finishSpine(rig, sp, em, skin);
  const hindL: [number, number] = [0.5, 0.44];
  const hindRest: [number, number] = [-0.2, 0.35];
  const frontL: [number, number] = [0.42, 0.4];
  const frontRest: [number, number] = [0.25, -0.35];
  const hindDrop = legDrop(hindL, hindRest) + 0.07;
  const frontDrop = legDrop(frontL, frontRest) + 0.07;
  rig.hipHeight = hindDrop;
  for (const side of [-1, 1]) {
    const hind = quadLeg(side, [side * 0.44, 0, 0.32], hindL, 0.17, hindRest, p, false, em, skin);
    hind.phase = side > 0 ? 0 : Math.PI;
    const front = quadLeg(side, [side * 0.42, frontDrop - hindDrop + 0.05, -0.74], frontL, 0.15, frontRest, p, true, em, skin, 5);
    front.phase = side > 0 ? Math.PI : 0;
    rig.hips.add(hind.hip, front.hip);
    rig.legs.push(hind, front);
  }
  const ext = keyExtents(keys, rig.hipHeight);
  rig.height = ext.top + 0.55;
  rig.length = ext.length;
  rig.stride = 2.1;
  return rig;
}

/** Big friendly T-Rex for the chase mode. */
export function createTrex(): DinoRig {
  const p: DinoPalette = { body: 0xe8735f, belly: 0xffe2c2, accent: 0xb8482f, detail: 0xfff7e0 };
  const rig = newRig('trex', p);
  const skin = creatureMaterial('skin');
  const keys: BodyKey[] = [
    { z: -2.9, y: 1.62, w: 0.03, h: 0.03 },
    { z: -2.82, y: 1.62, w: 0.2, h: 0.2 },
    { z: -2.6, y: 1.66, w: 0.29, h: 0.3 },
    { z: -2.32, y: 1.74, w: 0.38, h: 0.4 },
    { z: -2.06, y: 1.78, w: 0.44, h: 0.46 },
    { z: -1.84, y: 1.62, w: 0.36, h: 0.44 },
    { z: -1.6, y: 1.3, w: 0.42, h: 0.48 },
    { z: -1.25, y: 0.92, w: 0.64, h: 0.7 },
    { z: -0.75, y: 0.66, w: 0.78, h: 0.84 },
    { z: -0.2, y: 0.58, w: 0.74, h: 0.78 },
    { z: 0.35, y: 0.6, w: 0.6, h: 0.64 },
    { z: 1.05, y: 0.7, w: 0.38, h: 0.42 },
    { z: 1.8, y: 0.8, w: 0.24, h: 0.26 },
    { z: 2.55, y: 0.86, w: 0.13, h: 0.14 },
    { z: 3.2, y: 0.9, w: 0.05, h: 0.05 },
    { z: 3.55, y: 0.91, w: 0.01, h: 0.01 },
  ];
  const sp = buildSpine(
    { keys, head: 4, neck: [5, 6], chest: 7, pelvis: 10, tail: [11, 12, 13, 14], color: skinColor(p, { stripes: bandStripes(0.4, 0.95, 1.2, 0.25), dorsal: 0.75 }) },
    skin,
  );
  const hp = sp.parts.get(sp.head)!;
  const hz = sp.rest.get(sp.head)!.z;
  for (const side of [-1, 1]) {
    addEye(hp, sp.local(sp.head, [side * 0.36, 1.97, -2.18]), 0.11, side, 0x8ecae6, p.body, true);
    hp.add(PG.sphere(8, 6), 0x1a1a1a, sp.local(sp.head, [side * 0.09, 1.76, -2.82]), [0, 0, 0], 0.035);
    // rosy cheeks – friendly
    hp.add(PG.sphere(10, 8), 0xff9aa2, sp.local(sp.head, [side * 0.38, 1.7, -2.3]), [0, 0, 0], [0.04, 0.09, 0.12]);
  }
  addTeeth(hp, -2.8 - hz, -2.15 - hz, 6, (z) => 0.18 + (z + 0.7) * 0.25, () => -0.4, 0.07, true);
  const jaw = new THREE.Group();
  jaw.position.set(...sp.local(sp.head, [0, 1.52, -1.9]));
  const jawLoft = loftBody(
    [
      { z: -0.92, y: -0.06, w: 0.03, h: 0.03 },
      { z: -0.85, y: -0.06, w: 0.18, h: 0.09 },
      { z: -0.55, y: -0.05, w: 0.28, h: 0.13 },
      { z: -0.2, y: -0.02, w: 0.36, h: 0.16 },
      { z: 0.0, y: 0.0, w: 0.38, h: 0.16 },
    ],
    { rings: 18, radial: 14, color: (_t, sa) => mix(p.body, p.belly, smooth(0.3, -0.5, sa)) },
  );
  jaw.add(new THREE.Mesh(jawLoft.geometry, skin));
  sp.head.add(jaw);
  rig.jaw = jaw;
  for (const side of [-1, 1]) rig.arms.push(theropodArm(side, sp.chest, sp.local(sp.chest, [side * 0.55, -0.1, -0.35]), [0.28, 0.26], 0.09, [0.9, -1.4], p, 0, skin, false));
  finishSpine(rig, sp, 0, skin);
  const L: [number, number, number] = [1.0, 1.05, 0.62];
  const rest: [number, number, number] = [0.35, -0.95, 0.7];
  rig.hipHeight = legDrop(L, rest) + 0.1;
  for (const side of [-1, 1]) {
    const leg = theropodLeg(side, [side * 0.46, -0.05, 0.25], L, 0.28, rest, p, false, 0, skin);
    rig.hips.add(leg.hip);
    rig.legs.push(leg);
  }
  rig.height = rig.hipHeight + 2.3;
  rig.length = 6.4;
  rig.stride = 5.2;
  return rig;
}

/** Flying pace-setter for the team mode. */
export function createPtero(): DinoRig {
  const p: DinoPalette = { body: 0x7d5fff, belly: 0xe0d8ff, accent: 0xffc312, detail: 0xff6b81 };
  const rig = newRig('ptero', p);
  const skin = creatureMaterial('skin');
  const keys: BodyKey[] = [
    { z: -1.55, y: 0.12, w: 0.01, h: 0.01 },
    { z: -1.3, y: 0.1, w: 0.035, h: 0.04 },
    { z: -1.0, y: 0.09, w: 0.06, h: 0.07 },
    { z: -0.78, y: 0.1, w: 0.1, h: 0.12 },
    { z: -0.6, y: 0.05, w: 0.07, h: 0.08 },
    { z: -0.38, y: 0.0, w: 0.16, h: 0.15 },
    { z: 0.0, y: 0.0, w: 0.2, h: 0.18 },
    { z: 0.35, y: 0.0, w: 0.13, h: 0.12 },
    { z: 0.6, y: 0.01, w: 0.04, h: 0.04 },
    { z: 0.75, y: 0.02, w: 0.01, h: 0.01 },
  ];
  const sp = buildSpine({ keys, head: 3, neck: [4], chest: 5, pelvis: 6, tail: [7, 8], color: skinColor(p, { beakUntil: 0.25, dorsal: 0.8 }) }, skin);
  const hp = sp.parts.get(sp.head)!;
  for (const side of [-1, 1]) addEye(hp, sp.local(sp.head, [side * 0.08, 0.15, -0.8]), 0.035, side, 0xffc312, p.body, true);
  hp.add(hornGeometry(0.55, 0.06, -0.6), p.detail, sp.local(sp.head, [0, 0.18, -0.7]), [1.35, 0, 0], 1);
  for (const side of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(side * 0.15, 0.05, -0.2);
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.25);
    shape.quadraticCurveTo(1.3, -0.2, 2.6, 0.35);
    shape.quadraticCurveTo(1.4, 0.25, 0.9, 0.55);
    shape.quadraticCurveTo(0.4, 0.45, 0, 0.3);
    shape.lineTo(0, -0.25);
    const g = new THREE.ShapeGeometry(shape, 10).rotateX(-Math.PI / 2);
    if (side < 0) g.scale(-1, 1, 1);
    new Parts().add(g, (q) => mix(p.body, p.accent, smooth(0.5, 2.6, Math.abs(q.x))), [0, 0, 0], [0, 0, 0], 1, 'membrane').build(w);
    rig.hips.add(w);
    rig.wings.push(w);
  }
  finishSpine(rig, sp, 0, skin);
  rig.hipHeight = 4.6;
  rig.height = 5;
  rig.length = 2.3;
  return rig;
}

const BUILDERS: Record<Archetype, (p: DinoPalette) => DinoRig> = { raptor, spino, ankylo, trike };

export function createDino(archetype: Archetype, palette: DinoPalette, accessory: string | null = null): DinoRig {
  const rig = BUILDERS[archetype](palette);
  if (accessory) setAccessory(rig, accessory);
  animateDino(rig, 0, 0, 'idle', 0);
  return rig;
}

export function createDinoFromDef(defId: string, accessory: string | null = null): DinoRig {
  const def = DINO_BY_ID[defId];
  return createDino(def.archetype, def.palette, accessory);
}

// ---------------------------------------------------------------------------
// Accessories (cartoon props on top of the realistic dinos)
// ---------------------------------------------------------------------------

function cone(r: number, h: number, color: number, pos: [number, number, number], seg = 8) {
  return mesh(GEO.cone(seg), mat(color), pos, [r, h, r]);
}

function ell(rx: number, ry: number, rz: number, color: number, pos: [number, number, number]) {
  return mesh(GEO.sphere(1), mat(color), pos, [rx, ry, rz]);
}

export function setAccessory(rig: DinoRig, id: string | null) {
  if (rig.accessory) {
    rig.accessory.parent?.remove(rig.accessory);
    rig.accessory = null;
  }
  if (!id || !ACCESSORY_BY_ID[id]) return;
  const a = ACCESSORY_BY_ID[id];
  let obj: THREE.Object3D;
  switch (id) {
    case 'partyHat': {
      obj = group(cone(0.15, 0.36, a.color, [0, 0, 0]), ell(0.06, 0.06, 0.06, 0xffffff, [0, 0.38, 0]));
      for (let i = 0; i < 3; i++) obj.add(ell(0.025, 0.025, 0.025, 0xffd32a, [Math.cos(i * 2) * 0.09, 0.08 + i * 0.07, Math.sin(i * 2) * 0.09]));
      rig.headTop.add(obj);
      break;
    }
    case 'crown': {
      obj = group(mesh(GEO.cylinder(10), mat(a.color), [0, 0, 0], [0.16, 0.09, 0.16]));
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        obj.add(cone(0.04, 0.12, a.color, [Math.cos(ang) * 0.14, 0.09, Math.sin(ang) * 0.14], 4));
      }
      obj.add(ell(0.035, 0.035, 0.035, 0xff4757, [0, 0.05, -0.16]));
      rig.headTop.add(obj);
      break;
    }
    case 'sunglasses': {
      obj = new THREE.Group();
      for (const x of [-1, 1]) obj.add(mesh(GEO.cylinder(12), mat(a.color), [x * 0.11, 0, 0], [0.08, 0.025, 0.065], [Math.PI / 2, 0, 0]));
      obj.add(mesh(GEO.box(), mat(a.color), [0, 0.015, 0.0], [0.1, 0.02, 0.02]));
      rig.face.add(obj);
      break;
    }
    case 'scarf': {
      obj = group(mesh(GEO.torus(), mat(a.color), [0, 0, 0], [0.24, 0.24, 0.4], [Math.PI / 2 - 0.5, 0, 0]));
      obj.add(mesh(GEO.box(), mat(a.color), [0.12, -0.18, 0.1], [0.1, 0.3, 0.05], [0.2, 0, 0.3]));
      rig.neck.add(obj);
      break;
    }
    case 'flower': {
      obj = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        obj.add(ell(0.05, 0.05, 0.025, a.color, [Math.cos(ang) * 0.06, Math.sin(ang) * 0.06, 0]));
      }
      obj.add(ell(0.038, 0.038, 0.035, 0xffd32a, [0, 0, -0.01]));
      obj.position.set(0.1, 0, 0);
      obj.rotation.y = 1.2;
      rig.headTop.add(obj);
      break;
    }
    default:
      return;
  }
  rig.accessory = obj;
}

// ---------------------------------------------------------------------------
// Procedural animation
// ---------------------------------------------------------------------------

export function animateDino(rig: DinoRig, dt: number, speed: number, mode: DinoAnimMode, time: number) {
  const runLike = mode === 'run' || mode === 'wade' || mode === 'mud' || mode === 'slip' || mode === 'smash';
  const strideMul = mode === 'wade' || mode === 'mud' ? 0.8 : 1;
  const cycle = runLike ? (Math.max(0.5, speed) / rig.stride) * strideMul : mode === 'swim' ? 0.9 : mode === 'celebrate' ? 1.8 : 0.3;
  rig.phase += cycle * Math.PI * 2 * dt;
  const ph = rig.phase;
  for (const m of rig.animatedMaterials) m.color.setHSL((time * 0.12) % 1, 0.8, 0.72);

  if (rig.archetype === 'ptero') {
    const flap = Math.sin(time * 4.2);
    for (const [i, w] of rig.wings.entries()) w.rotation.z = flap * 0.5 * (i === 0 ? -1 : 1);
    rig.hips.position.y = rig.hipHeight + Math.sin(time * 4.2 - 0.6) * 0.18;
    rig.hips.rotation.x = 0.05;
    rig.head.rotation.x = Math.sin(time * 1.3) * 0.08;
    for (const [i, t] of rig.tail.entries()) t.rotation.y = Math.sin(time * 2 - i) * 0.1;
    return;
  }

  const speedK = runLike ? Math.min(1, speed / 6) : 0;
  const legK = (rig.quadruped ? 0.42 : 0.55) * (mode === 'wade' || mode === 'mud' ? 0.75 : 1) * (0.35 + 0.65 * speedK);
  for (const leg of rig.legs) {
    const s = Math.sin(ph + leg.phase);
    const c = Math.cos(ph + leg.phase);
    let [a1, a2, a3] = leg.rest;
    if (mode === 'swim') {
      a1 += 0.7 + 0.35 * s;
      a2 -= 0.45 + 0.25 * Math.max(0, c);
      a3 += 0.4;
    } else if (mode === 'climb') {
      a1 += 0.55 + 0.15 * s;
      a2 -= 0.7;
      a3 += 0.4;
    } else if (mode === 'celebrate') {
      const hop = Math.max(0, Math.sin(time * 6));
      a1 += hop * 0.35;
      a2 -= hop * 0.6;
      a3 += hop * 0.3;
    } else if (runLike) {
      if (!rig.quadruped) {
        a1 += legK * s;
        a2 -= legK * 1.25 * Math.max(0, c);
        a3 += legK * 0.8 * Math.max(0, c);
      } else {
        a1 += legK * s;
        a2 += (leg.front ? -1 : 1) * legK * 0.9 * Math.max(0, c);
      }
    } else {
      a1 += Math.sin(time * 1.1 + leg.phase) * 0.015;
    }
    leg.hip.rotation.x = a1;
    leg.knee.rotation.x = a2;
    if (leg.ankle) leg.ankle.rotation.x = a3;
    leg.foot.rotation.x = -(a1 + a2 + (leg.ankle ? a3 : 0));
  }

  // body
  let y = rig.hipHeight;
  let pitch = 0;
  let roll = 0;
  let headPitch = 0;
  let headYaw = 0;
  let tailAmp = 0.12;
  let tailFreq = 1;
  let jawOpen = 0.04;
  const bob = rig.quadruped ? Math.sin(ph * 2) * 0.03 * speedK : Math.abs(Math.sin(ph)) * 0.08 * speedK;
  y += runLike ? bob - (rig.quadruped ? 0 : 0.04 * speedK) : 0;
  switch (mode) {
    case 'idle':
      tailAmp = 0.1;
      tailFreq = 0.4;
      headYaw = Math.sin(time * 0.55) * 0.35;
      headPitch = Math.sin(time * 0.9) * 0.05;
      jawOpen = Math.max(0, Math.sin(time * 0.7)) * 0.12;
      y += Math.sin(time * 2) * 0.008;
      break;
    case 'swim':
      roll = Math.sin(ph) * 0.06;
      tailAmp = 0.42;
      headPitch = 0.12;
      break;
    case 'wade':
      headPitch = 0.18;
      roll = Math.sin(ph * 0.5) * 0.05;
      break;
    case 'mud':
      roll = Math.sin(ph * 0.5) * 0.1;
      headPitch = 0.08;
      break;
    case 'slip':
      roll = Math.sin(time * 9) * 0.16;
      tailAmp = 0.3;
      break;
    case 'climb':
      y += 0.3 + Math.sin(time * 12) * 0.05;
      pitch = 0.28;
      headPitch = -0.15;
      break;
    case 'smash':
      pitch = -0.14;
      headPitch = -0.35;
      tailAmp = 0.45;
      tailFreq = 2;
      jawOpen = 0.2;
      break;
    case 'celebrate':
      y += Math.max(0, Math.sin(time * 6)) * 0.35;
      headPitch = 0.35;
      jawOpen = 0.45;
      tailAmp = 0.3;
      tailFreq = 2;
      break;
    default:
      headPitch = -0.04;
  }
  rig.hips.position.y = y;
  rig.hips.rotation.x = pitch + (runLike && !rig.quadruped ? -0.04 * speedK : 0);
  rig.hips.rotation.z = roll;
  // spine: tail sways in a travelling wave, neck counters the bob
  rig.tail.forEach((t, i) => {
    t.rotation.y = Math.sin(ph * tailFreq - i * 0.75) * tailAmp * (0.45 + i * 0.28);
    t.rotation.x = (runLike ? Math.cos(ph * 2 - i) * 0.03 * speedK : Math.sin(time * 0.8 - i) * 0.02) + (mode === 'swim' ? 0.02 : 0);
  });
  const counter = runLike ? -Math.cos(ph * 2) * 0.05 * speedK : 0;
  rig.neckBones.forEach((n, i) => {
    n.rotation.x = counter * (i + 1) * 0.5 + headPitch * 0.3;
    n.rotation.y = headYaw * 0.3;
  });
  rig.head.rotation.x = headPitch * 0.7 - counter * 0.5;
  rig.head.rotation.y = headYaw * 0.5;
  if (rig.jaw) rig.jaw.rotation.x = -jawOpen;
  for (const [i, a] of rig.arms.entries()) {
    a.shoulder.rotation.x = a.rest[0] + (runLike ? Math.sin(ph + (i ? Math.PI : 0)) * 0.25 * speedK : mode === 'celebrate' ? -0.8 + Math.sin(time * 10) * 0.3 : 0);
    a.elbow.rotation.x = a.rest[1];
  }
}
