import * as THREE from 'three';
import { ARCHETYPE_INFO } from '../config/dinosaurs';
import { GAME_CONFIG } from '../config/gameConfig';
import { TERRAINS } from '../config/terrain';
import type { DynamicEventType, ObstacleKind, TerrainId, TrackDefinition, TrackSegment, WorldId } from '../types';
import { bannerTexture, checkerTexture, signTexture, terrainTexture } from './textures';
import { basicMat, disposeObject, easeOutBack, GeoMerger, GEO, mat, mesh, vertexColorMat } from './util';

export const LANE_WIDTH = 3.0;

export function laneX(lane: number): number {
  return (lane - 1) * GAME_CONFIG.laneSpacing;
}

/** Strip geometry with UVs tiled every `tile` metres. Lies in XZ plane, extends to -Z. */
function stripGeometry(width: number, length: number, tile = 4): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(width, length, 1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -length / 2);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * (width / tile), uv.getY(i) * (length / tile));
  }
  return g;
}

const terrainMatCache = new Map<string, THREE.Material>();
function terrainMaterial(id: TerrainId): THREE.Material {
  let m = terrainMatCache.get(id);
  if (!m) {
    const cat = TERRAINS[id].category;
    const water = cat === 'water';
    m = new THREE.MeshLambertMaterial({
      map: terrainTexture(id),
      transparent: water,
      opacity: water ? 0.88 : 1,
      emissive: id === 'ice' ? 0x16323d : water ? 0x05202e : 0x000000,
    });
    m.userData.shared = true;
    terrainMatCache.set(id, m);
  }
  return m;
}

export interface PieceAnim {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
}

export interface ObstacleVisual {
  group: THREE.Group;
  pieces: THREE.Object3D[];
  state: 'intact' | 'broken' | 'climbed';
  t: number;
  anims: PieceAnim[];
  appear: number;
  kind: ObstacleKind;
}

export interface CoinVisual {
  pos: THREE.Vector3;
  state: 'idle' | 'taken' | 'missed' | 'gone';
  t: number;
}

export interface SegmentVisual {
  seg: TrackSegment;
  terrain: TerrainId;
  group: THREE.Group;
  ground: THREE.Mesh;
  sign: THREE.Sprite | null;
  signBase: number;
  obstacles: ObstacleVisual[];
  coins: CoinVisual[];
  coinMesh: THREE.InstancedMesh | null;
  appear: number;
  eventType?: DynamicEventType;
}

function stone(color: number, size: number, pos: [number, number, number]) {
  return mesh(GEO.dodeca(), mat(color), pos, [size, size * 0.8, size], [Math.random(), Math.random(), Math.random()]);
}

