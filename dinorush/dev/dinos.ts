// Developer model viewer: http://localhost:5173/dev/dinos.html?mode=run&view=side
import * as THREE from 'three';
import { animateDino, createDinoFromDef, createPtero, createTrex, type DinoAnimMode, type DinoRig } from '../src/render/dinoModels';

const q = new URLSearchParams(location.search);
const mode = (q.get('mode') ?? 'idle') as DinoAnimMode;
const view = q.get('view') ?? 'front';
const el = document.getElementById('v')!;
const r = new THREE.WebGLRenderer({ antialias: true });
r.setPixelRatio(Math.min(2, devicePixelRatio));
r.setSize(innerWidth, innerHeight);
r.outputColorSpace = THREE.SRGBColorSpace;
el.appendChild(r.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd3f5);
scene.add(new THREE.HemisphereLight(0xffffff, 0x5a8f3a, 1.9));
const sun = new THREE.DirectionalLight(0xfff1c9, 2.4);
sun.position.set(-4, 8, 5);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x7ac74f }));
scene.add(ground);
// ?move=1: the dinosaurs really run across a grid, so sliding feet would show
const move = q.has('move');
if (move) scene.add(new THREE.GridHelper(400, 400, 0x2f6b1f, 0x4e8f35));
const ids = (q.get('ids') ?? 'raptor-green,spino-blue,ankylo-orange,trike-purple').split(',');
const rigs: DinoRig[] = ids.map((id, i) => {
  const rig = id === 'trex' ? createTrex() : id === 'ptero' ? createPtero() : createDinoFromDef(id, q.get('acc'));
  rig.root.position.x = (i - (ids.length - 1) / 2) * 3.1;
  rig.root.rotation.y = view === 'side' ? -Math.PI / 2 : view === 'back' ? 0 : view === 'three' ? -2.4 : Math.PI;
  scene.add(rig.root);
  return rig;
});
const cam = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 200);
const dist = Number(q.get('dist') ?? 13);
cam.position.set(0, Number(q.get('camy') ?? 2.6), dist);
cam.lookAt(0, Number(q.get('look') ?? 1.1), 0);
let t = Number(q.get('t') ?? 0.4);
let last = performance.now();
const speed = Number(q.get('speed') ?? 11);
const fwd = new THREE.Vector3();
function step(dt: number) {
  t += dt;
  for (const rig of rigs) {
    animateDino(rig, dt, speed, mode, t);
    if (move) {
      rig.root.getWorldDirection(fwd);
      // models face -Z, getWorldDirection returns +Z of the object
      rig.root.position.addScaledVector(fwd, -speed * dt);
    }
  }
  if (move) {
    const x = rigs.reduce((a, rg) => a + rg.root.position.x, 0) / rigs.length;
    const z = rigs.reduce((a, rg) => a + rg.root.position.z, 0) / rigs.length;
    cam.position.set(x, Number(q.get('camy') ?? 2.6), z + dist);
    cam.lookAt(x, Number(q.get('look') ?? 1.1), z);
  }
}
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  r.render(scene, cam);
  requestAnimationFrame(frame);
}
for (const rig of rigs) animateDino(rig, 0.25, 11, mode, t);
// ?manual=1: frames are stepped from outside (deterministic film strips)
(window as unknown as { __advance: (s: number) => void }).__advance = (s: number) => {
  for (let k = 0; k < Math.round(s * 240); k++) step(1 / 240);
  r.render(scene, cam);
};
if (!q.has('manual')) requestAnimationFrame(frame);
else r.render(scene, cam);
(window as unknown as { __ready: boolean }).__ready = true;
