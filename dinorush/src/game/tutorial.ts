import { ARCHETYPE_INFO } from '../config/dinosaurs';
import { TERRAINS } from '../config/terrain';
import type { Archetype, RaceState, TerrainId } from '../types';
import { nextChange } from './track';

export interface TutorialPrompt {
  text: string;
  sub: string;
  target: Archetype | null;
  terrain: TerrainId | null;
  /** Slow motion while waiting for the right tap. */
  waiting: boolean;
}

/**
 * Interactive tutorial on the real engine: when a change is near and the
 * child has not picked the right dino yet, the game slows down and the
 * correct button is highlighted. Steps follow the scripted tutorial track.
 */
export class TutorialDirector {
  private done = new Set<number>();
  private praiseUntil = 0;
  private praise = '';
  private guidedChanges = 4;

  update(state: RaceState, participantId: string): TutorialPrompt | null {
    const p = state.participants.find((x) => x.id === participantId);
    if (!p) return null;
    if (state.phase === 'countdown') {
      return { text: 'Dinosaurus běží sám!', sub: 'Ty jen vybíráš, kdo poběží.', target: null, terrain: null, waiting: false };
    }
    if (state.phase === 'finished' || p.finished) {
      state.timeScale = 1;
      return { text: 'Hotovo! Jsi Dino závodník!', sub: '', target: null, terrain: null, waiting: false };
    }
    const segs = state.track.segments;
    const seg = segs[p.segmentIndex];
    // Step 1: start segment – racer starts as the wrong dino
    if (seg.index === 0 && p.current !== seg.recommended && !this.done.has(0)) {
      state.timeScale = 0.12;
      return this.prompt(seg.terrain, seg.recommended, true);
    }
    if (seg.index === 0 && p.current === seg.recommended && !this.done.has(0)) this.markDone(0, state.time);

    const next = nextChange(state.track, p.segmentIndex);
    if (next && this.done.size < this.guidedChanges + 1 && !this.done.has(next.index)) {
      const ttc = (next.start - p.position) / Math.max(p.speed, 1);
      if (ttc < 1.6) {
        if (p.current === next.recommended) {
          this.markDone(next.index, state.time);
        } else {
          state.timeScale = 0.12;
          return this.prompt(next.terrain, next.recommended, true);
        }
      }
    }
    state.timeScale = 1;
    if (state.time < this.praiseUntil) return { text: this.praise, sub: '', target: null, terrain: null, waiting: false };
    if (this.done.size > this.guidedChanges) {
      const n = next && (next.start - p.position) / Math.max(p.speed, 1) < 2.5 ? next : null;
      return { text: 'Teď už sám!', sub: 'Sleduj značky na trati.', target: n?.recommended ?? null, terrain: n?.terrain ?? null, waiting: false };
    }
    return null;
  }

  private markDone(idx: number, time: number) {
    this.done.add(idx);
    const praises = ['Super!', 'Výborně!', 'Paráda!', 'Bravo!'];
    this.praise = praises[this.done.size % praises.length];
    this.praiseUntil = time + 1.4;
  }

  private prompt(terrain: TerrainId, target: Archetype, waiting: boolean): TutorialPrompt {
    const t = TERRAINS[terrain];
    const info = ARCHETYPE_INFO[target];
    return { text: `${t.name}!`, sub: `Klepni na ${info.accusative}`, target, terrain, waiting };
  }
}
