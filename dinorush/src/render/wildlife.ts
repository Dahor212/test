import * as THREE from 'three';
import type { SceneryId } from '../types';
import { TerrainField, TrackPath } from './trackPath';
import { GeoMerger, GEO, hash01, vertexColorMat } from './util';

/** Colours of the background animals in each landscape (null = none there). */
const HERD: Record<SceneryId, { body: number; belly: number; spots: number } | null> = {
  jungle: { body: 0x7d9a5c, belly: 0xc9d3a0, spots: 0x5f7d45 },
  swamp: { body: 0x6f8466, belly: 0xb8c4a2, spots: 0x55674f },
  canyon: { body: 0xb38d5f, belly: 0xe6cf9f, spots: 0x8f6a42 },
  volcano: null,
  ice: { body: 0x8d939e, belly: 0xd9dde4, spots: 0x707784 },
  islands: { body: 0x6fa08e, belly: 0xcfe3c5, spots: 0x4f8270 },
};

const FLOCK: Record<SceneryId, { body: number; wing: number; crest: number }> = {
  jungle: { body: 0xd9733f, wing: 0xb84f2a, crest: 0xffc13b },
  swamp: { body: 0x8a7f6a, wing: 0x6c604c, crest: 0xd9a441 },
  canyon: { body: 0xc8693a, wing: 0x9c4524, crest: 0xffd36b },
  volcano: { body: 0x5a3f3b, wing: 0x3e2a27, crest: 0xff7043 },
  ice: { body: 0xcfd8e3, wing: 0x9fb0c4, crest: 0x5f9fe0 },
  islands: { body: 0xf08a5d, wing: 0xd45f3a, crest: 0xffe066 },
};

/** Tapered tube from a to b (for necks and tails). */
function limb(m: GeoMerger, color: number, a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) {
  const geo = new THREE.CylinderGeometry(r1, r0, 1, 7, 1);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const mtx = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, len, 1));
  m.addMatrix(geo, new THREE.Color(color), mtx);
  geo.dispose();
}

/** Points on a quadratic curve. */
function curve(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, n: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(new THREE.Vector3().addScaledVector(p0, (1 - t) * (1 - t)).addScaledVector(p1, 2 * (1 - t) * t).addScaledVector(p2, t * t));
  }
  return out;
}

interface SauropodGeos {
  body: THREE.BufferGeometry;
  neck: THREE.BufferGeometry;
  leg: THREE.BufferGeometry;
}

/** Low-poly long-neck: body + tail, neck + head (pivot at the shoulders), one leg. Faces -Z. */
function sauropodGeos(c: { body: number; belly: number; spots: number }): SauropodGeos {
  const b = new GeoMerger();
  b.add(GEO.sphere(1), c.body, [0, 4.3, 0.2], [1.55, 1.45, 2.9]);
  b.add(GEO.sphere(1), c.belly, [0, 3.75, 0.1], [1.25, 0.9, 2.4]);
  b.add(GEO.sphere(0), c.spots, [0.6, 5.2, -0.3], [0.7, 0.35, 0.9]);
  b.add(GEO.sphere(0), c.spots, [-0.5, 5.25, 0.9], [0.6, 0.3, 0.8]);
  const tail = curve(new THREE.Vector3(0, 4.4, 2.6), new THREE.Vector3(0, 3.6, 6.5), new THREE.Vector3(0.4, 2.4, 10.5), 5);
  for (let i = 0; i < tail.length - 1; i++) limb(b, c.body, tail[i], tail[i + 1], 1.05 * (1 - i / 6) + 0.12, 1.05 * (1 - (i + 1) / 6) + 0.1);
  const body = b.build(vertexColorMat())!.geometry;
  const n = new GeoMerger();
  const neck = curve(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 3.6, -1.2), new THREE.Vector3(0, 6.2, -3.6), 5);
  for (let i = 0; i < neck.length - 1; i++) limb(n, c.body, neck[i], neck[i + 1], 0.95 - i * 0.12, 0.83 - i * 0.12);
  const head = neck[neck.length - 1];
  n.add(GEO.sphere(1), c.body, [head.x, head.y + 0.1, head.z - 0.45], [0.42, 0.38, 0.75]);
  n.add(GEO.sphere(0), c.belly, [head.x, head.y - 0.12, head.z - 0.8], [0.3, 0.18, 0.4]);
  n.add(GEO.sphere(0), 0x222222, [head.x + 0.33, head.y + 0.22, head.z - 0.6], 0.09);
  n.add(GEO.sphere(0), 0x222222, [head.x - 0.33, head.y + 0.22, head.z - 0.6], 0.09);
  const neckGeo = n.build(vertexColorMat())!.geometry;
  const l = new GeoMerger();
  l.add(new THREE.CylinderGeometry(0.42, 0.52, 3.5, 7).translate(0, -1.75, 0), c.body, [0, 0, 0]);
  l.add(GEO.cylinder(7), c.spots, [0, -3.65, 0], [0.62, 0.3, 0.62]);
  const leg = l.build(vertexColorMat())!.geometry;
  return { body, neck: neckGeo, leg };
}

