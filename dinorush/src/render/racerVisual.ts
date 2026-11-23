import * as THREE from 'three';
import { ARCHETYPES, ARCHETYPE_INFO, DINO_BY_ID, STARTER_LINEUP } from '../config/dinosaurs';
import { TERRAINS } from '../config/terrain';
import type { Archetype, RaceParticipant, TerrainId } from '../types';
import { animateDino, createDino, type DinoAnimMode, type DinoRig } from './dinoModels';
import type { Particles } from './particles';
import { nameTagTexture } from './textures';
import { basicMat, clamp01, disposeObject, easeOutBack, GEO, mesh } from './util';

/** Visual sink depth (relative to hip height) & animation mode on a terrain. */
export function terrainPose(arch: Archetype, terrain: TerrainId, hip: number): { mode: DinoAnimMode; sink: number } {
  const t = TERRAINS[terrain];
  const best = t.best === arch;
  if (terrain === 'bridge') return { mode: 'run', sink: -0.62 };
  switch (t.category) {
    case 'water': {
      const deep = terrain === 'deepWater';
      if (arch === 'spino') return { mode: 'swim', sink: hip * (deep ? 0.95 : 0.82) };
      return { mode: 'wade', sink: hip * (deep ? 0.55 : 0.38) };
    }
    case 'rough':
      if (terrain === 'ice') return { mode: best ? 'run' : arch === 'raptor' ? 'slip' : 'mud', sink: 0 };
      if (best) return { mode: 'run', sink: hip * (terrain === 'mud' ? 0.08 : 0.04) };
      return { mode: 'mud', sink: hip * (terrain === 'mud' ? 0.22 : 0.14) };
    default:
      return { mode: 'run', sink: 0 };
  }
}

/**
 * One racer on screen: four pre-built dino models (only the active one is
 * visible), player ring, name tag and transformation / ability effects.
 */
export class RacerVisual {
  readonly group = new THREE.Group();
  readonly rigs: Record<Archetype, DinoRig>;
  private ring: THREE.Mesh;
  private shadow: THREE.Mesh;
  private tag: THREE.Sprite;
  private aura: THREE.Mesh;
  private flash: THREE.Mesh;
  private current: Archetype;
  private previous: Archetype | null = null;
  private transformT = 1;
  private sink = 0;
  private dustTimer = 0;
  private trailTimer = 0;
  readonly color: string;
  private useBlob = true;

