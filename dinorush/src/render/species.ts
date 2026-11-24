import * as THREE from 'three';
import type { DinoPalette } from '../types';
import { loftBody, mix, Parts, PG, plateGeometry, sheetGeometry, shade, smooth, type BodyKey } from './creature';
import {
  addEye,
  addTeeth,
  bandStripes,
  bodyEmissive,
  buildSpine,
  finishSpine,
  IVORY,
  keyExtents,
  legDrop,
  makeSkinMaterial,
  newRig,
  orient,
  quadLeg,
  skinColor,
  theropodArm,
  theropodLeg,
  type DinoRig,
  type Spine,
} from './dinoKit';

/**
 * The newer species. Every builder returns the same rig structure as the
 * classic four, so animation, racing and previews work unchanged.
 */

function lowerJaw(sp: Spine, p: DinoPalette, skin: THREE.Material, at: [number, number, number], keys: BodyKey[], teeth?: { from: number; to: number; count: number; len: number }) {
  const jaw = new THREE.Group();
  jaw.position.set(...sp.local(sp.head, at));
  const loft = loftBody(keys, { rings: 18, radial: 12, color: (_t, sa) => mix(p.body, p.belly, smooth(0.2, -0.6, sa)) });
  jaw.add(new THREE.Mesh(loft.geometry, skin));
  if (teeth) {
    const jp = new Parts();
    addTeeth(jp, teeth.from, teeth.to, teeth.count, (z) => keys[keys.length - 1].w * 0.55 + (z - teeth.from) * 0.05, () => 0.012, teeth.len, false);
    jp.build(jaw, 0, skin);
  }
  sp.head.add(jaw);
  return jaw;
}

// ---------------------------------------------------------------------------
// Gallimimus – long-legged "ostrich dinosaur" (RYCHLÍK)
// ---------------------------------------------------------------------------

