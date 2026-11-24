// Study Dungeon's second decay policy: the "memory model".
//
// The default policy (policy.ts) doubles the half-life on every right answer and
// halves it on every wrong one, whatever the timing. This one is inspired by
// spaced-repetition research (FSRS, SuperMemo) but is NOT FSRS and is not fitted
// to anyone's data; its constants are hand-picked. It adds two ideas:
//   1. Spacing effect: the later a fact is recalled (the more of it was
//      forgotten), the more a right answer strengthens it. A review while the
//      fact is still fresh adds almost nothing.
//   2. Difficulty: every fact has a difficulty from 1 to 10. Wrong answers raise
//      it, right answers lower it, and harder facts gain less from a right answer.
//
// It uses the same data shape as the default policy (halfLifeDays, plus an
// optional difficulty), so a saved Crypt works under either policy.
// Health decays exactly as before: health x 0.5^(elapsed / half-life).
//
// Pure and synchronous: no clock reads, no side effects (engine-boundary.md).

import type { DecayPolicy } from "@decay-engine/engine"
import {
  DAY_MS,
  FIRST_HALF_LIFE_DAYS,
  HEALTH_AFTER_RIGHT,
  HEALTH_AFTER_WRONG,
  MAX_HALF_LIFE_DAYS,
  MIN_HALF_LIFE_DAYS,
  THRESHOLDS,
  type Fact,
  type FactPayload,
  type FactPolicyData,
  type Knowledge,
  type ReviewEvent,
} from "./policy"

export const FIRST_DIFFICULTY: Record<Knowledge, number> = { new: 7, shaky: 5, solid: 3 }
export const DEFAULT_DIFFICULTY = 5
export const MIN_DIFFICULTY = 1
export const MAX_DIFFICULTY = 10
/** After a wrong answer the half-life becomes this share of what it was. */
export const LAPSE_SHARE = 0.4
/** Hand-picked strength of the spacing effect. */
export const SPACING_GAIN = 1.6

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const difficultyOf = (item: Fact) => item.policyData.difficulty ?? DEFAULT_DIFFICULTY

/**
 * The half-life after a right answer. `recalled` is 0 to 1: how much of the
 * fact was still there at the review (health / 100).
 */
export function grownHalfLife(halfLifeDays: number, difficulty: number, recalled: number): number {
  const forgotten = 1 - clamp(recalled, 0, 1)
  const ease = (11 - difficulty) / 10
  const spacing = Math.exp(0.9 * forgotten) - 1
  const growth = 1 + SPACING_GAIN * ease * Math.pow(halfLifeDays, -0.2) * spacing * 3
  return clamp(halfLifeDays * growth, MIN_HALF_LIFE_DAYS, MAX_HALF_LIFE_DAYS)
}

export const memoryPolicy: DecayPolicy<FactPayload, FactPolicyData, ReviewEvent> = {
  thresholds: { weak: THRESHOLDS.weak, dead: THRESHOLDS.dead },

  init(payload: FactPayload, _now: number): FactPolicyData {
    const days = FIRST_HALF_LIFE_DAYS[payload.knowledge]
    const difficulty = FIRST_DIFFICULTY[payload.knowledge]
    if (days === undefined || difficulty === undefined) {
      throw new Error(
        `memoryPolicy.init: unknown knowledge level ${JSON.stringify(payload.knowledge)}; expected "new", "shaky" or "solid"`
      )
    }
    return { halfLifeDays: days, difficulty }
  },

  healthAt(item: Fact, now: number): number {
    const elapsed = Math.max(0, now - item.lastEventAt)
    return item.health * Math.pow(0.5, elapsed / (item.policyData.halfLifeDays * DAY_MS))
  },

  applyEvent(item: Fact, event: ReviewEvent, _now: number) {
    const days = item.policyData.halfLifeDays
    const difficulty = difficultyOf(item)
    if (event.correct) {
      return {
        health: HEALTH_AFTER_RIGHT,
        policyData: {
          halfLifeDays: grownHalfLife(days, difficulty, item.health / 100),
          difficulty: clamp(difficulty - 0.3, MIN_DIFFICULTY, MAX_DIFFICULTY),
        },
      }
    }
    return {
      health: HEALTH_AFTER_WRONG,
      policyData: {
        halfLifeDays: clamp(days * LAPSE_SHARE, MIN_HALF_LIFE_DAYS, MAX_HALF_LIFE_DAYS),
        difficulty: clamp(difficulty + 1, MIN_DIFFICULTY, MAX_DIFFICULTY),
      },
    }
  },

  nextDueAt(item: Fact, now: number): number | null {
    if (item.state === "dead") return null
    if (this.healthAt(item, now) < THRESHOLDS.weak) return now
    return item.lastEventAt + item.policyData.halfLifeDays * DAY_MS * Math.log2(item.health / THRESHOLDS.weak)
  },

  resurrect(_item: Fact, event: ReviewEvent, _now: number) {
    if (event.correct) return { ok: true }
    return { ok: false, reason: "You got it wrong. The fact stays dead." }
  },
}
