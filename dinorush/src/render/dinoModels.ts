import * as THREE from 'three';
import { ACCESSORY_BY_ID, DINO_BY_ID } from '../config/dinosaurs';
import type { Archetype, DinoPalette } from '../types';
import { GeoMerger, GEO, group, mat, mesh, vertexColorMat } from './util';

/**
 * Procedural low-poly dinosaurs built from Three.js primitives.
 * Models face -Z (direction of travel). Game logic never touches this file –
 * swapping in glTF models later only requires a new rig factory.
 */

export type DinoAnimMode = 'run' | 'swim' | 'wade' | 'mud' | 'slip' | 'climb' | 'smash' | 'idle' | 'celebrate';

export interface LegRig {
  pivot: THREE.Group;
  phase: number;
}

export interface DinoRig {
  archetype: Archetype | 'trex' | 'ptero';
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  jaw: THREE.Object3D | null;
  tail: THREE.Group[];
  legs: LegRig[];
  arms: THREE.Group[];
  wings: THREE.Group[];
  headTop: THREE.Group;
  face: THREE.Group;
  neck: THREE.Group;
  bodyBaseY: number;
  height: number;
  stride: number;
  quadruped: boolean;
  phase: number;
  /** Unique materials that need per-frame updates (rainbow effect). */
  animatedMaterials: THREE.MeshLambertMaterial[];
  effect: NonNullable<DinoPalette['effect']>;
  accessory: THREE.Object3D | null;
}

const OUTLINE = 0x1d1d35;
const WHITE = 0xffffff;

function ell(rx: number, ry: number, rz: number, color: number | THREE.Material, pos: [number, number, number], rot?: [number, number, number], detail = 1) {
  const m = typeof color === 'number' ? mat(color) : color;
  return mesh(GEO.sphere(detail), m, pos, [rx, ry, rz], rot);
}

function eye(r: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(GEO.smoothSphere(), mat(WHITE, { flat: false }), [0, 0, 0], r));
  g.add(mesh(GEO.smoothSphere(), mat(OUTLINE, { flat: false }), [0, 0.0, -r * 0.62], r * 0.55));
  g.add(mesh(GEO.smoothSphere(), mat(WHITE, { flat: false, emissive: 0x888888 }), [r * 0.18, r * 0.25, -r * 0.95], r * 0.18));
  return g;
}

function cone(r: number, h: number, color: number, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], seg = 5) {
  return mesh(GEO.cone(seg), mat(color), pos, [r, h, r], rot);
}

function cyl(r: number, h: number, color: number, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], seg = 7) {
  return mesh(GEO.cylinder(seg), mat(color), pos, [r, h, r], rot);
}

function bodyMaterial(palette: DinoPalette, anim: THREE.MeshLambertMaterial[]): THREE.MeshLambertMaterial {
  if (palette.effect === 'rainbow') {
    const m = new THREE.MeshLambertMaterial({ color: palette.body, flatShading: true });
    anim.push(m);
    return m;
  }
  if (palette.effect === 'gold') return mat(palette.body, { emissive: 0x4a3000 });
  if (palette.effect === 'frost') return mat(palette.body, { emissive: 0x15303a });
  return mat(palette.body);
}

function baseRig(archetype: DinoRig['archetype'], palette: DinoPalette): DinoRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  return {
    archetype,
    root,
    body,
    head: new THREE.Group(),
    jaw: null,
    tail: [],
    legs: [],
    arms: [],
    wings: [],
    headTop: new THREE.Group(),
    face: new THREE.Group(),
    neck: new THREE.Group(),
    bodyBaseY: 1,
    height: 2,
    stride: 2.4,
    quadruped: false,
    phase: Math.random() * 6,
    animatedMaterials: [],
    effect: palette.effect ?? 'none',
    accessory: null,
  };
}

/** Biped leg: thigh + shin + foot. Pivot at hip; leg length = hip height. */
function bipedLeg(len: number, thick: number, color: number, foot: number, claw: number): THREE.Group {
  const g = new THREE.Group();
  g.add(ell(thick, len * 0.34, thick * 1.25, color, [0, -len * 0.2, 0]));
  g.add(cyl(thick * 0.5, len * 0.55, color, [0, -len * 0.92, 0.06]));
  g.add(ell(thick * 0.75, thick * 0.35, thick * 1.2, foot, [0, -len * 0.96, -thick * 0.45]));
  for (const x of [-1, 0, 1]) g.add(cone(thick * 0.14, thick * 0.4, claw, [x * thick * 0.32, -len * 0.97, -thick * 1.4], [-Math.PI / 2, 0, 0], 4));
  return g;
}