function gallimimus(p: DinoPalette): DinoRig {
  const rig = newRig('raptor', p);
  const skin = makeSkinMaterial(p, rig.animatedMaterials);
  const em = bodyEmissive(p);
  const keys: BodyKey[] = [
    { z: -2.06, y: 1.2, w: 0.008, h: 0.008 },
    { z: -2.02, y: 1.21, w: 0.028, h: 0.024 },
    { z: -1.94, y: 1.23, w: 0.048, h: 0.042 },
    { z: -1.83, y: 1.27, w: 0.072, h: 0.068 },
    { z: -1.72, y: 1.29, w: 0.08, h: 0.078 },
    { z: -1.62, y: 1.24, w: 0.05, h: 0.055 },
    { z: -1.48, y: 1.08, w: 0.054, h: 0.06 },
    { z: -1.28, y: 0.84, w: 0.066, h: 0.072 },
    { z: -1.04, y: 0.6, w: 0.095, h: 0.105 },
    { z: -0.76, y: 0.38, w: 0.16, h: 0.18 },
    { z: -0.43, y: 0.22, w: 0.24, h: 0.27 },
    { z: -0.1, y: 0.16, w: 0.26, h: 0.29 },
    { z: 0.2, y: 0.16, w: 0.23, h: 0.25 },
    { z: 0.5, y: 0.19, w: 0.14, h: 0.15 },
    { z: 0.88, y: 0.22, w: 0.085, h: 0.085 },
    { z: 1.28, y: 0.23, w: 0.052, h: 0.052 },
    { z: 1.66, y: 0.24, w: 0.03, h: 0.03 },
    { z: 1.98, y: 0.25, w: 0.008, h: 0.008 },
  ];
  const sp = buildSpine(
    { keys, head: 4, neck: [6, 8], chest: 10, pelvis: 12, tail: [13, 14, 15, 16], color: skinColor(p, { beakUntil: 0.035, stripes: bandStripes(0.45, 0.95, 4, 0.25), dorsal: 0.72 }) },
    skin,
  );
  const hp = sp.parts.get(sp.head)!;
  for (const side of [-1, 1]) addEye(hp, sp.local(sp.head, [side * 0.066, 1.33, -1.8]), 0.042, side, 0x2d98da, p.body, true);
  // a little feather crest and a fluffy feather mane
  for (let i = 0; i < 3; i++) hp.add(PG.sphere(8, 6), i % 2 ? p.detail : p.accent, sp.local(sp.head, [0, 1.37 - i * 0.01, -1.73 + i * 0.05]), [-1.1, 0, 0], [0.018, 0.07, 0.022]);
  const np = sp.parts.get(sp.neck[0])!;
  for (let i = 0; i < 6; i++) np.add(PG.sphere(8, 6), mix(p.accent, p.detail, i / 6), sp.local(sp.neck[0], [0, 1.12 - i * 0.07, -1.5 + i * 0.07]), [-0.6, 0, 0], [0.02, 0.07, 0.025]);
  rig.jaw = lowerJaw(sp, p, skin, [0, 1.23, -1.74], [
    { z: -0.3, y: -0.01, w: 0.008, h: 0.008 },
    { z: -0.26, y: -0.012, w: 0.024, h: 0.016 },
    { z: -0.14, y: -0.01, w: 0.042, h: 0.022 },
    { z: 0.0, y: 0.0, w: 0.05, h: 0.026 },
  ]);
  rig.headTop.position.set(...sp.local(sp.head, [0, 1.39, -1.76]));
  rig.face.position.set(...sp.local(sp.head, [0, 1.33, -1.84]));
  rig.face.scale.setScalar(0.62);
  rig.headTop.scale.setScalar(0.62);
  for (const side of [-1, 1]) rig.arms.push(theropodArm(side, sp.chest, sp.local(sp.chest, [side * 0.15, 0.02, -0.45]), [0.24, 0.24], 0.04, [0.6, -1.2], p, em, skin, true));
  finishSpine(rig, sp, em, skin);
  const L: [number, number, number] = [0.5, 0.58, 0.46];
  const rest: [number, number, number] = [0.42, -1.05, 0.72];
  rig.hipHeight = legDrop(L, rest) + 0.04;
  for (const side of [-1, 1]) {
    const leg = theropodLeg(side, [side * 0.19, -0.03, 0.14], L, 0.115, rest, p, false, em, skin);
    rig.hips.add(leg.hip);
    rig.legs.push(leg);
  }
  const ext = keyExtents(keys, rig.hipHeight);
  rig.height = ext.top;
  rig.length = ext.length;
  rig.stride = 3.4;
  return rig;
}

// ---------------------------------------------------------------------------
// Dilophosaurus – two thin head crests (RYCHLÍK)
// ---------------------------------------------------------------------------

