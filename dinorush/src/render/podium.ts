import * as THREE from 'three';
import { animateDino, createDinoFromDef, type DinoRig } from './dinoModels';
import { disposeObject, hash01 } from './util';

export interface PodiumEntry {
  defId: string;
  place: number;
  /** The HTML podium block the dinosaur stands on. */
  block: HTMLElement;
}

interface Stand {
  rig: DinoRig;
  place: number;
  block: HTMLElement;
  /** Height of the dinosaur in CSS pixels. */
  px: number;
  hopAt: number;
}

const CONFETTI = [0xff4757, 0xffd32a, 0x2ed573, 0x1e90ff, 0xa55eea, 0xff9f43, 0xffffff];

/**
 * 3D celebration on top of the HTML podium: the three best dinosaurs stand
 * on their blocks (measured from the page, so they rise with the blocks'
 * animation), the winner jumps for joy, the others cheer now and then,
 * and confetti rains down. Orthographic camera in CSS-pixel units.
 */
export class PodiumStage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, 1, 1, 0, -2000, 2000);
  private stands: Stand[] = [];
  private confetti: THREE.InstancedMesh;
  private bits: { x: number; y: number; vy: number; sway: number; rot: number; spin: number; phase: number }[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  private w = 1;
  private h = 1;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);

  constructor(
    private container: HTMLElement,
    entries: PodiumEntry[],
    opts: { quality: 'low' | 'high'; reducedMotion: boolean },
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: opts.quality !== 'low', alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.quality === 'low' ? 1 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.className = 'podium-canvas';
    container.appendChild(this.renderer.domElement);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 2.0);
    const sun = new THREE.DirectionalLight(0xfff1c9, 2.3);
    sun.position.set(-300, 600, 900);
    const rim = new THREE.DirectionalLight(0xbfe3ff, 0.8);
    rim.position.set(400, 300, -600);
    this.scene.add(hemi, sun, rim);
    this.camera.position.set(0, 0, 1000);
    for (const en of entries) {
      const rig = createDinoFromDef(en.defId, null);
      // stand at 3/4 view, turned a little towards the winner in the middle
      rig.root.rotation.y = Math.PI + (en.place === 2 ? 0.4 : en.place === 3 ? -0.4 : 0.2);
      this.scene.add(rig.root);
      this.stands.push({ rig, place: en.place, block: en.block, px: en.place === 1 ? 118 : 90, hopAt: 0.6 + en.place * 0.7 });
    }
    const count = opts.reducedMotion ? 30 : 90;
    const geo = new THREE.PlaneGeometry(9, 5);
    this.confetti = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), count);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.confetti.setColorAt(i, c.set(CONFETTI[i % CONFETTI.length]));
      this.bits.push({ x: hash01(i * 3.1), y: 1 + hash01(i * 7.7) * 1.2, vy: 70 + hash01(i * 5.3) * 90, sway: 10 + hash01(i * 2.9) * 25, rot: hash01(i) * 6, spin: 2 + hash01(i * 4.4) * 5, phase: hash01(i * 9.1) * 6 });
    }
    this.confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.confetti.frustumCulled = false;
    this.scene.add(this.confetti);
    this.resize();
  }

  private resize() {
    this.w = Math.max(1, this.container.clientWidth);
    this.h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.left = 0;
    this.camera.right = this.w;
    this.camera.top = this.h;
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
  }

  start() {
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
    if (this.container.clientWidth !== this.w || this.container.clientHeight !== this.h) this.resize();
    // page coordinates → our pixel space (the podium may be CSS-scaled)
    const box = this.container.getBoundingClientRect();
    const kx = this.w / Math.max(1, box.width);
    const ky = this.h / Math.max(1, box.height);
    for (const st of this.stands) {
      const b = st.block.getBoundingClientRect();
      const cx = (b.left + b.width / 2 - box.left) * kx;
      const top = this.h - (b.top - box.top) * ky;
      const rig = st.rig;
      rig.root.scale.setScalar(st.px / Math.max(0.5, rig.height));
      rig.root.position.set(cx, top, 0);
      // the winner celebrates all the time, the others now and then
      let mode: 'celebrate' | 'idle' = 'idle';
      if (st.place === 1) mode = 'celebrate';
      else if (this.time > st.hopAt) {
        mode = 'celebrate';
        if (this.time > st.hopAt + 1.1) st.hopAt = this.time + 1.6 + hash01(this.time) * 1.6;
      }
      animateDino(rig, dt, 0, mode, this.time + st.place);
    }
    this.bits.forEach((p, i) => {
      p.y -= (p.vy * dt) / this.h;
      if (p.y < -0.05) {
        p.y = 1.05;
        p.x = Math.random();
      }
      const x = p.x * this.w + Math.sin(this.time * 1.7 + p.phase) * p.sway;
      this.v.set(x, p.y * this.h, 200);
      this.e.set(this.time * p.spin + p.rot, this.time * p.spin * 0.7, p.rot);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v, this.q, this.s);
      this.confetti.setMatrixAt(i, this.m);
    });
    this.confetti.instanceMatrix.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    for (const st of this.stands) disposeObject(st.rig.root);
    this.confetti.geometry.dispose();
    (this.confetti.material as THREE.Material).dispose();
    this.confetti.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