function quadLeg(len: number, thick: number, color: number, foot: number): THREE.Group {
  const g = new THREE.Group();
  g.add(ell(thick * 1.1, len * 0.35, thick * 1.1, color, [0, -len * 0.25, 0]));
  g.add(cyl(thick * 0.8, len * 0.6, color, [0, -len, 0]));
  g.add(ell(thick * 0.95, thick * 0.35, thick * 1.05, foot, [0, -len + 0.02, -0.03]));
  return g;
}

function addTail(rig: DinoRig, parent: THREE.Object3D, start: [number, number, number], sizes: [number, number, number][], colors: number[], lift = 0.06) {
  let p = parent;
  let pos = start;
  sizes.forEach(([rx, ry, len], i) => {
    const seg = new THREE.Group();
    seg.position.set(pos[0], pos[1], pos[2]);
    seg.rotation.x = lift;
    seg.add(ell(rx, ry, len * 0.62, colors[Math.min(i, colors.length - 1)], [0, 0, len * 0.45]));
    p.add(seg);
    rig.tail.push(seg);
    p = seg;
    pos = [0, 0, len * 0.85];
  });
  return p;
}

// ---------------------------------------------------------------------------

function raptor(p: DinoPalette): DinoRig {
  const rig = baseRig('raptor', p);
  const bm = bodyMaterial(p, rig.animatedMaterials);
  const hip = 0.95;
  rig.bodyBaseY = hip;
  rig.height = 1.85;
  rig.stride = 2.2;
  const b = rig.body;
  b.position.y = hip;
  b.add(ell(0.42, 0.4, 0.74, bm, [0, 0.12, -0.1], [0.18, 0, 0]));
  b.add(ell(0.33, 0.28, 0.58, p.belly, [0, -0.04, -0.18], [0.18, 0, 0]));
  // back stripes
  for (let i = 0; i < 3; i++) b.add(mesh(GEO.box(), mat(p.accent), [0, 0.5 - i * 0.02, 0.1 - i * 0.28], [0.36, 0.06, 0.1], [0.18, 0, 0]));
  // neck
  b.add(ell(0.2, 0.34, 0.22, bm, [0, 0.42, -0.66], [0.55, 0, 0]));
  rig.neck.position.set(0, 0.45, -0.66);
  b.add(rig.neck);
  // head
  const h = rig.head;
  h.position.set(0, 0.72, -0.84);
  b.add(h);
  h.add(ell(0.3, 0.27, 0.33, bm, [0, 0, 0]));
  h.add(ell(0.21, 0.16, 0.3, bm, [0, -0.05, -0.32]));
  const jaw = ell(0.18, 0.07, 0.26, p.belly, [0, -0.17, -0.24]);
  h.add(jaw);
  rig.jaw = jaw;
  for (const x of [-1, 1]) {
    const e = eye(0.115);
    e.position.set(x * 0.19, 0.1, -0.1);
    e.rotation.y = x * 0.5;
    h.add(e);
    h.add(mesh(GEO.sphere(0), mat(OUTLINE), [x * 0.07, 0.0, -0.6], 0.025));
  }
  for (let i = 0; i < 3; i++) h.add(cone(0.06, 0.18 - i * 0.03, p.detail, [0, 0.24 - i * 0.03, 0.05 + i * 0.12], [0.5, 0, 0], 4));
  rig.headTop.position.set(0, 0.27, 0.02);
  rig.face.position.set(0, 0.1, -0.26);
  h.add(rig.headTop, rig.face);
  // arms
  for (const x of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(x * 0.3, 0.12, -0.52);
    a.add(ell(0.07, 0.07, 0.18, bm, [0, -0.06, -0.1], [0.6, 0, 0]));
    a.add(cone(0.03, 0.08, p.detail, [0, -0.15, -0.22], [-1.6, 0, 0], 4));
    b.add(a);
    rig.arms.push(a);
  }
  addTail(rig, b, [0, 0.16, 0.5], [[0.27, 0.23, 0.7], [0.18, 0.15, 0.65], [0.1, 0.09, 0.6]], [p.body, p.body, p.accent], 0.08);
  for (const [i, x] of [-1, 1].entries()) {
    const leg = new THREE.Group();
    leg.position.set(x * 0.24, hip, 0.05);
    leg.add(bipedLeg(hip, 0.16, p.body, p.accent, p.detail));
    rig.root.add(leg);
    rig.legs.push({ pivot: leg, phase: i * Math.PI });
  }
  return rig;
}