function dilophosaurus(p: DinoPalette): DinoRig {
  const rig = newRig('raptor', p);
  const skin = makeSkinMaterial(p, rig.animatedMaterials);
  const em = bodyEmissive(p);
  const keys: BodyKey[] = [
    { z: -1.98, y: 1.0, w: 0.014, h: 0.014 },
    { z: -1.92, y: 1.0, w: 0.058, h: 0.06 },
    { z: -1.79, y: 1.02, w: 0.086, h: 0.09 },
    { z: -1.64, y: 1.05, w: 0.115, h: 0.122 },
    { z: -1.5, y: 1.08, w: 0.14, h: 0.145 },
    { z: -1.37, y: 1.04, w: 0.125, h: 0.135 },
    { z: -1.21, y: 0.88, w: 0.1, h: 0.115 },
    { z: -1.0, y: 0.66, w: 0.13, h: 0.15 },
    { z: -0.76, y: 0.42, w: 0.22, h: 0.25 },
    { z: -0.45, y: 0.25, w: 0.31, h: 0.34 },
    { z: -0.1, y: 0.19, w: 0.34, h: 0.36 },
    { z: 0.24, y: 0.19, w: 0.3, h: 0.32 },
    { z: 0.6, y: 0.22, w: 0.19, h: 0.2 },
    { z: 1.02, y: 0.25, w: 0.115, h: 0.115 },
    { z: 1.45, y: 0.27, w: 0.068, h: 0.068 },
    { z: 1.85, y: 0.28, w: 0.034, h: 0.034 },
    { z: 2.2, y: 0.29, w: 0.008, h: 0.008 },
  ];
  const sp = buildSpine(
    { keys, head: 4, neck: [6, 7], chest: 9, pelvis: 11, tail: [12, 13, 14, 15], color: skinColor(p, { stripes: bandStripes(0.32, 0.96, 2.6, 0.3), dorsal: 0.66 }) },
    skin,
  );
  const hp = sp.parts.get(sp.head)!;
  const hz = sp.rest.get(sp.head)!.z;
  for (const side of [-1, 1]) {
    addEye(hp, sp.local(sp.head, [side * 0.122, 1.15, -1.55]), 0.045, side, 0xf9ca24, p.body);
    hp.add(PG.sphere(8, 6), 0x1a1a1a, sp.local(sp.head, [side * 0.034, 1.04, -1.93]), [0, 0, 0], 0.014);
  }
  addTeeth(hp, -1.92 - hz, -1.58 - hz, 8, (z) => 0.06 + (z + 0.42) * 0.12, () => -0.105, 0.034, true);
  // the famous double crest: two thin arched sheets on top of the snout
  const crestH = (x: number) => Math.max(0, Math.sin(((x + 0.26) / 0.5) * Math.PI)) * 0.2;
  const crestColor = (q: THREE.Vector3) => {
    const k = q.y / 0.2;
    let c = mix(p.accent, p.detail, smooth(0.35, 0.9, k));
    if (Math.abs(((q.x * 22) % 1) + 1) % 1 > 0.82) c = shade(c, 0.8);
    return c;
  };
  for (const side of [-1, 1]) hp.add(sheetGeometry(-0.26, 0.24, crestH, 18, 6, 0.004), crestColor, sp.local(sp.head, [side * 0.045, 1.12, -1.66]), [0, Math.PI / 2, side * 0.12], 1, 'membrane');
  rig.jaw = lowerJaw(
    sp,
    p,
    skin,
    [0, 0.97, -1.4],
    [
      { z: -0.55, y: -0.02, w: 0.014, h: 0.012 },
      { z: -0.49, y: -0.022, w: 0.046, h: 0.03 },
      { z: -0.32, y: -0.018, w: 0.07, h: 0.04 },
      { z: -0.14, y: -0.008, w: 0.1, h: 0.05 },
      { z: 0.0, y: 0.0, w: 0.11, h: 0.05 },
    ],
    { from: -0.48, to: -0.14, count: 6, len: 0.028 },
  );
  rig.headTop.position.set(...sp.local(sp.head, [0, 1.25, -1.48]));
  rig.face.position.set(...sp.local(sp.head, [0, 1.15, -1.6]));
  rig.face.scale.setScalar(0.95);
  rig.headTop.scale.setScalar(0.9);
  for (const side of [-1, 1]) rig.arms.push(theropodArm(side, sp.chest, sp.local(sp.chest, [side * 0.22, 0.05, -0.55]), [0.27, 0.25], 0.06, [0.7, -1.35], p, em, skin, false));
  finishSpine(rig, sp, em, skin);
  const L: [number, number, number] = [0.5, 0.52, 0.34];
  const rest: [number, number, number] = [0.4, -1.0, 0.72];
  rig.hipHeight = legDrop(L, rest) + 0.05;
  for (const side of [-1, 1]) {
    const leg = theropodLeg(side, [side * 0.26, -0.03, 0.18], L, 0.155, rest, p, false, em, skin);
    rig.hips.add(leg.hip);
    rig.legs.push(leg);
  }
  const ext = keyExtents(keys, rig.hipHeight);
  rig.height = ext.top + 0.15;
  rig.length = ext.length;
  rig.stride = 3.0;
  return rig;
}

// ---------------------------------------------------------------------------
// Stegosaurus – plates and a spiky tail (BOURÁK)
// ---------------------------------------------------------------------------

