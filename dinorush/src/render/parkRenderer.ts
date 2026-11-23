import * as THREE from 'three';
import type { DecorationId } from '../types';
import { animateDino, createDino, createDinoFromDef, type DinoRig } from './dinoModels';
import { Particles } from './particles';
import { basicMat, disposeObject, easeOutBack, GEO, mat, mesh } from './util';
import { DINO_BY_ID } from '../config/dinosaurs';

const TILE = 2.2;

export function buildDecoration(id: DecorationId): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'tree':
      g.add(mesh(GEO.cylinder(7), mat(0x8a5a2b), [0, 0, 0], [0.18, 1.3, 0.18]));
      g.add(mesh(GEO.ico(), mat(0x3fae49), [0, 1.6, 0], [0.75, 0.7, 0.75]));
      g.add(mesh(GEO.ico(), mat(0x58c45a), [0.3, 2.0, 0.1], 0.45));
      break;
    case 'palm':
      for (let i = 0; i < 4; i++) g.add(mesh(GEO.cylinder(6), mat(0xb07a3c), [i * 0.06, i * 0.45, 0], [0.13, 0.48, 0.13]));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.add(mesh(GEO.sphere(0), mat(0x4fd06a), [0.2 + Math.cos(a) * 0.55, 1.85, Math.sin(a) * 0.55], [0.75, 0.08, 0.2], [0, -a, -0.4]));
      }
      break;
    case 'stone':
      g.add(mesh(GEO.dodeca(), mat(0x9a9088), [0, 0.4, 0], [0.6, 0.5, 0.55], [0.3, 0.6, 0]));
      g.add(mesh(GEO.dodeca(), mat(0xb1a79e), [0.5, 0.2, 0.3], 0.28));
      break;
    case 'bush':
      g.add(mesh(GEO.ico(), mat(0x3fae49), [0, 0.45, 0], [0.7, 0.55, 0.7]));
      g.add(mesh(GEO.ico(), mat(0x58c45a), [0.45, 0.35, 0.2], 0.4));
      for (let i = 0; i < 4; i++) g.add(mesh(GEO.sphere(0), mat(0xff4757), [Math.cos(i * 1.6) * 0.5, 0.65, Math.sin(i * 1.6) * 0.5], 0.08));
      break;
    case 'flowers': {
      const cols = [0xff6b81, 0xffd32a, 0xffffff, 0xa55eea, 0x70a1ff];
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4;
        const r = 0.2 + (i % 3) * 0.25;
        g.add(mesh(GEO.cylinder(4), mat(0x2f9e3a), [Math.cos(a) * r, 0, Math.sin(a) * r], [0.03, 0.35, 0.03]));
        g.add(mesh(GEO.sphere(0), mat(cols[i % cols.length]), [Math.cos(a) * r, 0.38, Math.sin(a) * r], 0.12));
      }
      break;
    }
    case 'pond':
      g.add(mesh(GEO.disc(), mat(0x2ec4f0, { flat: false, emissive: 0x062a3a }), [0, 0.06, 0], [0.95, 1, 0.8]));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        g.add(mesh(GEO.dodeca(), mat(0x9a9088), [Math.cos(a) * 0.98, 0.08, Math.sin(a) * 0.82], 0.16));
      }
      g.add(mesh(GEO.disc(), mat(0x3fae49), [0.3, 0.08, 0.2], [0.16, 1, 0.12]));
      break;
    case 'statue': {
      g.add(mesh(GEO.box(), mat(0xdcd6cf), [0, 0.25, 0], [0.9, 0.5, 0.9]));
      const rig = createDino('raptor', { body: 0xffc312, belly: 0xffe066, accent: 0xc08000, detail: 0xfff3b0, effect: 'gold' });
      rig.root.scale.setScalar(0.32);
      rig.root.position.y = 0.5;
      rig.root.rotation.y = 0.6;
      g.add(rig.root);
      break;
    }
    case 'fence':
      for (const x of [-0.8, 0, 0.8]) g.add(mesh(GEO.box(), mat(0x8a5a28), [x, 0.4, 0], [0.12, 0.8, 0.12]));
      for (const y of [0.3, 0.6]) g.add(mesh(GEO.box(), mat(0xb07a3c), [0, y, 0], [1.8, 0.1, 0.06]));
      break;
    case 'volcano':
      g.add(mesh(GEO.cone(8), mat(0x4a3f3a), [0, 0, 0], [0.85, 1.3, 0.85]));
      g.add(mesh(GEO.cone(8), basicMat(0xff6a00), [0, 1.05, 0], [0.3, 0.3, 0.3]));
      g.userData.smoke = true;
      break;
    case 'nest':
      g.add(mesh(GEO.torus(), mat(0xa0632e), [0, 0.15, 0], [0.55, 0.55, 0.9], [Math.PI / 2, 0, 0]));
      for (let i = 0; i < 3; i++) g.add(mesh(GEO.sphere(1), mat([0xfff3d6, 0xc8f7a0, 0xbfe0ff][i], { flat: false }), [Math.cos(i * 2.1) * 0.22, 0.25, Math.sin(i * 2.1) * 0.22], [0.16, 0.21, 0.16]));
      break;
  }
  return g;
}