function spino(p: DinoPalette): DinoRig {
  const rig = baseRig('spino', p);
  const bm = bodyMaterial(p, rig.animatedMaterials);
  const hip = 1.05;
  rig.bodyBaseY = hip;
  rig.height = 2.45;
  rig.stride = 2.5;
  const b = rig.body;
  b.position.y = hip;
  b.add(ell(0.5, 0.46, 0.92, bm, [0, 0.1, -0.05], [0.1, 0, 0]));
  b.add(ell(0.4, 0.32, 0.72, p.belly, [0, -0.08, -0.1], [0.1, 0, 0]));
  // sail
  const shape = new THREE.Shape();
  shape.moveTo(-0.85, 0);
  shape.quadraticCurveTo(-0.85, 0.75, -0.45, 1.0);
  shape.quadraticCurveTo(-0.25, 1.18, 0.0, 1.12);
  shape.quadraticCurveTo(0.35, 1.08, 0.6, 0.7);
  shape.quadraticCurveTo(0.85, 0.3, 0.9, 0);
  shape.lineTo(-0.85, 0);
  const sailGeo = new THREE.ShapeGeometry(shape, 6).rotateY(Math.PI / 2);
  const sailMat = mat(p.accent, { side: THREE.DoubleSide });
  const sail = new THREE.Mesh(sailGeo, sailMat);
  sail.position.set(0, 0.42, 0.0);
  b.add(sail);
  for (let i = 0; i < 6; i++) {
    const z = -0.7 + i * 0.3;
    const hgt = Math.max(0.3, 1.1 - Math.abs(z + 0.05) * 0.9);
    b.add(cyl(0.025, hgt, p.detail, [0, 0.42, z], [0, 0, 0], 4));
  }
  rig.neck.position.set(0, 0.42, -0.78);
  b.add(rig.neck);
  b.add(ell(0.24, 0.32, 0.26, bm, [0, 0.38, -0.78], [0.5, 0, 0]));
  const h = rig.head;
  h.position.set(0, 0.66, -1.0);
  b.add(h);
  h.add(ell(0.28, 0.25, 0.34, bm, [0, 0, 0]));
  h.add(ell(0.17, 0.13, 0.55, bm, [0, -0.06, -0.48]));
  const jaw = ell(0.14, 0.06, 0.48, p.belly, [0, -0.17, -0.38]);
  h.add(jaw);
  rig.jaw = jaw;
  h.add(ell(0.08, 0.06, 0.1, p.accent, [0, -0.0, -0.95]));
  for (const x of [-1, 1]) {
    const e = eye(0.11);
    e.position.set(x * 0.17, 0.14, -0.04);
    e.rotation.y = x * 0.45;
    h.add(e);
  }
  h.add(cone(0.08, 0.16, p.accent, [0, 0.25, 0.02], [0.3, 0, 0], 4));
  rig.headTop.position.set(0, 0.26, 0.06);
  rig.face.position.set(0, 0.14, -0.22);
  h.add(rig.headTop, rig.face);
  for (const x of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(x * 0.36, 0.0, -0.6);
    a.add(ell(0.09, 0.09, 0.24, bm, [0, -0.08, -0.12], [0.8, 0, 0]));
    b.add(a);
    rig.arms.push(a);
  }
  addTail(rig, b, [0, 0.12, 0.7], [[0.3, 0.32, 0.75], [0.18, 0.28, 0.7], [0.08, 0.2, 0.65]], [p.body, p.body, p.accent], 0.04);
  for (const [i, x] of [-1, 1].entries()) {
    const leg = new THREE.Group();
    leg.position.set(x * 0.3, hip, 0.1);
    leg.add(bipedLeg(hip, 0.2, p.body, p.accent, p.detail));
    rig.root.add(leg);
    rig.legs.push({ pivot: leg, phase: i * Math.PI });
  }
  return rig;
}