function stego(p: DinoPalette): DinoRig {
  const rig = newRig('ankylo', p);
  rig.quadruped = true;
  const skin = makeSkinMaterial(p, rig.animatedMaterials);
  const em = bodyEmissive(p);
  const keys: BodyKey[] = [
    { z: -2.0, y: 0.08, w: 0.018, h: 0.018 },
    { z: -1.93, y: 0.09, w: 0.06, h: 0.05 },
    { z: -1.81, y: 0.12, w: 0.09, h: 0.08 },
    { z: -1.67, y: 0.15, w: 0.115, h: 0.1 },
    { z: -1.53, y: 0.16, w: 0.105, h: 0.1 },
    { z: -1.34, y: 0.21, w: 0.15, h: 0.16 },
    { z: -1.06, y: 0.33, w: 0.3, h: 0.3 },
    { z: -0.7, y: 0.5, w: 0.45, h: 0.45 },
    { z: -0.25, y: 0.66, w: 0.54, h: 0.55 },
    { z: 0.2, y: 0.68, w: 0.52, h: 0.54 },
    { z: 0.6, y: 0.56, w: 0.34, h: 0.36 },
    { z: 1.0, y: 0.44, w: 0.2, h: 0.22 },
    { z: 1.4, y: 0.36, w: 0.12, h: 0.13 },
    { z: 1.78, y: 0.32, w: 0.06, h: 0.06 },
    { z: 2.06, y: 0.3, w: 0.014, h: 0.014 },
  ];
  const sp = buildSpine(
    { keys, head: 3, neck: [5], chest: 7, pelvis: 9, tail: [10, 11, 12, 13], squareness: 2.2, bellyFlat: 0.8, color: skinColor(p, { beakUntil: 0.05, spots: 0.18, dorsal: 0.74 }) },
    skin,
  );
  const hp = sp.parts.get(sp.head)!;
  for (const side of [-1, 1]) {
    addEye(hp, sp.local(sp.head, [side * 0.1, 0.2, -1.72]), 0.03, side, 0xe1b12c, p.body);
    hp.add(PG.sphere(8, 6), 0x1a1a1a, sp.local(sp.head, [side * 0.03, 0.11, -1.97]), [0, 0, 0], 0.012);
  }
  // two staggered rows of plates – the largest over the hips
  const plate = new THREE.Shape();
  plate.moveTo(-0.5, 0);
  plate.quadraticCurveTo(-0.45, 0.55, 0, 1);
  plate.quadraticCurveTo(0.45, 0.55, 0.5, 0);
  plate.lineTo(-0.5, 0);
  const plateGeo = plateGeometry(plate, 0.12, 0.04);
  const plateColor = (q: THREE.Vector3) => mix(p.accent, p.detail, smooth(0.3, 1, q.y));
  const loft = sp.loft;
  const N = 11;
  for (let i = 0; i < N; i++) {
    const t = 0.24 + (i / (N - 1)) * 0.5;
    const size = 0.16 + Math.sin((i / (N - 1)) * Math.PI) * 0.3;
    const side = i % 2 ? 1 : -1;
    const bone = t < 0.42 ? sp.chest : t < 0.6 ? sp.pelvis : sp.tail[Math.min(sp.tail.length - 1, Math.floor((t - 0.6) / 0.08))];
    const { p: top } = loft.surface(t, Math.PI / 2 + side * 0.12);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...sp.local(bone, top.clone().add(new THREE.Vector3(0, -size * 0.12, 0)))),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, -side * 0.14, 'YXZ')),
      new THREE.Vector3(size * 1.05, size, 0.3),
    );
    sp.parts.get(bone)!.addMatrix(plateGeo, plateColor, m);
  }
  // thagomizer: four tail spikes
  const tip = sp.tail[sp.tail.length - 1];
  for (const side of [-1, 1]) {
    for (const k of [0, 1]) {
      const at = loft.surface(0.86 + k * 0.05, side > 0 ? 0.5 : Math.PI - 0.5);
      const dir = new THREE.Vector3(side * 0.8, 0.55, 0.35 + k * 0.2).normalize();
      sp.parts.get(tip)!.addMatrix(PG.cone(7), (q) => mix(IVORY, shade(IVORY, 0.6), smooth(0.8, 0, q.y)), orient(dir, new THREE.Vector3(...sp.local(tip, at.p)), new THREE.Vector3(0.045, 0.36 - k * 0.06, 0.045)));
    }
  }
  rig.headTop.position.set(...sp.local(sp.head, [0, 0.26, -1.66]));
  rig.face.position.set(...sp.local(sp.head, [0, 0.2, -1.82]));
  rig.face.scale.setScalar(0.6);
  rig.headTop.scale.setScalar(0.6);
  finishSpine(rig, sp, em, skin);
  const hindL: [number, number] = [0.4, 0.36];
  const hindRest: [number, number] = [-0.22, 0.38];
  const frontL: [number, number] = [0.28, 0.26];
  const frontRest: [number, number] = [0.18, -0.28];
  const hindDrop = legDrop(hindL, hindRest) + 0.07;
  const frontDrop = legDrop(frontL, frontRest) + 0.07;
  rig.hipHeight = hindDrop;
  for (const side of [-1, 1]) {
    // the body sits 0.2 higher (see below): the hip joints sit lower so the feet reach the ground
    const hind = quadLeg(side, [side * 0.4, -0.26, 0.26], hindL, 0.165, hindRest, p, false, em, skin, 3);
    hind.phase = side > 0 ? 0 : Math.PI;
    const front = quadLeg(side, [side * 0.38, frontDrop - hindDrop - 0.26, -0.82], frontL, 0.13, frontRest, p, true, em, skin, 5);
    front.phase = side > 0 ? Math.PI : 0;
    rig.hips.add(hind.hip, front.hip);
    rig.legs.push(hind, front);
  }
  rig.hipHeight += 0.2;
  const ext = keyExtents(keys, rig.hipHeight);
  rig.height = ext.top + 0.42;
  rig.length = ext.length;
  rig.stride = 2.0;
  return rig;
}

