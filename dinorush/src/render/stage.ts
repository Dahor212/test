import * as THREE from 'three';
import { DINO_BY_ID } from '../config/dinosaurs';
import { animateDino, createDinoFromDef, type DinoAnimMode, type DinoRig } from './dinoModels';
import { disposeObject, GEO, mat, mesh } from './util';

export interface StageActor {
  rig: DinoRig;
  mode: DinoAnimMode;
  speed: number;
  spin?: number;
}

/**
 * Small reusable 3D stage for menus: idle / running dinos on a grassy island.
 */
export class DinoStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  readonly actors: StageActor[] = [];
  private container: HTMLElement;
  private raf = 0;
  private last = 0;
  private time = 0;
  private running = false;
  orbit = 0;
  orbitSpeed = 0;
  readonly floor: THREE.Group;
  onFrame: ((dt: number, t: number) => void) | null = null;

  constructor(container: HTMLElement, opts: { transparent?: boolean; floorColor?: number; quality?: 'low' | 'high' } = {}) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: opts.quality !== 'low', alpha: opts.transparent ?? true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.quality === 'low' ? 1 : 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.className = 'stage-canvas';
    container.appendChild(this.renderer.domElement);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x6ab04c, 2.0);
    const sun = new THREE.DirectionalLight(0xfff1c9, 2.2);
    sun.position.set(-4, 8, 6);
    this.scene.add(hemi, sun);
    this.floor = new THREE.Group();
    const top = mesh(new THREE.CylinderGeometry(3.2, 2.6, 0.6, 24), mat(opts.floorColor ?? 0x6ccf3d), [0, -0.3, 0]);
    const dirt = mesh(new THREE.CylinderGeometry(2.6, 1.6, 1.0, 24), mat(0xa0632e), [0, -1.1, 0]);
    this.floor.add(top, dirt);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.floor.add(mesh(GEO.sphere(0), mat(i % 2 ? 0x46c35a : 0x2f9e3a), [Math.cos(a) * 2.8, 0.05, Math.sin(a) * 2.8], [0.45, 0.3, 0.45]));
    }
    this.scene.add(this.floor);
    this.camera.position.set(0, 2.2, 6.5);
    this.camera.lookAt(0, 1, 0);
    this.resize();
  }

  addDino(defId: string, accessory: string | null, pos: [number, number, number], rotY: number, mode: DinoAnimMode = 'idle', speed = 0, fit = 0): StageActor {
    const rig = createDinoFromDef(defId, accessory);
    rig.root.position.set(...pos);
    rig.root.rotation.y = rotY;
    // optionally scale so that the longest dimension fits `fit` metres
    if (fit > 0) rig.root.scale.setScalar(Math.min(1, fit / Math.max(rig.length, rig.height * 1.2)));
    this.scene.add(rig.root);
    const a: StageActor = { rig, mode, speed };
    this.actors.push(a);
    return a;
  }

  removeActor(a: StageActor) {
    this.scene.remove(a.rig.root);
    disposeObject(a.rig.root);
    const i = this.actors.indexOf(a);
    if (i >= 0) this.actors.splice(i, 1);
  }

  clearActors() {
    for (const a of [...this.actors]) this.removeActor(a);
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  frame(dt: number) {
    this.time += dt;
    for (const a of this.actors) {
      animateDino(a.rig, dt, a.speed, a.mode, this.time);
      if (a.spin) a.rig.root.rotation.y += a.spin * dt;
    }
    if (this.orbitSpeed) {
      this.orbit += this.orbitSpeed * dt;
      const r = Math.hypot(this.camera.position.x, this.camera.position.z);
      this.camera.position.x = Math.sin(this.orbit) * r;
      this.camera.position.z = Math.cos(this.orbit) * r;
      this.camera.lookAt(0, 1, 0);
    }
    this.onFrame?.(dt, this.time);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stop();
    this.clearActors();
    disposeObject(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

// ---------------------------------------------------------------------------
// Snapshot renderer for card thumbnails – one shared WebGL context.
// ---------------------------------------------------------------------------

let snapRenderer: THREE.WebGLRenderer | null = null;
let snapScene: THREE.Scene | null = null;
let snapCam: THREE.PerspectiveCamera | null = null;
const snapCache = new Map<string, string>();

export function dinoSnapshot(defId: string, accessory: string | null, size = 256): string {
  const key = `${defId}|${accessory}|${size}`;
  const cached = snapCache.get(key);
  if (cached) return cached;
  if (!DINO_BY_ID[defId]) return '';
  try {
    if (!snapRenderer) {
      snapRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      snapRenderer.outputColorSpace = THREE.SRGBColorSpace;
      snapRenderer.setClearColor(0x000000, 0);
      snapScene = new THREE.Scene();
      snapScene.add(new THREE.HemisphereLight(0xffffff, 0x88aa66, 2.1));
      const sun = new THREE.DirectionalLight(0xffffff, 2.3);
      sun.position.set(-3, 6, 5);
      snapScene.add(sun);
      snapCam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    }
    snapRenderer.setSize(size, size, false);
    const rig = createDinoFromDef(defId, accessory);
    animateDino(rig, 0.016, 0, 'idle', 0.5);
    rig.root.rotation.y = -2.35;
    snapScene!.add(rig.root);
    const fit = Math.max(rig.height, rig.length * 0.62);
    snapCam!.position.set(0, fit * 0.62, fit * 2.35 + 0.6);
    snapCam!.lookAt(0, rig.height * 0.45, 0);
    snapRenderer.render(snapScene!, snapCam!);
    const url = snapRenderer.domElement.toDataURL('image/png');
    snapScene!.remove(rig.root);
    disposeObject(rig.root);
    snapCache.set(key, url);
    return url;
  } catch {
    return '';
  }
}