interface Walker {
  d: number;
  lateral: number;
  scale: number;
  phase: number;
}

interface Herd {
  walkers: Walker[];
  d: number;
  side: number;
  lateral: number;
  speed: number;
}

const LEG_POS: [number, number][] = [
  [0.85, -1.7],
  [-0.85, -1.7],
  [0.85, 1.9],
  [-0.85, 1.9],
];

/**
 * Background life: herds of long-necked dinosaurs wandering beside the
 * track and a flock of pterosaurs circling above the valley. Cheap: a few
 * draw calls, no shadows, everything shares one material.
 */
export class Wildlife {
  readonly group = new THREE.Group();
  private herds: Herd[] = [];
  private geos: SauropodGeos | null = null;
  private herdMesh: { body: THREE.InstancedMesh; neck: THREE.InstancedMesh; legs: THREE.InstancedMesh } | null = null;
  private part = new THREE.Matrix4();
  private rootM = new THREE.Matrix4();
  private birds: { body: THREE.InstancedMesh; wingL: THREE.InstancedMesh; wingR: THREE.InstancedMesh; state: { a: number; r: number; h: number; w: number; phase: number; size: number }[] } | null = null;
  private flockD = 0;
  private flockSide = 1;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private center = new THREE.Vector3();
  private wing = new THREE.Matrix4();
  private tmpM = new THREE.Matrix4();
  private mirror = new THREE.Matrix4().makeScale(-1, 1, 1);

  constructor(
    scenery: SceneryId,
    private path: TrackPath,
    private field: TerrainField,
    quality: 'low' | 'high',
    seed: number,
  ) {
    const herd = HERD[scenery];
    if (herd) {
      const g = sauropodGeos(herd);
      this.geos = g;
      const herds = quality === 'high' ? 2 : 1;
      for (let h = 0; h < herds; h++) this.herds.push(this.makeHerd(h, seed));
      // every animal shares three instanced draw calls: bodies, necks, legs
      const n = herds * 3;
      const mat = vertexColorMat();
      this.herdMesh = { body: new THREE.InstancedMesh(g.body, mat, n), neck: new THREE.InstancedMesh(g.neck, mat, n), legs: new THREE.InstancedMesh(g.leg, mat, n * 4) };
      for (const im of Object.values(this.herdMesh)) {
        im.frustumCulled = false;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.group.add(im);
      }
    }
    this.makeFlock(FLOCK[scenery], quality === 'high' ? 9 : 5);
  }

  private makeWalker(scale: number): Walker {
    return { d: 0, lateral: 0, scale, phase: Math.random() * 6 };
  }