// ---------------------------------------------------------------------------
// Pachycephalosaurus – the dome-headed head-butter (BOURÁK)
// ---------------------------------------------------------------------------

function pachy(p: DinoPalette): DinoRig {
  const rig = newRig('ankylo', p);
  const skin = makeSkinMaterial(p, rig.animatedMaterials);
  const em = bodyEmissive(p);
  const keys: BodyKey[] = [
    { z: -1.44, y: 0.9, w: 0.024, h: 0.024 },
    { z: -1.38, y: 0.91, w: 0.07, h: 0.07 },
    { z: -1.27, y: 0.95, w: 0.112, h: 0.112 },
    { z: -1.14, y: 1.0, w: 0.15, h: 0.15 },
    { z: -1.01, y: 1.02, w: 0.165, h: 0.16 },
    { z: -0.89, y: 0.93, w: 0.135, h: 0.14 },
    { z: -0.76, y: 0.73, w: 0.145, h: 0.16 },
    { z: -0.57, y: 0.49, w: 0.23, h: 0.25 },
    { z: -0.32, y: 0.31, w: 0.34, h: 0.36 },
    { z: 0.0, y: 0.25, w: 0.37, h: 0.38 },
    { z: 0.3, y: 0.25, w: 0.33, h: 0.34 },
    { z: 0.66, y: 0.27, w: 0.21, h: 0.22 },
    { z: 1.06, y: 0.29, w: 0.13, h: 0.13 },
    { z: 1.46, y: 0.3, w: 0.07, h: 0.07 },
    { z: 1.8, y: 0.31, w: 0.014, h: 0.014 },
  ];
  const sp = buildSpine(
    { keys, head: 4, neck: [6], chest: 8, pelvis: 10, tail: [11, 12, 13], color: skinColor(p, { beakUntil: 0.04, stripes: bandStripes(0.4, 0.92, 2.8, 0.26), dorsal: 0.72 }) },
    skin,
  );
  const hp = sp.parts.get(sp.head)!;
  for (const side of [-1, 1]) {
    addEye(hp, sp.local(sp.head, [side * 0.14, 1.04, -1.16]), 0.04, side, 0xe1b12c, p.body, true);
    hp.add(PG.sphere(8, 6), 0x1a1a1a, sp.local(sp.head, [side * 0.035, 0.94, -1.42]), [0, 0, 0], 0.013);
  }
  // the thick bony dome with a ring of knobs and a knobbly snout
  hp.add(PG.sphere(20, 14), (q) => mix(p.accent, p.detail, smooth(-0.3, 1, q.y)), sp.local(sp.head, [0, 1.13, -1.03]), [0.25, 0, 0], [0.19, 0.17, 0.22], 'gloss');
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = Math.cos(a) * 0.19;
    const z = -1.03 + Math.sin(a) * 0.21;
    hp.add(PG.cone(6), IVORY, sp.local(sp.head, [x, 1.05, z]), [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], [0.028, 0.06, 0.028], 'gloss');
  }
  for (let i = 0; i < 3; i++) hp.add(PG.cone(6), IVORY, sp.local(sp.head, [0, 1.03 - i * 0.02, -1.25 - i * 0.07]), [-0.4, 0, 0], [0.024, 0.045, 0.024], 'gloss');
  rig.jaw = lowerJaw(sp, p, skin, [0, 0.9, -1.1], [
    { z: -0.33, y: -0.01, w: 0.02, h: 0.015 },
    { z: -0.27, y: -0.014, w: 0.055, h: 0.03 },
    { z: -0.12, y: -0.008, w: 0.1, h: 0.045 },
    { z: 0.0, y: 0.0, w: 0.115, h: 0.05 },
  ]);
  rig.headTop.position.set(...sp.local(sp.head, [0, 1.28, -1.03]));
  rig.face.position.set(...sp.local(sp.head, [0, 1.07, -1.24]));
  for (const side of [-1, 1]) rig.arms.push(theropodArm(side, sp.chest, sp.local(sp.chest, [side * 0.24, 0.0, -0.4]), [0.2, 0.18], 0.055, [0.8, -1.3], p, em, skin, false));
  finishSpine(rig, sp, em, skin);
  const L: [number, number, number] = [0.46, 0.47, 0.3];
  const rest: [number, number, number] = [0.38, -0.98, 0.72];
  rig.hipHeight = legDrop(L, rest) + 0.05;
  for (const side of [-1, 1]) {
    const leg = theropodLeg(side, [side * 0.27, -0.03, 0.2], L, 0.16, rest, p, false, em, skin);
    rig.hips.add(leg.hip);
    rig.legs.push(leg);
  }
  const ext = keyExtents(keys, rig.hipHeight);
  rig.height = ext.top + 0.12;
  rig.length = ext.length;
  rig.stride = 2.7;
  return rig;
}