export function buildObstacle(kind: ObstacleKind, world: WorldId): THREE.Object3D[] {
  const pieces: THREE.Object3D[] = [];
  const dark = world === 'volcano';
  switch (kind) {
    case 'rockPile': {
      const c = dark ? [0x3d3533, 0x544a46, 0x2f2826] : [0x8c8076, 0xa59a8f, 0x77695f];
      pieces.push(stone(c[0], 0.62, [-0.75, 0.45, 0]), stone(c[1], 0.7, [0.65, 0.5, 0.1]), stone(c[2], 0.55, [0, 0.5, -0.15]), stone(c[1], 0.45, [-0.1, 1.05, 0.05]), stone(c[0], 0.35, [0.95, 0.3, -0.3]));
      break;
    }
    case 'boulder': {
      const c = dark ? 0x463b37 : 0x968a80;
      pieces.push(mesh(GEO.ico(), mat(c), [0, 0.85, 0], [0.95, 0.85, 0.85], [0.3, 0.5, 0]));
      pieces.push(stone(c, 0.38, [-1.0, 0.3, 0.2]), stone(c, 0.3, [1.05, 0.25, -0.2]));
      pieces.push(mesh(GEO.sphere(0), mat(0x7bc043), [0.2, 1.55, 0.2], [0.35, 0.12, 0.3]));
      break;
    }
    case 'woodWall': {
      const w = 0xb07a3c;
      const d = 0x7a4a1c;
      pieces.push(mesh(GEO.box(), mat(d), [-1.25, 0.8, 0], [0.22, 1.6, 0.22]));
      pieces.push(mesh(GEO.box(), mat(d), [1.25, 0.8, 0], [0.22, 1.6, 0.22]));
      for (let i = 0; i < 3; i++) pieces.push(mesh(GEO.box(), mat(i % 2 ? w : 0xc48a4c), [0, 0.35 + i * 0.45, 0.05], [2.6, 0.32, 0.14], [0, 0, (i - 1) * 0.04]));
      pieces.push(mesh(GEO.box(), mat(0xc48a4c), [0, 0.8, 0.13], [0.2, 1.3, 0.1], [0, 0, 0.7]));
      break;
    }
    case 'fallenTree': {
      const trunkColor = world === 'islands' ? 0xa0703c : 0x7a4a24;
      const trunk = mesh(GEO.cylinder(8), mat(trunkColor), [-1.4, 0.4, 0], [0.38, 2.8, 0.38], [0, 0, -Math.PI / 2]);
      pieces.push(trunk);
      pieces.push(mesh(GEO.cylinder(8), mat(0xd9a86c), [1.42, 0.4, 0], [0.34, 0.04, 0.34], [0, 0, -Math.PI / 2]));
      pieces.push(mesh(GEO.sphere(1), mat(0x3fa34d), [-1.3, 0.75, 0.1], [0.7, 0.6, 0.7]));
      pieces.push(mesh(GEO.sphere(1), mat(0x4cbb5a), [-0.8, 0.9, -0.3], [0.5, 0.45, 0.5]));
      pieces.push(mesh(GEO.cylinder(5), mat(trunkColor), [0.3, 0.7, 0], [0.08, 0.6, 0.08], [0.4, 0, 0.3]));
      break;
    }
    case 'iceBlock': {
      const m1 = mat(0xbfeaff, { opacity: 0.85 });
      const m2 = mat(0x9fdcff, { opacity: 0.85 });
      pieces.push(mesh(GEO.box(), m1, [-0.6, 0.55, 0], [1.1, 1.1, 1.0], [0, 0.2, 0]));
      pieces.push(mesh(GEO.box(), m2, [0.65, 0.45, 0.1], [1.0, 0.9, 0.9], [0, -0.3, 0]));
      pieces.push(mesh(GEO.box(), m1, [0, 1.3, 0], [0.8, 0.6, 0.7], [0.2, 0.5, 0.1]));
      break;
    }
    case 'stoneWall': {
      const c = dark ? [0x4a403c, 0x5c514c] : [0x9a9088, 0xb1a79e];
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 4; i++) {
          const x = -1.05 + i * 0.7 + (row % 2) * 0.35 - 0.17;
          if (x > 1.2) continue;
          pieces.push(mesh(GEO.box(), mat(c[(i + row) % 2]), [x, 0.25 + row * 0.45, 0], [0.66, 0.42, 0.6]));
        }
      }
      break;
    }
  }
  for (const p of pieces) p.userData.basePos = p.position.clone();
  return pieces;
}

let coinGeo: THREE.BufferGeometry | null = null;
function coinGeometry(): THREE.BufferGeometry {
  if (!coinGeo) {
    coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 14).rotateX(Math.PI / 2);
    coinGeo.userData.shared = true;
  }
  return coinGeo;
}
const tmpObj = new THREE.Object3D();

/**
 * Renders the visible window of one lane. Each lane has its own copy of the
 * track (identical layout), its own obstacles and coins.
 */
export class LaneTrack {
  readonly group = new THREE.Group();
  readonly lane: number;
  private visuals = new Map<number, SegmentVisual>();
  private track: TrackDefinition;
  private world: WorldId;
  private showDinoOnSigns: boolean;
  private finishBuilt = false;
  private extras: THREE.Object3D[] = [];

  constructor(lane: number, track: TrackDefinition, world: WorldId, showDinoOnSigns: boolean) {
    this.lane = lane;
    this.track = track;
    this.world = world;
    this.showDinoOnSigns = showDinoOnSigns;
    this.group.position.x = laneX(lane);
    this.buildStartFinish();
  }

