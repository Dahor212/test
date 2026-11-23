import * as THREE from 'three';
import { ARCHETYPES, DINO_BY_ID, STARTER_LINEUP } from '../config/dinosaurs';
import type { GhostPlayer } from '../game/ghost';
import type { Archetype, TrackDefinition } from '../types';
import { animateDino, createDino, ROLE_MODEL, type DinoRig } from './dinoModels';
import { terrainPose } from './racerVisual';
import { nameTagTexture } from './textures';
import { disposeObject } from './util';

/**
 * The player's earlier best run: a translucent, softly glowing dinosaur
 * that replays the recorded positions and transformations.
 */
export class GhostVisual {
  readonly group = new THREE.Group();
  private rigs: Record<Archetype, DinoRig>;
  private current: Archetype = 'raptor';
  private material: THREE.MeshLambertMaterial;
  private tag: THREE.Sprite;
  private segHint = 0;
  private sink = 0;

  constructor(private ghost: GhostPlayer) {
    this.material = new THREE.MeshLambertMaterial({
      color: 0xe8f6ff,
      emissive: 0x6ec1ff,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.rigs = {} as Record<Archetype, DinoRig>;
    for (const a of ARCHETYPES) {
      const rig = createDino(ROLE_MODEL[a], DINO_BY_ID[STARTER_LINEUP[a]].palette, null);
      rig.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const old = m.material;
        (Array.isArray(old) ? old : [old]).forEach((x) => x.dispose());
        m.material = this.material;
        m.castShadow = false;
        m.renderOrder = 5;
      });
      rig.root.visible = false;
      this.rigs[a] = rig;
      this.group.add(rig.root);
    }
    this.current = ghost.archAt(0);
    this.rigs[this.current].root.visible = true;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTagTexture('Duch', '#5fb4ff'), depthWrite: false, depthTest: false, transparent: true, opacity: 0.85 }));
    this.tag.scale.set(1.8, 0.5, 1);
    this.tag.renderOrder = 19;
    this.group.add(this.tag);
  }

  /** Is the ghost a flyer at race time t? */
  flying(t: number): boolean {
    return this.ghost.archAt(t) === 'ptero';
  }

  /** Position on the track at race time t (metres). */
  positionAt(t: number): number {
    return this.ghost.positionAt(t);
  }

  update(dt: number, time: number, raceTime: number, track: TrackDefinition, running: boolean) {
    const pos = this.ghost.positionAt(raceTime);
    const arch = this.ghost.archAt(raceTime);
    if (arch !== this.current) {
      this.rigs[this.current].root.visible = false;
      this.current = arch;
      this.rigs[arch].root.visible = true;
    }
    const segs = track.segments;
    let i = Math.min(this.segHint, segs.length - 1);
    while (i < segs.length - 1 && pos >= segs[i].end) i++;
    while (i > 0 && pos < segs[i].start) i--;
    this.segHint = i;
    const rig = this.rigs[this.current];
    const pose = terrainPose(this.current, segs[i].terrain, rig.hipHeight);
    this.sink += (pose.sink - this.sink) * Math.min(1, dt * 6);
    rig.root.position.y = -this.sink;
    const speed = running ? this.ghost.speedAt(raceTime) : 0;
    animateDino(rig, dt, speed, running ? (speed < 1 && raceTime > this.ghost.finishTime ? 'celebrate' : pose.mode) : 'idle', time);
    this.tag.position.y = rig.height + 0.45 - Math.max(0, this.sink) * 0.6 + Math.max(0, -this.sink);
    // gentle shimmer
    this.material.opacity = 0.52 + Math.sin(time * 3.1) * 0.06;
  }

  dispose() {
    disposeObject(this.group);
    this.material.dispose();
    (this.tag.material as THREE.SpriteMaterial).map?.dispose();
  }
}
