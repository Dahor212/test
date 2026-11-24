import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DINO_BY_ID } from '../src/config/dinosaurs';
import { animateDino, createDino, createTrex, type DinoRig } from '../src/render/dinoModels';
import type { ModelId } from '../src/types';

const MODELS: ModelId[] = ['raptor', 'gallimimus', 'dilophosaurus', 'spino', 'baryonyx', 'ankylo', 'stego', 'pachy', 'trike', 'styraco', 'brachio'];
const palette = Object.values(DINO_BY_ID)[0].palette;

function rigs(): [string, DinoRig][] {
  return [...MODELS.map((m) => [m, createDino(m, palette)] as [string, DinoRig]), ['trex', createTrex()]];
}

/** Runs a rig forward at speed v and measures how fast the feet move while touching the ground. */
function slipSpeed(rig: DinoRig, v: number): number {
  const dt = 1 / 120;
  const p = new THREE.Vector3();
  const feet = rig.legs.map(() => ({ y: [] as number[], z: [] as number[] }));
  for (let i = 0; i < 600; i++) {
    rig.root.position.z -= v * dt;
    animateDino(rig, dt, v, 'run', i * dt);
    rig.root.updateMatrixWorld(true);
    if (i < 120) continue;
    rig.legs.forEach((l, k) => {
      l.foot.getWorldPosition(p);
      feet[k].y.push(p.y);
      feet[k].z.push(p.z);
    });
  }
  let moved = 0;
  let time = 0;
  for (const f of feet) {
    for (let i = 1; i < f.y.length; i++) {
      // on the ground = within 2 cm of it
      if (f.y[i] < 0.02 && f.y[i - 1] < 0.02) {
        moved += Math.abs(f.z[i] - f.z[i - 1]);
        time += dt;
      }
    }
  }
  expect(time).toBeGreaterThan(0.5);
  return moved / time;
}

describe('dinosaur animation', () => {
  it('stands every dinosaur with its feet on the ground', () => {
    const p = new THREE.Vector3();
    for (const [name, rig] of rigs()) {
      animateDino(rig, 0.016, 0, 'idle', 0);
      rig.root.updateMatrixWorld(true);
      for (const leg of rig.legs) {
        leg.foot.getWorldPosition(p);
        expect(Math.abs(p.y), `${name} foot height`).toBeLessThan(0.015);
      }
    }
  });

  it('plants the feet while running – they do not slide over the ground', () => {
    for (const v of [5, 12]) {
      for (const [name, rig] of rigs()) {
        const slip = slipSpeed(rig, v);
        // the old sine swing slid at 4–70 % of the running speed
        expect(slip / v, `${name} at ${v} m/s`).toBeLessThan(0.08);
      }
    }
  });
});