  private buildStartFinish() {
    // start line
    const start = mesh(stripGeometry(LANE_WIDTH, 0.6, 0.6), basicMat(0xffffff), [0, 0.03, -2]);
    this.group.add(start);
    this.extras.push(start);
    if (this.track.endless || this.finishBuilt) return;
    this.finishBuilt = true;
    const len = this.track.length;
    const checkerMat = new THREE.MeshBasicMaterial({ map: checkerTexture() });
    const fin = new THREE.Mesh(stripGeometry(LANE_WIDTH, 1.6, 0.8), checkerMat);
    fin.position.set(0, 0.04, -len + 0.8);
    this.group.add(fin);
    this.extras.push(fin);
    if (this.lane === 1) {
      const arch = new THREE.Group();
      const postMat = mat(0xff4757);
      for (const x of [-5.5, 5.5]) {
        arch.add(mesh(GEO.cylinder(8), postMat, [x, 0, 0], [0.3, 5.2, 0.3]));
        arch.add(mesh(GEO.sphere(1), mat(0xffd32a), [x, 5.3, 0], 0.45));
      }
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.8), new THREE.MeshBasicMaterial({ map: bannerTexture('CÍL', '#ff4757'), side: THREE.DoubleSide }));
      banner.position.set(0, 4.4, 0);
      arch.add(banner);
      arch.position.set(0, 0, -len);
      this.group.add(arch);
      this.extras.push(arch);
      const sArch = new THREE.Group();
      for (const x of [-5.5, 5.5]) sArch.add(mesh(GEO.cylinder(8), mat(0x2ed573), [x, 0, 0], [0.25, 4.6, 0.25]));
      const sb = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.4), new THREE.MeshBasicMaterial({ map: bannerTexture('START', '#2ed573'), side: THREE.DoubleSide }));
      sb.position.set(0, 3.9, 0);
      sArch.add(sb);
      sArch.position.set(0, 0, -9);
      this.group.add(sArch);
      this.extras.push(sArch);
    }
  }

  /** Keep segment visuals for [from, to] metres. */
  updateWindow(from: number, to: number) {
    const segs = this.track.segments;
    for (const [idx, v] of this.visuals) {
      if (v.seg.end < from || v.seg.start > to) {
        this.removeVisual(idx);
      }
    }
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.end < from) continue;
      if (s.start > to) break;
      const v = this.visuals.get(i);
      if (!v) this.visuals.set(i, this.buildSegment(s, 0));
      else if (v.terrain !== s.terrain) {
        // terrain changed (dynamic event) – rebuild with an appear animation
        this.removeVisual(i);
        this.visuals.set(i, this.buildSegment(s, 1, s.event?.type));
      }
    }
  }

  private removeVisual(idx: number) {
    const v = this.visuals.get(idx);
    if (!v) return;
    this.group.remove(v.group);
    disposeObject(v.group);
    this.visuals.delete(idx);
  }

  private buildSegment(seg: TrackSegment, appear: number, eventType?: DynamicEventType): SegmentVisual {
    const g = new THREE.Group();
    const len = seg.end - seg.start;
    const cat = TERRAINS[seg.terrain].category;
    const ground = new THREE.Mesh(stripGeometry(LANE_WIDTH, len + 0.02), terrainMaterial(seg.terrain));
    ground.position.set(0, cat === 'water' ? 0.015 : 0.01, -seg.start);
    ground.renderOrder = cat === 'water' ? 2 : 0;
    g.add(ground);
    // static details are merged into one mesh per segment (few draw calls)
    const deco = new GeoMerger();
    if (seg.terrain === 'bridge') {
      for (const x of [-1.55, 1.55]) {
        deco.add(GEO.box(), 0x7d4a1f, [x, 0.65, -seg.start - len / 2], [0.14, 0.12, len]);
        for (let z = 0; z < len; z += 2.5) deco.add(GEO.box(), 0x5c3512, [x, 0.32, -seg.start - z - 0.5], [0.16, 0.7, 0.16]);
      }
    }
    if (seg.terrain === 'snow') {
      for (const x of [-1.45, 1.45]) {
        for (let z = 2; z < len; z += 3.2) deco.add(GEO.sphere(1), 0xffffff, [x, 0.05, -seg.start - z], [0.35, 0.22, 0.6]);
      }
    }
    if (seg.terrain === 'mud') {
      for (let z = 2; z < len - 1; z += 4) deco.add(GEO.sphere(0), 0x4a2e14, [((z * 7) % 3) - 1, 0.03, -seg.start - z], [0.25, 0.05, 0.25]);
    }
    // sign + gate at change points
    let sign: THREE.Sprite | null = null;
    let signBase = 0;
    const prev = this.track.segments[seg.index - 1];
    if (prev && prev.recommended !== seg.recommended) {
      const tex = signTexture(seg.terrain, this.showDinoOnSigns);
      const spMat = new THREE.SpriteMaterial({ map: tex, depthWrite: false });
      sign = new THREE.Sprite(spMat);
      const h = this.showDinoOnSigns ? 1.5 : 1;
      signBase = 1.45;
      sign.scale.set(signBase, signBase * h, 1);
      sign.position.set(0, 3.4 + (h - 1) * 0.7, -seg.start);
      sign.renderOrder = 5;
      g.add(sign);
      const color = new THREE.Color(ARCHETYPE_INFO[seg.recommended].color).getHex();
      const gate = mesh(stripGeometry(LANE_WIDTH, 0.35, 0.35), basicMat(color), [0, 0.04, -seg.start + 0.35]);
      g.add(gate);
      // little posts on both sides of the gate
      for (const x of [-1.6, 1.6]) {
        deco.add(GEO.cylinder(6), color, [x, 0, -seg.start], [0.08, 1.3, 0.08]);
        deco.add(GEO.sphere(0), color, [x, 1.35, -seg.start], 0.16);
      }
    }
    const decoMesh = deco.build(vertexColorMat());
    if (decoMesh) g.add(decoMesh);
    // obstacles
    const obstacles: ObstacleVisual[] = seg.obstacles.map((o) => {
      const og = new THREE.Group();
      const pieces = buildObstacle(o.kind, this.world);
      for (const p of pieces) og.add(p);
      og.position.set(0, 0, -o.at);
      g.add(og);
      return { group: og, pieces, state: 'intact', t: 0, anims: [], appear: appear ? 0 : 1, kind: o.kind };
    });
    // coins – one instanced draw call per segment
    const coins: CoinVisual[] = seg.coins.map((c, i) => ({ pos: new THREE.Vector3(Math.sin(i * 0.9) * 0.6, 1.0, -c), state: 'idle', t: 0 }));
    let coinMesh: THREE.InstancedMesh | null = null;
    if (coins.length) {
      coinMesh = new THREE.InstancedMesh(coinGeometry(), mat(0xffd32a, { emissive: 0x6b4a00 }), coins.length);
      coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      coinMesh.frustumCulled = false;
      g.add(coinMesh);
    }
    this.group.add(g);
    const v: SegmentVisual = { seg, terrain: seg.terrain, group: g, ground, sign, signBase, obstacles, coins, coinMesh, appear: appear ? 0 : 1, eventType };
    if (appear) ground.scale.x = 0.05;
    return v;
  }

  smash(segIndex: number, obsIndex: number, power: boolean): THREE.Vector3 | null {
    const v = this.visuals.get(segIndex);
    const o = v?.obstacles[obsIndex];
    if (!o || o.state === 'broken') return null;
    o.state = 'broken';
    o.t = 0;
    o.anims = o.pieces.map((p) => ({
      mesh: p,
      vel: new THREE.Vector3((Math.random() - 0.5) * 7 + p.position.x * 2.5, 3 + Math.random() * 4 + (power ? 2 : 0), -4 - Math.random() * 5),
      spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
    }));
    const wp = new THREE.Vector3();
    o.group.getWorldPosition(wp);
    return wp;
  }

  climb(segIndex: number, obsIndex: number): THREE.Vector3 | null {
    const v = this.visuals.get(segIndex);
    const o = v?.obstacles[obsIndex];
    if (!o) return null;
    o.state = 'climbed';
    o.t = 0;
    const wp = new THREE.Vector3();
    o.group.getWorldPosition(wp);
    return wp;
  }

  coin(segIndex: number, coinIndex: number, taken: boolean): THREE.Vector3 | null {
    const v = this.visuals.get(segIndex);
    const c = v?.coins[coinIndex];
    if (!v || !c || c.state !== 'idle') return null;
    c.state = taken ? 'taken' : 'missed';
    c.t = 0;
    return v.group.localToWorld(c.pos.clone());
  }

  /** Per-frame animation; `racerPos` is the lane racer's real position. */
  update(dt: number, time: number, racerPos: number, racerSpeed: number, warnTime: number) {
    for (const v of this.visuals.values()) {
      if (v.appear < 1) {
        v.appear = Math.min(1, v.appear + dt * 1.6);
        v.ground.scale.x = 0.05 + 0.95 * easeOutBack(v.appear);
      }
      if (v.sign) {
        const ttc = (v.seg.start - racerPos) / Math.max(racerSpeed, 4);
        const near = ttc > 0 && ttc < warnTime;
        const pulse = near ? 1 + Math.sin(time * 10) * 0.08 + 0.25 : 1;
        v.sign.scale.set(v.signBase * pulse, v.signBase * pulse * (this.showDinoOnSigns ? 1.5 : 1), 1);
        v.sign.position.y = (this.showDinoOnSigns ? 3.75 : 3.4) + Math.sin(time * 2 + v.seg.index) * 0.12;
        (v.sign.material as THREE.SpriteMaterial).opacity = ttc < -0.3 ? Math.max(0, 1 + (ttc + 0.3) * 3) : 1;
      }
      for (const o of v.obstacles) {
        if (o.appear < 1) {
          o.appear = Math.min(1, o.appear + dt * 1.8);
          const e = easeOutBack(o.appear);
          if (o.kind === 'fallenTree') {
            o.group.rotation.z = (1 - e) * (Math.PI / 2);
            o.group.position.y = 0;
          } else {
            o.group.position.y = (1 - Math.min(1, o.appear * 1.3)) * 9;
          }
        }
        if (o.state === 'broken') {
          o.t += dt;
          for (const a of o.anims) {
            a.vel.y -= 16 * dt;
            a.mesh.position.addScaledVector(a.vel, dt);
            if (a.mesh.position.y < 0.2) {
              a.mesh.position.y = 0.2;
              a.vel.multiplyScalar(0.5);
              a.vel.y = Math.abs(a.vel.y) * 0.3;
            }
            a.mesh.rotation.x += a.spin.x * dt;
            a.mesh.rotation.y += a.spin.y * dt;
            if (o.t > 0.5) a.mesh.scale.multiplyScalar(Math.pow(0.03, dt));
          }
          if (o.t > 1.4) o.group.visible = false;
        } else if (o.state === 'climbed') {
          o.t += dt;
          o.group.rotation.z = Math.sin(o.t * 30) * 0.06 * Math.max(0, 1 - o.t * 2);
        }
      }
      if (v.coinMesh) {
        v.coins.forEach((c, i) => {
          tmpObj.position.copy(c.pos);
          tmpObj.rotation.set(0, 0, 0);
          tmpObj.scale.setScalar(1);
          if (c.state === 'idle') {
            tmpObj.rotation.y = time * 3 + c.pos.z;
            tmpObj.position.y = 1.0 + Math.sin(time * 4 + c.pos.z) * 0.1;
          } else if (c.state === 'taken') {
            c.t += dt;
            tmpObj.position.y = 1.0 + c.t * 6;
            tmpObj.scale.setScalar(Math.max(0.001, 1 - c.t / 0.35));
            if (c.t > 0.35) c.state = 'gone';
          } else if (c.state === 'missed') {
            c.t += dt;
            tmpObj.position.y = Math.max(0.05, 1.0 - c.t * 3);
            tmpObj.rotation.x = Math.min(1, c.t * 3) * (Math.PI / 2);
            if (c.t > 1.2) c.state = 'gone';
          } else {
            tmpObj.scale.setScalar(0.0001);
          }
          tmpObj.updateMatrix();
          v.coinMesh!.setMatrixAt(i, tmpObj.matrix);
        });
        v.coinMesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  dispose() {
    for (const k of [...this.visuals.keys()]) this.removeVisual(k);
    for (const e of this.extras) disposeObject(e);
  }
}