  private makeHerd(i: number, seed: number): Herd {
    const walkers = [this.makeWalker(1.25), this.makeWalker(1.05), this.makeWalker(0.55)];
    walkers[0].d = 0;
    walkers[1].d = -12;
    walkers[1].lateral = 5;
    walkers[2].d = -5;
    walkers[2].lateral = -3.5;
    const herd: Herd = { walkers, d: 60 + i * 130 + hash01(seed + i) * 40, side: (i + seed) % 2 ? 1 : -1, lateral: 0, speed: 1.6 + hash01(seed * 3 + i) * 0.6 };
    this.place(herd, herd.d);
    return herd;
  }

  /** Put a herd on the dry ground beside the track at distance d. */
  private place(h: Herd, d: number) {
    h.d = d;
    for (let k = 0; k < 8; k++) {
      const lat = h.side * (this.field.smoothEdge(d, h.side) + 22 + hash01(d * 0.37 + k) * 26);
      if (this.field.isDry(d, lat) && this.field.isDry(d - 14, lat) && this.field.groundY(d, lat) > -0.2) {
        h.lateral = lat;
        return;
      }
      h.side = -h.side;
    }
    h.lateral = h.side * 60;
  }

  private makeFlock(c: { body: number; wing: number; crest: number }, n: number) {
    const b = new GeoMerger();
    b.add(GEO.sphere(1), c.body, [0, 0, 0], [0.32, 0.28, 0.95]);
    b.add(GEO.cone(5), c.body, [0, 0.05, -0.85], [0.16, 0.9, 0.16], [-Math.PI / 2, 0, 0]);
    b.add(GEO.cone(4), c.crest, [0, 0.22, -0.55], [0.08, 0.75, 0.2], [Math.PI * 0.62, 0, 0]);
    const bodyGeo = b.build(vertexColorMat())!.geometry;
    // one wing: a membrane triangle fan reaching out along +X
    const w = new THREE.BufferGeometry();
    const pts = [0, 0, -0.35, 2.4, 0.15, -0.15, 0, 0, 0.45, 2.4, 0.15, -0.15, 1.2, 0.05, 0.35, 0, 0, 0.45];
    w.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const wc = new THREE.Color(c.wing);
    w.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: 6 }, () => [wc.r, wc.g, wc.b]).flat(), 3));
    w.computeVertexNormals();
    const wingMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
    const body = new THREE.InstancedMesh(bodyGeo, vertexColorMat(), n);
    const wingL = new THREE.InstancedMesh(w, wingMat, n);
    const wingR = new THREE.InstancedMesh(w, wingMat, n);
    for (const im of [body, wingL, wingR]) {
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(im);
    }
    const state = Array.from({ length: n }, (_, i) => ({
      a: (i / n) * Math.PI * 2,
      r: 12 + hash01(i * 7) * 16,
      h: 24 + hash01(i * 3) * 14,
      w: (0.28 + hash01(i * 5) * 0.12) * (i % 3 === 0 ? -1 : 1),
      phase: hash01(i * 11) * 6,
      size: 1.6 + hash01(i * 13) * 0.8,
    }));
    this.birds = { body, wingL, wingR, state };
  }

  update(anchor: number, dt: number, time: number) {
    // herds walk along the valley; the racers overtake them
    const hm = this.herdMesh;
    let k = 0;
    for (const h of this.herds) {
      if (!hm) break;
      h.d += h.speed * dt;
      if (h.d < anchor - 25) this.place(h, anchor + 170 + Math.random() * 90);
      for (const w of h.walkers) {
        const d = h.d + w.d;
        const lat = h.lateral + w.lateral;
        this.path.sample(d, lat, this.v);
        w.phase += dt * h.speed * (1.6 / w.scale);
        const p = w.phase;
        this.v.y = this.field.groundY(d, lat) - 0.15 + Math.abs(Math.cos(p)) * 0.12 * w.scale;
        this.e.set(0, -this.path.heading(d), 0);
        this.q.setFromEuler(this.e);
        this.s.setScalar(w.scale);
        this.rootM.compose(this.v, this.q, this.s);
        hm.body.setMatrixAt(k, this.rootM);
        // neck: grazing now and then, looking around
        this.e.set(Math.sin(p * 0.5) * 0.05 + Math.max(0, Math.sin(time * 0.15 + w.scale * 7)) * 0.35, Math.sin(time * 0.3 + w.scale * 3) * 0.18, 0);
        this.part.makeRotationFromEuler(this.e).setPosition(0, 4.9, -2.3);
        this.tmpM.multiplyMatrices(this.rootM, this.part);
        hm.neck.setMatrixAt(k, this.tmpM);
        LEG_POS.forEach(([x, z], li) => {
          const swing = (li === 0 || li === 3 ? 1 : -1) * Math.sin(p) * 0.32;
          this.part.makeRotationX(swing).setPosition(x, 3.6, z);
          this.tmpM.multiplyMatrices(this.rootM, this.part);
          hm.legs.setMatrixAt(k * 4 + li, this.tmpM);
        });
        k++;
      }
    }
    if (hm) {
      hm.body.instanceMatrix.needsUpdate = true;
      hm.neck.instanceMatrix.needsUpdate = true;
      hm.legs.instanceMatrix.needsUpdate = true;
    }
    // the flock circles over the valley ahead of the racers
    if (!this.birds) return;
    if (this.flockD < anchor + 45 || this.flockD > anchor + 170) {
      this.flockD = anchor + 120 + Math.random() * 40;
      this.flockSide = Math.random() > 0.5 ? 1 : -1;
    }
    this.path.sample(this.flockD, this.flockSide * 26, this.center);
    const { body, wingL, wingR, state } = this.birds;
    state.forEach((b, i) => {
      b.a += b.w * dt;
      const x = this.center.x + Math.cos(b.a) * b.r;
      const z = this.center.z + Math.sin(b.a) * b.r;
      const y = b.h + Math.sin(time * 0.6 + b.phase) * 1.5;
      // fly along the circle's tangent, banking into the turn
      const sg = Math.sign(b.w);
      // models face -Z: yaw so that -Z points along the velocity
      const yaw = Math.atan2(Math.sin(b.a) * sg, -Math.cos(b.a) * sg);
      this.e.set(0, yaw, sg * 0.35, 'YXZ');
      this.q.setFromEuler(this.e);
      this.v.set(x, y, z);
      this.s.setScalar(b.size);
      this.m.compose(this.v, this.q, this.s);
      body.setMatrixAt(i, this.m);
      const glide = Math.sin(time * 0.7 + b.phase) > 0.3;
      const flap = glide ? 0.12 : Math.sin(time * 5.5 + b.phase) * 0.55;
      this.wing.makeRotationZ(flap);
      this.tmpM.multiplyMatrices(this.m, this.wing);
      wingR.setMatrixAt(i, this.tmpM);
      // mirrored copy flaps the same way (the mirror only flips X)
      this.tmpM.multiplyMatrices(this.m, this.mirror).multiply(this.wing);
      wingL.setMatrixAt(i, this.tmpM);
    });
    body.instanceMatrix.needsUpdate = true;
    wingL.instanceMatrix.needsUpdate = true;
    wingR.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    if (this.geos) {
      this.geos.body.dispose();
      this.geos.neck.dispose();
      this.geos.leg.dispose();
    }
    if (this.herdMesh) for (const im of Object.values(this.herdMesh)) im.dispose();
    if (this.birds) {
      this.birds.body.geometry.dispose();
      this.birds.wingL.geometry.dispose();
      (this.birds.wingL.material as THREE.Material).dispose();
      this.birds.body.dispose();
      this.birds.wingL.dispose();
      this.birds.wingR.dispose();
    }
  }
}