function ankylo(p: DinoPalette): DinoRig {
  const rig = baseRig('ankylo', p);
  const bm = bodyMaterial(p, rig.animatedMaterials);
  const hip = 0.62;
  rig.bodyBaseY = hip;
  rig.height = 1.45;
  rig.stride = 1.5;
  rig.quadruped = true;
  const b = rig.body;
  b.position.y = hip;
  b.add(ell(0.72, 0.4, 0.92, p.belly, [0, 0.02, 0]));
  b.add(ell(0.8, 0.5, 1.0, bm, [0, 0.16, 0], undefined, 1));
  // spikes along the sides
  for (const z of [-0.6, -0.2, 0.2, 0.6]) {
    const rx = 0.8 * Math.sqrt(1 - (z / 1.0) ** 2);
    for (const x of [-1, 1]) b.add(cone(0.09, 0.28, p.detail, [x * (rx - 0.02), 0.12, z], [0, 0, -x * Math.PI / 2.2], 4));
  }
  // top scutes
  for (const z of [-0.5, -0.1, 0.3, 0.65]) {
    for (const x of [-0.28, 0.28]) b.add(ell(0.12, 0.08, 0.12, p.accent, [x, 0.6 - Math.abs(z) * 0.12, z]));
  }
  b.add(ell(0.13, 0.09, 0.13, p.accent, [0, 0.64, -0.3]));
  rig.neck.position.set(0, 0.05, -0.9);
  b.add(rig.neck);
  const h = rig.head;
  h.position.set(0, 0.06, -1.06);
  b.add(h);
  h.add(ell(0.32, 0.25, 0.3, bm, [0, 0, 0]));
  h.add(ell(0.22, 0.16, 0.18, p.belly, [0, -0.08, -0.24]));
  for (const x of [-1, 1]) {
    h.add(cone(0.06, 0.18, p.detail, [x * 0.26, 0.12, 0.12], [0.9, 0, -x * 0.8], 4));
    const e = eye(0.1);
    e.position.set(x * 0.18, 0.1, -0.12);
    e.rotation.y = x * 0.4;
    h.add(e);
  }
  rig.headTop.position.set(0, 0.24, 0.02);
  rig.face.position.set(0, 0.1, -0.24);
  h.add(rig.headTop, rig.face);
  const end = addTail(rig, b, [0, 0.12, 0.9], [[0.24, 0.16, 0.6], [0.14, 0.11, 0.6]], [p.body, p.body], -0.05);
  const club = new THREE.Group();
  club.position.set(0, 0, 0.5);
  club.add(ell(0.28, 0.18, 0.26, p.accent, [0, 0, 0.1]));
  for (const x of [-1, 1]) club.add(ell(0.12, 0.12, 0.12, p.detail, [x * 0.22, 0, 0.1]));
  end.add(club);
  const legPos: [number, number, number][] = [
    [-0.45, hip, -0.5],
    [0.45, hip, -0.5],
    [-0.45, hip, 0.5],
    [0.45, hip, 0.5],
  ];
  const phases = [0, Math.PI, Math.PI, 0];
  legPos.forEach((pos, i) => {
    const leg = new THREE.Group();
    leg.position.set(...pos);
    leg.add(quadLeg(hip, 0.14, p.body, p.accent));
    rig.root.add(leg);
    rig.legs.push({ pivot: leg, phase: phases[i] });
  });
  return rig;
}