  constructor(p: RaceParticipant, showTag: boolean, castShadows = false) {
    this.color = p.color;
    this.rigs = {} as Record<Archetype, DinoRig>;
    for (const a of ARCHETYPES) {
      const lo = p.loadout[a];
      const def = DINO_BY_ID[lo.defId] ?? DINO_BY_ID[STARTER_LINEUP[a]];
      const rig = createDino(def.model ?? def.archetype, def.palette, lo.accessory);
      rig.root.visible = a === p.current;
      if (castShadows) rig.root.traverse((o) => (o.castShadow = true));
      this.rigs[a] = rig;
      this.group.add(rig.root);
    }
    this.current = p.current;
    const col = new THREE.Color(p.color).getHex();
    this.shadow = mesh(GEO.disc(), basicMat(0x000000, { opacity: 0.25, depthWrite: false }), [0, 0.07, 0], [1.2, 1, 2.0]);
    this.ring = mesh(GEO.ring(), basicMat(col, { opacity: 0.75 }), [0, 0.08, 0], [1.05, 1, 1.05]);
    this.aura = mesh(GEO.ring(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }), [0, 0.1, 0], [1.8, 1, 1.8]);
    this.flash = mesh(GEO.smoothSphere(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }), [0, 1, 0], 1);
    this.flash.visible = false;
    this.group.add(this.shadow, this.ring, this.aura, this.flash);
    this.useBlob = !castShadows;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTagTexture(p.name, p.color), depthWrite: false, depthTest: false }));
    this.tag.scale.set(2.0, 0.56, 1);
    this.tag.position.y = this.rigs[p.current].height + 0.55;
    this.tag.visible = showTag;
    this.tag.renderOrder = 20;
    this.group.add(this.tag);
  }

  get activeRig(): DinoRig {
    return this.rigs[this.current];
  }

  startTransform(to: Archetype, particles: Particles | null, worldPos: THREE.Vector3) {
    if (to === this.current) return;
    this.previous = this.current;
    this.current = to;
    this.transformT = 0;
    const rig = this.rigs[to];
    rig.root.visible = true;
    rig.root.scale.setScalar(0.01);
    const c = new THREE.Color(ARCHETYPE_INFO[to].color).getHex();
    (this.flash.material as THREE.MeshBasicMaterial).color.setHex(c);
    this.flash.visible = true;
    if (particles) {
      particles.emit('sparkle', worldPos.x, worldPos.y + 1, worldPos.z, { count: 18, color: [c, 0xffffff, 0xffe066] });
      particles.emit('ring', worldPos.x, worldPos.y + 0.3, worldPos.z, { color: c });
    }
  }

  update(dt: number, time: number, p: RaceParticipant, terrain: TerrainId, phase: 'countdown' | 'racing' | 'finished', particles: Particles | null, reduced: boolean) {
    // transformation animation
    if (this.transformT < 1) {
      this.transformT = Math.min(1, this.transformT + dt / 0.4);
      const t = this.transformT;
      if (this.previous) {
        const old = this.rigs[this.previous];
        const s = Math.max(0.01, 1 - clamp01(t / 0.45));
        old.root.scale.set(s, s * (1 + (1 - s) * 0.4), s);
        if (t >= 0.45) old.root.visible = false;
      }
      const ns = Math.max(0.01, easeOutBack(clamp01((t - 0.15) / 0.85)));
      this.rigs[this.current].root.scale.setScalar(ns);
      const fm = this.flash.material as THREE.MeshBasicMaterial;
      fm.opacity = Math.max(0, 0.6 * (1 - t));
      this.flash.scale.setScalar(0.8 + t * 1.8);
      if (t >= 1) {
        this.flash.visible = false;
        if (this.previous) this.rigs[this.previous].root.visible = false;
        for (const a of ARCHETYPES) if (a !== this.current) this.rigs[a].root.visible = false;
      }
    }

    const rig = this.rigs[this.current];
    let { mode, sink } = terrainPose(this.current, terrain, rig.hipHeight);
    if (phase === 'countdown') mode = 'idle';
    if (p.bump > 0) {
      if (p.bumpKind === 'climb') mode = 'climb';
      else mode = 'smash';
    }
    if (p.finished && p.speed < 4) mode = 'celebrate';
    this.sink += (sink - this.sink) * Math.min(1, dt * 6);
    const tagY = rig.height + 0.55 - Math.max(0, this.sink) * 0.6 + Math.max(0, -this.sink);
    this.tag.position.y += (tagY - this.tag.position.y) * Math.min(1, dt * 8);
    this.ring.position.y = this.shadow.position.y = 0.08 + Math.max(0, -this.sink);
    for (const a of ARCHETYPES) {
      const r = this.rigs[a];
      if (!r.root.visible) continue;
      r.root.position.y = -this.sink;
      animateDino(r, dt, p.speed, a === this.current ? mode : 'run', time);
    }
    this.shadow.visible = this.useBlob && this.sink < 0.25;

    // ability aura & boosts
    const am = this.aura.material as THREE.MeshBasicMaterial;
    if (p.ability) {
      am.color.set(ARCHETYPE_INFO[p.ability.archetype].color);
      am.opacity = 0.55 + Math.sin(time * 14) * 0.25;
      const s = 1.6 + Math.sin(time * 10) * 0.15;
      this.aura.scale.set(s, 1, s);
    } else if (p.turbo > 0 || p.perfectBoost > 0 || p.teamTurbo > 0) {
      am.color.set(p.perfectBoost > 0 ? '#ffd32a' : '#ffffff');
      am.opacity = 0.4;
      this.aura.scale.set(1.5, 1, 1.5);
    } else {
      am.opacity = Math.max(0, am.opacity - dt * 3);
    }

    // ground particles
    if (!particles || phase !== 'racing' || p.speed < 1) return;
    const wp = new THREE.Vector3();
    this.group.getWorldPosition(wp);
    this.dustTimer += dt * (reduced ? 0.4 : 1);
    const cat = TERRAINS[terrain].category;
    const interval = cat === 'water' ? 0.07 : 0.11;
    if (this.dustTimer > interval) {
      this.dustTimer = 0;
      if (cat === 'water') particles.emit('splash', wp.x, 0.1, wp.z - 0.6, { count: this.current === 'spino' ? 2 : 4, scale: 0.8 });
      else if (terrain === 'mud') particles.emit('mud', wp.x, 0.1, wp.z + 0.4, { count: 2 });
      else if (terrain === 'snow') particles.emit('dust', wp.x, 0.1, wp.z + 0.5, { count: 2, color: [0xffffff, 0xe8f6ff] });
      else if (terrain === 'ice') {
        if (Math.random() < 0.3) particles.emit('sparkle', wp.x, 0.2, wp.z + 0.3, { count: 1, color: 0xffffff });
      } else if (terrain === 'grass') particles.emit('dust', wp.x, 0.1, wp.z + 0.5, { count: 1, color: [0x9be36a, 0xd9c59a] });
      else particles.emit('dust', wp.x, 0.1, wp.z + 0.5, { count: 2 });
    }
    this.trailTimer += dt;
    if ((p.ability || p.turbo > 0 || p.perfectBoost > 0 || p.teamTurbo > 0) && this.trailTimer > 0.05) {
      this.trailTimer = 0;
      const color = p.ability ? new THREE.Color(ARCHETYPE_INFO[p.ability.archetype].color).getHex() : 0xffffff;
      if (p.ability?.id === 'waterWave') particles.emit('splash', wp.x, 0.3, wp.z, { count: 6, scale: 1.4 });
      else particles.emit('sparkle', wp.x + (Math.random() - 0.5) * 1.2, 0.6 + Math.random(), wp.z + 1.2, { count: 1, color: [color, 0xffffff], dirZ: 4 });
    }
    if (rig.effect !== 'none' && Math.random() < dt * 3) {
      const col = rig.effect === 'frost' ? 0xd9f4ff : rig.effect === 'gold' ? 0xffd32a : 0xffffff;
      particles.emit('sparkle', wp.x, 1.2, wp.z, { count: 1, color: rig.effect === 'rainbow' ? [0xff6bcb, 0x7d5fff, 0x32ff7e, 0xffd32a] : col });
    }
  }

  dispose() {
    disposeObject(this.group);
    (this.tag.material as THREE.SpriteMaterial).map?.dispose();
  }
}
