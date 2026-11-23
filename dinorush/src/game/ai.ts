import { AI_PROFILES } from '../config/difficulty';
import { CLASSIC_ROLES } from '../config/dinosaurs';
import { Rng } from '../core/rng';
import type { AIProfile, AIProfileId, Archetype, RaceParticipant, RaceState } from '../types';
import { nextChange } from './track';

interface Plan {
  segIndex: number;
  target: Archetype;
  correct: boolean;
  /** Earliest race time the switch may happen (reaction). */
  earliest: number;
  /** Desired time-to-segment (seconds) at switch; negative = after entering. */
  aimTtc: number;
  done: boolean;
}

export interface AIContext {
  state: RaceState;
  warningDistance(p: RaceParticipant): number;
  requestSwitch(id: string, a: Archetype): boolean;
}

/**
 * Computer opponent. Uses exactly the same inputs as a human (requestSwitch)
 * and only sees what a human sees (warnings inside the warning window).
 * No rubber-banding – mistakes come from the profile's accuracy.
 */
export class AIController {
  readonly profile: AIProfile;
  private rng: Rng;
  private plan: Plan | null = null;
  private recoverAt: number | null = null;
  private recoverSeg = -1;
  decisions = 0;
  correctDecisions = 0;

  constructor(profileId: AIProfileId, seed: number) {
    this.profile = AI_PROFILES[profileId];
    this.rng = new Rng(seed);
  }

  update(ctx: AIContext, p: RaceParticipant) {
    const { state } = ctx;
    this.roles = state.config.roles ?? CLASSIC_ROLES;
    if (p.finished || state.phase !== 'racing') return;
    const track = state.track;
    const seg = track.segments[p.segmentIndex];
    if (!seg) return;
    const now = state.time;

    // 1) Plan for the next change point once it becomes visible.
    const next = nextChange(track, p.segmentIndex);
    if (next) {
      const dist = next.start - p.position;
      if (dist <= ctx.warningDistance(p) && (!this.plan || this.plan.segIndex !== next.index)) {
        this.makePlan(next.index, next.recommended, p, now);
      }
    }

    // 2) Execute plan.
    const plan = this.plan;
    if (plan && !plan.done) {
      const target = track.segments[plan.segIndex];
      // Dynamic events may change the target segment – re-evaluate.
      if (plan.correct && target.recommended !== plan.target) plan.target = target.recommended;
      const speed = Math.max(p.speed, 1);
      const ttc = (target.start - p.position) / speed;
      if (now >= plan.earliest && ttc <= plan.aimTtc) {
        if (p.current === plan.target || ctx.requestSwitch(p.id, plan.target)) plan.done = true;
      }
      if (p.segmentIndex > plan.segIndex + 0) {
        // passed the segment entirely – drop the plan
        if (p.segmentIndex > plan.segIndex) plan.done = true;
      }
    }

    // 3) Recover from mistakes inside the current segment.
    if (p.current !== seg.recommended && !p.prepared) {
      const planCoversCurrent = plan && !plan.done && plan.segIndex === seg.index;
      if (!planCoversCurrent) {
        if (this.recoverSeg !== seg.index) {
          this.recoverSeg = seg.index;
          this.recoverAt = now + this.rng.range(this.profile.recovery[0], this.profile.recovery[1]);
        }
        if (this.recoverAt !== null && now >= this.recoverAt) {
          if (ctx.requestSwitch(p.id, seg.recommended)) this.recoverAt = null;
        }
      }
    }
  }

  /** Dinosaur roles of the race (set on every update). */
  private roles: Archetype[] = CLASSIC_ROLES;

  private makePlan(segIndex: number, recommended: Archetype, p: RaceParticipant, now: number) {
    const prof = this.profile;
    const correct = this.rng.chance(prof.accuracy);
    this.decisions++;
    if (correct) this.correctDecisions++;
    let target: Archetype = recommended;
    if (!correct) {
      const others = this.roles.filter((a) => a !== recommended);
      // Half of the mistakes are "didn't notice" (keep current dino).
      target = this.rng.chance(0.5) && p.current !== recommended ? p.current : this.rng.pick(others);
    }
    const reaction = this.rng.range(prof.reaction[0], prof.reaction[1]);
    let aimTtc: number;
    if (this.rng.chance(prof.perfectSkill)) {
      aimTtc = this.rng.range(0.25, 0.85); // inside the perfect window
    } else if (this.rng.chance(0.6)) {
      aimTtc = 99; // as soon as reaction allows (early, still counts as correct)
    } else {
      aimTtc = -this.rng.range(0.4, 1.0); // late
    }
    this.plan = { segIndex, target, correct, earliest: now + reaction, aimTtc, done: false };
    this.recoverSeg = -1;
  }
}