function trike(p: DinoPalette): DinoRig {
  const rig = baseRig('trike', p);
  const bm = bodyMaterial(p, rig.animatedMaterials);
  const hip = 0.85;
  rig.bodyBaseY = hip;
  rig.height = 1.9;
  rig.stride = 1.8;
  rig.quadruped = true;
  const b = rig.body;
  b.position.y = hip;
  b.add(ell(0.62, 0.56, 0.95, bm, [0, 0.12, 0.05]));
  b.add(ell(0.5, 0.4, 0.8, p.belly, [0, -0.08, 0.0]));
  for (let i = 0; i < 4; i++) b.add(ell(0.16, 0.06, 0.16, p.accent, [0, 0.66 - i * 0.03, -0.3 + i * 0.3]));
  rig.neck.position.set(0, 0.2, -0.82);
  b.add(rig.neck);
  const h = rig.head;
  h.position.set(0, 0.28, -1.05);
  b.add(h);
  h.add(ell(0.38, 0.34, 0.4, bm, [0, 0, 0]));
  h.add(ell(0.2, 0.2, 0.26, p.detail, [0, -0.12, -0.38]));
  h.add(cone(0.07, 0.2, p.detail, [0, 0.08, -0.46], [-1.1, 0, 0], 5));
  for (const x of [-1, 1]) {
    h.add(cone(0.075, 0.72, p.detail, [x * 0.18, 0.24, -0.16], [-1.15, 0, x * 0.12], 6));
    const e = eye(0.11);
    e.position.set(x * 0.25, 0.08, -0.18);
    e.rotation.y = x * 0.5;
    h.add(e);
  }
  // frill
  const frill = mesh(GEO.cylinder(14), mat(p.accent), [0, 0.32, 0.2], [0.62, 0.08, 0.55], [Math.PI / 2 - 0.45, 0, 0]);
  h.add(frill);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (i / 8);
    const x = Math.cos(a) * 0.62;
    const y = Math.sin(a) * 0.55;
    h.add(ell(0.07, 0.07, 0.07, p.detail, [x, 0.32 + y * 0.9, 0.2 + y * 0.42], undefined, 0));
  }
  rig.headTop.position.set(0, 0.36, -0.02);
  rig.face.position.set(0, 0.08, -0.36);
  h.add(rig.headTop, rig.face);
  addTail(rig, b, [0, 0.05, 0.9], [[0.22, 0.2, 0.5], [0.12, 0.11, 0.45]], [p.body, p.body], -0.15);
  const legPos: [number, number, number][] = [
    [-0.4, hip, -0.5],
    [0.4, hip, -0.5],
    [-0.4, hip, 0.55],
    [0.4, hip, 0.55],
  ];
  const phases = [0, Math.PI, Math.PI, 0];
  legPos.forEach((pos, i) => {
    const leg = new THREE.Group();
    leg.position.set(...pos);
    leg.add(quadLeg(hip, 0.17, p.body, p.accent));
    rig.root.add(leg);
    rig.legs.push({ pivot: leg, phase: phases[i] });
  });
  return rig;
}

/** Big, friendly T-Rex for the chase mode. */
export function createTrex(): DinoRig {
  const p: DinoPalette = { body: 0xff7a6b, belly: 0xffe2c2, accent: 0xd9473a, detail: 0xfff7e0 };
  const rig = baseRig('trex', p);
  const hip = 2.0;
  rig.bodyBaseY = hip;
  rig.height = 4.6;
  rig.stride = 4.2;
  const b = rig.body;
  b.position.y = hip;
  b.add(ell(0.95, 0.9, 1.4, p.body, [0, 0.3, 0], [0.25, 0, 0]));
  b.add(ell(0.78, 0.7, 1.1, p.belly, [0, 0.05, -0.15], [0.25, 0, 0]));
  for (let i = 0; i < 4; i++) b.add(ell(0.18, 0.1, 0.14, p.accent, [0, 1.12 - i * 0.12, -0.4 + i * 0.4]));
  const h = rig.head;
  h.position.set(0, 1.5, -1.45);
  b.add(h);
  h.add(ell(0.75, 0.62, 0.85, p.body, [0, 0, 0]));
  const jaw = ell(0.62, 0.22, 0.7, p.belly, [0, -0.5, -0.2]);
  h.add(jaw);
  rig.jaw = jaw;
  // friendly smile – rounded teeth
  for (let i = 0; i < 6; i++) h.add(mesh(GEO.sphere(0), mat(WHITE), [-0.4 + i * 0.16, -0.28, -0.72 + Math.abs(i - 2.5) * 0.06], [0.06, 0.08, 0.06]));
  for (const x of [-1, 1]) {
    const e = eye(0.26);
    e.position.set(x * 0.42, 0.25, -0.35);
    e.rotation.y = x * 0.35;
    h.add(e);
    h.add(ell(0.18, 0.06, 0.06, p.accent, [x * 0.4, 0.55, -0.4], [0, 0, x * 0.3]));
  }
  for (const x of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(x * 0.7, 0.2, -0.95);
    a.add(ell(0.12, 0.12, 0.3, p.body, [0, -0.1, -0.15], [0.8, 0, 0]));
    b.add(a);
    rig.arms.push(a);
  }
  addTail(rig, b, [0, 0.35, 1.1], [[0.6, 0.55, 1.4], [0.38, 0.36, 1.3], [0.18, 0.18, 1.2]], [p.body, p.body, p.accent], 0.05);
  for (const [i, x] of [-1, 1].entries()) {
    const leg = new THREE.Group();
    leg.position.set(x * 0.55, hip, 0.1);
    leg.add(bipedLeg(hip, 0.36, p.body, p.accent, p.detail));
    rig.root.add(leg);
    rig.legs.push({ pivot: leg, phase: i * Math.PI });
  }
  bakeRig(rig);
  return rig;
}