// ---------------------------------------------------------------------------
// Brachiosaurus – long-necked giant (TEREŇÁK)
// ---------------------------------------------------------------------------

function brachio(p: DinoPalette): DinoRig {
  const rig = newRig('trike', p);
  rig.quadruped = true;
  const skin = makeSkinMaterial(p, rig.animatedMaterials);
  const em = bodyEmissive(p);
  const keys: BodyKey[] = [
    { z: -1.62, y: 2.0, w: 0.02, h: 0.02 },
    { z: -1.57, y: 2.01, w: 0.06, h: 0.055 },
    { z: -1.47, y: 2.04, w: 0.09, h: 0.085 },
    { z: -1.37, y: 2.1, w: 0.105, h: 0.11 },
    { z: -1.28, y: 2.06, w: 0.075, h: 0.08 },
    { z: -1.2, y: 1.84, w: 0.08, h: 0.085 },
    { z: -1.1, y: 1.52, w: 0.1, h: 0.105 },
    { z: -0.98, y: 1.2, w: 0.13, h: 0.135 },
    { z: -0.86, y: 0.92, w: 0.19, h: 0.2 },
    { z: -0.7, y: 0.7, w: 0.3, h: 0.32 },
    { z: -0.42, y: 0.56, w: 0.48, h: 0.48 },
    { z: 0.0, y: 0.46, w: 0.52, h: 0.49 },
    { z: 0.38, y: 0.4, w: 0.45, h: 0.43 },
    { z: 0.76, y: 0.34, w: 0.26, h: 0.27 },
    { z: 1.15, y: 0.3, w: 0.14, h: 0.15 },
    { z: 1.55, y: 0.27, w: 0.07, h: 0.07 },
    { z: 1.9, y: 0.25, w: 0.014, h: 0.014 },
  ];
  const sp = buildSpine(
    { keys, head: 3, neck: [5, 7, 9], chest: 10, pelvis: 12, tail: [13, 14, 15], squareness: 2.15, bellyFlat: 0.85, color: skinColor(p, { spots: 0.2, dorsal: 0.72 }) },
    skin,
  );
  const hp = sp.parts.get(sp.head)!;
  for (const side of [-1, 1]) {
    addEye(hp, sp.local(sp.head, [side * 0.095, 2.13, -1.42]), 0.036, side, 0x8e5a2b, p.body, true);
    hp.add(PG.sphere(8, 6), 0x1a1a1a, sp.local(sp.head, [side * 0.04, 2.24, -1.4]), [0, 0, 0], 0.014);
  }
  // the arched nasal crest on top of the head
  hp.add(PG.sphere(14, 10), shade(p.body, 0.95), sp.local(sp.head, [0, 2.2, -1.4]), [0.4, 0, 0], [0.07, 0.08, 0.11]);
  rig.headTop.position.set(...sp.local(sp.head, [0, 2.26, -1.36]));
  rig.face.position.set(...sp.local(sp.head, [0, 2.12, -1.5]));
  rig.face.scale.setScalar(0.66);
  rig.headTop.scale.setScalar(0.6);
  finishSpine(rig, sp, em, skin);
  // front legs longer than the hind legs – the back slopes down to the tail
  const hindL: [number, number] = [0.46, 0.42];
  const hindRest: [number, number] = [-0.18, 0.3];
  const frontL: [number, number] = [0.6, 0.54];
  const frontRest: [number, number] = [0.12, -0.2];
  const hindDrop = legDrop(hindL, hindRest) + 0.07;
  const frontDrop = legDrop(frontL, frontRest) + 0.07;
  rig.hipHeight = hindDrop;
  for (const side of [-1, 1]) {
    const hind = quadLeg(side, [side * 0.36, -0.14, 0.36], hindL, 0.17, hindRest, p, false, em, skin, 3);
    hind.phase = side > 0 ? 0 : Math.PI;
    const front = quadLeg(side, [side * 0.38, frontDrop - hindDrop - 0.14, -0.5], frontL, 0.16, frontRest, p, true, em, skin, 4);
    front.phase = side > 0 ? Math.PI : 0;
    rig.hips.add(hind.hip, front.hip);
    rig.legs.push(hind, front);
  }
  rig.hipHeight += 0.08;
  const ext = keyExtents(keys, rig.hipHeight);
  rig.height = ext.top + 0.1;
  rig.length = ext.length;
  rig.stride = 2.4;
  return rig;
}