interface Walker {
  rig: DinoRig;
  target: THREE.Vector3;
  wait: number;
}

/** Interactive 3D park: 5×4 grid of tiles, decorations, wandering dinos. */
export class ParkRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  private container: HTMLElement;
  private tiles: THREE.Mesh[] = [];
  private decos: (THREE.Group | null)[] = [];
  private walkers: Walker[] = [];
  private raycaster = new THREE.Raycaster();
  private cols: number;
  private rows: number;
  private raf = 0;
  private last = 0;
  private time = 0;
  private particles = new Particles(400);
  private highlight: { mode: 'none' | 'place' | 'move'; selected: number | null } = { mode: 'none', selected: null };
  private marker: THREE.Mesh;
  onCellTap: ((cell: number) => void) | null = null;
  private pointerHandler: (e: PointerEvent) => void;

  constructor(container: HTMLElement, cols: number, rows: number) {
    this.container = container;
    this.cols = cols;
    this.rows = rows;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.className = 'park-canvas';
    container.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x4caf50, 2.0));
    const sun = new THREE.DirectionalLight(0xfff1c9, 2.2);
    sun.position.set(-5, 10, 6);
    this.scene.add(sun);
    // island base
    const w = cols * TILE;
    const d = rows * TILE;
    this.scene.add(mesh(GEO.box(), mat(0xa0632e), [0, -0.6, 0], [w + 1.6, 1.0, d + 1.6]));
    this.scene.add(mesh(GEO.box(), mat(0x58b82e), [0, -0.12, 0], [w + 1.6, 0.2, d + 1.6]));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const tile = mesh(GEO.box(), mat((r + c) % 2 ? 0x6ccf3d : 0x7ad94a), [this.cellX(i), 0, this.cellZ(i)], [TILE - 0.12, 0.12, TILE - 0.12]);
        tile.userData.cell = i;
        this.tiles.push(tile);
        this.scene.add(tile);
      }
    }
    // border fence
    for (let x = -w / 2 - 0.6; x <= w / 2 + 0.6; x += 1.1) {
      for (const z of [-d / 2 - 0.65, d / 2 + 0.65]) this.scene.add(mesh(GEO.box(), mat(0x8a5a28), [x, 0.3, z], [0.12, 0.6, 0.12]));
    }
    for (const z of [-d / 2 - 0.65, d / 2 + 0.65]) this.scene.add(mesh(GEO.box(), mat(0xb07a3c), [0, 0.45, z], [w + 1.2, 0.08, 0.06]));
    this.marker = mesh(GEO.ring(), basicMat(0xffd32a), [0, 0.1, 0], [TILE * 0.5, 1, TILE * 0.5]);
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.scene.add(this.particles.points);
    this.decos = Array(cols * rows).fill(null);
    this.pointerHandler = (e: PointerEvent) => this.pick(e);
    this.renderer.domElement.addEventListener('pointerdown', this.pointerHandler);
    this.resize();
    this.start();
  }

  cellX(i: number) {
    return ((i % this.cols) - (this.cols - 1) / 2) * TILE;
  }

  cellZ(i: number) {
    return (Math.floor(i / this.cols) - (this.rows - 1) / 2) * TILE;
  }

  setCells(cells: (DecorationId | null)[]) {
    cells.forEach((id, i) => {
      const cur = this.decos[i];
      if (cur && cur.userData.decoId === id) return;
      if (cur) {
        this.scene.remove(cur);
        disposeObject(cur);
        this.decos[i] = null;
      }
      if (id) {
        const g = buildDecoration(id);
        g.userData.decoId = id;
        g.position.set(this.cellX(i), 0.06, this.cellZ(i));
        g.scale.setScalar(0.01);
        g.userData.grow = 0;
        this.scene.add(g);
        this.decos[i] = g;
        this.particles.emit('sparkle', g.position.x, 0.8, g.position.z, { count: 14, color: [0xffd32a, 0xffffff, 0x7bed9f] });
      }
    });
  }

  setDinos(list: { defId: string; accessory: string | null }[]) {
    for (const w of this.walkers) {
      this.scene.remove(w.rig.root);
      disposeObject(w.rig.root);
    }
    this.walkers = list
      .filter((d) => DINO_BY_ID[d.defId])
      .slice(0, 12)
      .map((d, i) => {
        const rig = createDinoFromDef(d.defId, d.accessory);
        rig.root.scale.setScalar(0.38);
        rig.root.position.set(this.cellX(i % (this.cols * this.rows)) + 0.4, 0.06, this.cellZ(i % (this.cols * this.rows)) + 0.4);
        this.scene.add(rig.root);
        return { rig, target: this.randomPoint(), wait: Math.random() * 2 };
      });
  }

  setHighlight(mode: 'none' | 'place' | 'move', selected: number | null) {
    this.highlight = { mode, selected };
    this.tiles.forEach((t, i) => {
      const empty = !this.decos[i];
      const glow = mode !== 'none' && empty;
      const odd = (Math.floor(i / this.cols) + (i % this.cols)) % 2 === 1;
      t.material = mat(glow ? (odd ? 0x9cf07a : 0xb4ff92) : odd ? 0x6ccf3d : 0x7ad94a);
    });
    if (selected !== null) {
      this.marker.visible = true;
      this.marker.position.set(this.cellX(selected), 0.12, this.cellZ(selected));
    } else this.marker.visible = false;
  }

  private randomPoint(): THREE.Vector3 {
    const w = this.cols * TILE;
    const d = this.rows * TILE;
    return new THREE.Vector3((Math.random() - 0.5) * (w - 1), 0.06, (Math.random() - 0.5) * (d - 1));
  }

  private pick(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    const objs = [...this.tiles, ...this.decos.filter((d): d is THREE.Group => !!d)];
    const hit = this.raycaster.intersectObjects(objs, true)[0];
    if (!hit) return;
    let o: THREE.Object3D | null = hit.object;
    while (o && o.userData.cell === undefined && !o.userData.decoId) o = o.parent;
    if (!o) return;
    let cell: number | undefined = o.userData.cell;
    if (cell === undefined) cell = this.decos.indexOf(o as THREE.Group);
    if (cell !== undefined && cell >= 0) this.onCellTap?.(cell);
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const boardW = this.cols * TILE + 2;
    const dist = Math.max(10, (boardW / (2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect)) * 0.95 + 2);
    this.camera.position.set(0, dist * 0.72, dist * 0.7);
    this.camera.lookAt(0, -0.5, 0.4);
    this.camera.updateProjectionMatrix();
    this.particles.setViewport(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  private start() {
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private frame(dt: number) {
    this.time += dt;
    for (const d of this.decos) {
      if (!d) continue;
      if (d.userData.grow < 1) {
        d.userData.grow = Math.min(1, d.userData.grow + dt * 3);
        const t = d.userData.grow;
        d.scale.setScalar(Math.max(0.01, easeOutBack(t)));
      }
      if (d.userData.smoke && Math.random() < dt * 2) this.particles.emit('smoke', d.position.x, 1.5, d.position.z, { count: 1, scale: 0.35 });
    }
    for (const w of this.walkers) {
      const r = w.rig.root;
      if (w.wait > 0) {
        w.wait -= dt;
        animateDino(w.rig, dt, 0, 'idle', this.time);
        continue;
      }
      const to = w.target.clone().sub(r.position);
      to.y = 0;
      const dist = to.length();
      if (dist < 0.2) {
        w.wait = 1 + Math.random() * 3;
        w.target = this.randomPoint();
        continue;
      }
      const speed = 1.2;
      to.normalize();
      r.position.addScaledVector(to, Math.min(dist, speed * dt));
      const yaw = Math.atan2(-to.x, -to.z);
      let dy = yaw - r.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      r.rotation.y += dy * Math.min(1, dt * 5);
      animateDino(w.rig, dt, speed * 2.6, 'run', this.time);
    }
    if (this.highlight.selected !== null) this.marker.scale.setScalar(TILE * 0.5 * (1 + Math.sin(this.time * 6) * 0.06));
    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer.domElement.removeEventListener('pointerdown', this.pointerHandler);
    disposeObject(this.scene);
    this.particles.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