/** Flying pace-setter for team mode. */
export function createPtero(): DinoRig {
  const p: DinoPalette = { body: 0x7d5fff, belly: 0xe0d8ff, accent: 0xffc312, detail: 0xff6b81 };
  const rig = baseRig('ptero', p);
  rig.bodyBaseY = 4.5;
  rig.height = 5.2;
  const b = rig.body;
  b.position.y = rig.bodyBaseY;
  b.add(ell(0.35, 0.3, 0.7, p.body, [0, 0, 0]));
  b.add(ell(0.25, 0.2, 0.5, p.belly, [0, -0.1, -0.05]));
  const h = rig.head;
  h.position.set(0, 0.25, -0.75);
  b.add(h);
  h.add(ell(0.22, 0.2, 0.26, p.body, [0, 0, 0]));
  h.add(cone(0.1, 0.8, p.accent, [0, -0.05, -0.15], [-Math.PI / 2, 0, 0], 5));
  h.add(cone(0.07, 0.6, p.detail, [0, 0.12, 0.1], [1.9, 0, 0], 4));
  for (const x of [-1, 1]) {
    const e = eye(0.08);
    e.position.set(x * 0.14, 0.08, -0.06);
    e.rotation.y = x * 0.5;
    h.add(e);
  }
  for (const x of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(x * 0.25, 0.1, -0.05);
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.35);
    shape.lineTo(x * 2.2, 0.1);
    shape.lineTo(x * 0.6, 0.55);
    shape.lineTo(0, 0.35);
    shape.lineTo(0, -0.35);
    const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    w.add(new THREE.Mesh(geo, mat(p.body, { side: THREE.DoubleSide })));
    b.add(w);
    rig.wings.push(w);
  }
  addTail(rig, b, [0, 0, 0.6], [[0.08, 0.08, 0.5]], [p.body]);
  bakeRig(rig);
  return rig;
}

const BUILDERS: Record<Archetype, (p: DinoPalette) => DinoRig> = { raptor, spino, ankylo, trike };

/**
 * Merge every static mesh into one vertex-coloured mesh per animated joint
 * (body, head, each leg, tail segment…). Cuts a dino from ~50 draw calls
 * to ~12 without changing how it animates.
 */
export function bakeRig(rig: DinoRig) {
  const joints = new Set<THREE.Object3D>([rig.root, rig.body, rig.head, rig.headTop, rig.face, rig.neck, ...rig.tail, ...rig.legs.map((l) => l.pivot), ...rig.arms, ...rig.wings]);
  if (rig.jaw) joints.add(rig.jaw);
  const skip = new Set<THREE.Material>(rig.animatedMaterials);
  const emissive = rig.effect === 'gold' ? 0x4a3000 : rig.effect === 'frost' ? 0x15303a : 0;
  for (const joint of joints) {
    if (joint === rig.jaw) continue;
    const merger = new GeoMerger();
    const removed: THREE.Object3D[] = [];
    const visit = (obj: THREE.Object3D, parentMatrix: THREE.Matrix4) => {
      for (const child of [...obj.children]) {
        if (joints.has(child)) continue;
        child.updateMatrix();
        const m = parentMatrix.clone().multiply(child.matrix);
        const meshChild = child as THREE.Mesh;
        if (meshChild.isMesh) {
          const mt = meshChild.material as THREE.MeshLambertMaterial;
          if (skip.has(mt) || mt.side !== THREE.FrontSide || mt.transparent || meshChild.children.length) continue;
          merger.addMatrix(meshChild.geometry, mt.color, m);
          removed.push(child);
        } else {
          visit(child, m);
        }
      }
    };
    visit(joint, new THREE.Matrix4());
    if (merger.empty) continue;
    for (const r of removed) {
      const parent = r.parent;
      parent?.remove(r);
      if (!(r as THREE.Mesh).geometry?.userData.shared) (r as THREE.Mesh).geometry?.dispose();
    }
    // drop now-empty helper groups (collect first – never mutate while traversing)
    for (let pass = 0; pass < 3; pass++) {
      const empty: THREE.Object3D[] = [];
      joint.traverse((o) => {
        if (o !== joint && !joints.has(o) && o.children.length === 0 && !(o as THREE.Mesh).isMesh) empty.push(o);
      });
      if (!empty.length) break;
      for (const o of empty) o.parent?.remove(o);
    }
    const baked = merger.build(vertexColorMat(emissive));
    if (baked) joint.add(baked);
  }
}