// ---------------------------------------------------------------------------
// Pteranodon – the flyer (LETEC); always flies low above the track
// ---------------------------------------------------------------------------

function pteranodon(p: DinoPalette): DinoRig {
  const rig = newRig('ptero', p);
  const skin = makeSkinMaterial(p, rig.animatedMaterials);
  const em = bodyEmissive(p);
  const keys: BodyKey[] = [
    { z: -1.3, y: 0.16, w: 0.008, h: 0.008 },
    { z: -1.12, y: 0.14, w: 0.03, h: 0.032 },
    { z: -0.88, y: 0.12, w: 0.055, h: 0.064 },
    { z: -0.68, y: 0.12, w: 0.085, h: 0.1 },
    { z: -0.56, y: 0.07, w: 0.058, h: 0.066 },
    { z: -0.42, y: 0.02, w: 0.07, h: 0.078 },
    { z: -0.22, y: 0.0, w: 0.15, h: 0.15 },
    { z: 0.02, y: 0.0, w: 0.17, h: 0.16 },
    { z: 0.24, y: 0.0, w: 0.12, h: 0.11 },
    { z: 0.42, y: 0.01, w: 0.05, h: 0.05 },
    { z: 0.56, y: 0.02, w: 0.01, h: 0.01 },
  ];
  const sp = buildSpine({ keys, head: 3, neck: [5], chest: 6, pelvis: 8, tail: [9], color: skinColor(p, { beakUntil: 0.12, dorsal: 0.72 }) }, skin);
  const hp = sp.parts.get(sp.head)!;
  for (const side of [-1, 1]) addEye(hp, sp.local(sp.head, [side * 0.07, 0.17, -0.72]), 0.034, side, 0xffb300, p.body, true);
  // the long backward crest
  hp.addMatrix(
    PG.cone(8),
    (q) => mix(p.accent, p.detail, smooth(0, 1, q.y)),
    new THREE.Matrix4().compose(new THREE.Vector3(...sp.local(sp.head, [0, 0.2, -0.6])), new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.95, 0, 0)), new THREE.Vector3(0.05, 0.5, 0.11)),
  );
  rig.headTop.position.set(...sp.local(sp.head, [0, 0.24, -0.66]));
  rig.face.position.set(...sp.local(sp.head, [0, 0.17, -0.78]));
  rig.face.scale.setScalar(0.55);
  rig.headTop.scale.setScalar(0.55);
  // little dangling legs
  const pp = sp.parts.get(sp.pelvis)!;
  for (const side of [-1, 1]) {
    pp.add(PG.sphere(8, 6), shade(p.body, 0.8), sp.local(sp.pelvis, [side * 0.08, -0.12, 0.32]), [0.9, 0, 0], [0.035, 0.16, 0.04]);
    pp.add(PG.sphere(6, 5), shade(p.body, 0.6), sp.local(sp.pelvis, [side * 0.08, -0.2, 0.46]), [0, 0, 0], [0.04, 0.025, 0.06]);
  }
  finishSpine(rig, sp, em, skin);
  // big membrane wings with a bony leading edge
  for (const side of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(side * 0.12, 0.04, -0.16);
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.18);
    shape.quadraticCurveTo(0.9, -0.22, 1.75, 0.3);
    shape.quadraticCurveTo(1.15, 0.28, 0.75, 0.5);
    shape.quadraticCurveTo(0.35, 0.52, 0, 0.34);
    shape.lineTo(0, -0.18);
    const g = new THREE.ShapeGeometry(shape, 12).rotateX(-Math.PI / 2);
    if (side < 0) g.scale(-1, 1, 1);
    const wp = new Parts();
    wp.add(g, (q) => mix(p.body, p.accent, smooth(0.3, 1.7, Math.abs(q.x))), [0, 0, 0], [0, 0, 0], 1, 'membrane');
    const edge = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.01, 0.16), new THREE.Vector3(side * 0.9, 0.02, 0.2), new THREE.Vector3(side * 1.75, 0.0, -0.3)]);
    wp.add(new THREE.TubeGeometry(edge, 12, 0.03, 6, false), shade(p.body, 0.85), [0, 0, 0], [0, 0, 0], 1);
    wp.build(w, em, skin);
    rig.hips.add(w);
    rig.wings.push(w);
  }
  // a big wingspan so the flyer reads well next to the walkers
  rig.root.scale.setScalar(1.35);
  rig.hipHeight = 1.3;
  rig.height = 2.4;
  rig.length = 2.6;
  rig.stride = 3;
  return rig;
}

/** Builders of the newer species. Styracosaurus and Baryonyx share the
 * Triceratops / Spinosaurus body plans (see dinoModels.ts). */
export const SPECIES_BUILDERS: Record<'gallimimus' | 'dilophosaurus' | 'stego' | 'pachy' | 'brachio' | 'pteranodon', (p: DinoPalette) => DinoRig> = {
  gallimimus,
  dilophosaurus,
  stego,
  pachy,
  brachio,
  pteranodon,
};