export function createDino(archetype: Archetype, palette: DinoPalette, accessory: string | null = null): DinoRig {
  const rig = BUILDERS[archetype](palette);
  bakeRig(rig);
  if (accessory) setAccessory(rig, accessory);
  return rig;
}

export function createDinoFromDef(defId: string, accessory: string | null = null): DinoRig {
  const def = DINO_BY_ID[defId];
  return createDino(def.archetype, def.palette, accessory);
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
      obj = group(cone(0.17, 0.42, a.color, [0, 0, 0], [0, 0, 0], 8), ell(0.07, 0.07, 0.07, 0xffffff, [0, 0.44, 0]));
      for (let i = 0; i < 3; i++) obj.add(ell(0.03, 0.03, 0.03, 0xffd32a, [Math.cos(i * 2) * 0.1, 0.1 + i * 0.08, Math.sin(i * 2) * 0.1]));
      rig.headTop.add(obj);
      break;
    }
    case 'crown': {
      obj = group(cyl(0.18, 0.1, a.color, [0, 0, 0], [0, 0, 0], 10));
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        obj.add(cone(0.045, 0.14, a.color, [Math.cos(ang) * 0.16, 0.1, Math.sin(ang) * 0.16], [0, 0, 0], 4));
      }
      obj.add(ell(0.04, 0.04, 0.04, 0xff4757, [0, 0.06, -0.18]));
      rig.headTop.add(obj);
      break;
    }
    case 'sunglasses': {
      obj = new THREE.Group();
      for (const x of [-1, 1]) obj.add(mesh(GEO.cylinder(12), mat(a.color), [x * 0.13, 0, -0.02], [0.1, 0.03, 0.08], [Math.PI / 2, 0, 0]));
      obj.add(mesh(GEO.box(), mat(a.color), [0, 0.02, -0.03], [0.12, 0.025, 0.02]));
      rig.face.add(obj);
      break;
    }
    case 'scarf': {
      obj = group(mesh(GEO.torus(), mat(a.color), [0, 0, 0], [0.3, 0.3, 0.45], [Math.PI / 2 - 0.4, 0, 0]));
      obj.add(mesh(GEO.box(), mat(a.color), [0.15, -0.2, 0.18], [0.12, 0.35, 0.06], [0.2, 0, 0.3]));
      rig.neck.add(obj);
      break;
    }
    case 'flower': {
      obj = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        obj.add(ell(0.06, 0.06, 0.03, a.color, [Math.cos(ang) * 0.07, Math.sin(ang) * 0.07, 0]));
      }
      obj.add(ell(0.045, 0.045, 0.04, 0xffd32a, [0, 0, -0.01]));
      obj.position.set(0.14, 0.02, 0);
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
// Animation
// ---------------------------------------------------------------------------

export function animateDino(rig: DinoRig, dt: number, speed: number, mode: DinoAnimMode, time: number) {
  const runLike = mode === 'run' || mode === 'wade' || mode === 'mud' || mode === 'slip' || mode === 'smash';
  let strideMul = 1;
  if (mode === 'wade' || mode === 'mud') strideMul = 0.75;
  const cycle = runLike ? (speed / rig.stride) * strideMul : mode === 'swim' ? 1.3 : mode === 'celebrate' ? 2.2 : 0.4;
  rig.phase += cycle * Math.PI * 2 * dt;
  const ph = rig.phase;
  const b = rig.body;

  // wings (ptero)
  for (const [i, w] of rig.wings.entries()) w.rotation.z = Math.sin(time * 5) * 0.45 * (i === 0 ? -1 : 1);
  for (const m of rig.animatedMaterials) m.color.setHSL((time * 0.12) % 1, 0.75, 0.62);

  if (rig.archetype === 'ptero') {
    b.position.y = rig.bodyBaseY + Math.sin(time * 2) * 0.25;
    return;
  }

  let legAmp = rig.quadruped ? 0.5 : 0.75;
  let bob = rig.quadruped ? 0.04 : 0.09;
  let bodyY = rig.bodyBaseY;
  let pitch = 0;
  let roll = 0;
  let tailAmp = 0.16;
  let tailFreq = 1;
  let headPitch = 0;

  switch (mode) {
    case 'idle':
      legAmp = 0;
      bob = 0;
      tailAmp = 0.12;
      headPitch = Math.sin(time * 1.3) * 0.06;
      b.scale.y = 1 + Math.sin(time * 2.2) * 0.02;
      rig.head.rotation.y = Math.sin(time * 0.6) * 0.35;
      break;
    case 'swim':
      legAmp = 0.25;
      bob = 0;
      bodyY = rig.bodyBaseY + Math.sin(time * 3) * 0.04;
      roll = Math.sin(ph) * 0.08;
      tailAmp = 0.45;
      tailFreq = 1;
      headPitch = -0.15;
      break;
    case 'wade':
      legAmp = 0.55;
      headPitch = -0.25;
      roll = Math.sin(ph * 0.5) * 0.06;
      break;
    case 'mud':
      legAmp = 0.45;
      roll = Math.sin(ph * 0.5) * 0.12;
      bob *= 0.6;
      break;
    case 'slip':
      roll = Math.sin(time * 9) * 0.18;
      legAmp = 0.95;
      break;
    case 'climb':
      legAmp = 0.2;
      bob = 0;
      bodyY = rig.bodyBaseY + 0.45 + Math.sin(time * 14) * 0.08;
      pitch = -0.35;
      break;
    case 'smash':
      pitch = 0.25;
      headPitch = 0.3;
      tailAmp = 0.5;
      tailFreq = 2;
      break;
    case 'celebrate':
      legAmp = 0.3;
      bob = 0;
      bodyY = rig.bodyBaseY + Math.abs(Math.sin(time * 6)) * 0.45;
      headPitch = -0.2;
      for (const a of rig.arms) a.rotation.x = -1.2 + Math.sin(time * 12) * 0.3;
      break;
    default:
      break;
  }
  if (mode !== 'idle') {
    b.scale.y = 1;
    rig.head.rotation.y *= 0.9;
  }

  for (const leg of rig.legs) {
    if (mode === 'swim') leg.pivot.rotation.x = 0.9 + Math.sin(ph * 1.5 + leg.phase) * legAmp;
    else leg.pivot.rotation.x = Math.sin(ph + leg.phase) * legAmp;
    leg.pivot.position.y = rig.bodyBaseY + (bodyY - rig.bodyBaseY) * 0.6;
  }
  const bounce = rig.quadruped ? Math.sin(ph * 2) * bob : Math.abs(Math.sin(ph)) * bob;
  b.position.y = bodyY + bounce;
  b.rotation.x = pitch + (runLike ? Math.sin(ph * 2) * 0.02 : 0);
  b.rotation.z = roll;
  rig.head.rotation.x = headPitch + (runLike ? Math.sin(ph * 2 + 0.5) * 0.06 : 0);
  if (rig.jaw) rig.jaw.rotation.x = mode === 'celebrate' ? 0.35 : mode === 'idle' ? Math.max(0, Math.sin(time * 0.8)) * 0.15 : 0.05;
  rig.tail.forEach((t, i) => {
    t.rotation.y = Math.sin(ph * tailFreq - i * 0.7) * tailAmp * (1 + i * 0.3) * (mode === 'idle' ? 0.6 : 1);
  });
  if (mode !== 'celebrate') {
    for (const [i, a] of rig.arms.entries()) a.rotation.x = Math.sin(ph + (i ? Math.PI : 0)) * 0.35;
  }
}
