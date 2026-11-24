// Study Dungeon decay policy.
// Source of truth: .kiro/specs/study-dungeon/requirements.md (Requirements 1-4)
// and design.md (Policy Implementation).
//
// Written by Claude Code, outside Kiro, at the developer's request (it was planned
// as hand-written); the rules come from the spec. See .kiro/steering/authorship.md.
//
// Rules:
// - Health halves every half-life since the item's last stored health.
// - A right answer restores health to 100 and doubles the half-life.
// - A wrong answer sets health to 45 and halves the half-life.
// - The half-life always stays between 1 and 180 days.
// - A dead fact comes back only with a right answer, keeping the half-life
//   it had when it died (nothing changes policyData after death).
//
// Pure and synchronous: no clock reads, no side effects (engine-boundary.md).

import type { DecayPolicy, Item } from "@decay-engine/engine"

export type Knowledge = "new" | "shaky" | "solid"

export type FactPayload = {
  question: string // required, max 140 characters (checked by the form)
  answer: string // required, max 140 characters (checked by the form)
  why: string // optional epitaph, max 80 characters; "" when not given
  knowledge: Knowledge // how well the user knew it when adding; sets the first half-life
}

export type FactPolicyData = {
  halfLifeDays: number // current half-life, always 1..180
  difficulty?: number // 1..10, kept only by the memory model (policy-memory.ts); absent for the doubling policy
}

export type ReviewEvent = {
  kind: "review"
  correct: boolean
}

export type Fact = Item<FactPayload, FactPolicyData>

export const DAY_MS = 86_400_000
export const MIN_HALF_LIFE_DAYS = 1
export const MAX_HALF_LIFE_DAYS = 180
export const HEALTH_AFTER_RIGHT = 100
export const HEALTH_AFTER_WRONG = 45
export const FIRST_HALF_LIFE_DAYS: Record<Knowledge, number> = {
  new: 2,
  shaky: 5,
  solid: 10,
}
export const THRESHOLDS = { weak: 60, dead: 10 } as const

function clampHalfLife(days: number): number {
  return Math.min(MAX_HALF_LIFE_DAYS, Math.max(MIN_HALF_LIFE_DAYS, days))
}

function halfLifeMs(item: Fact): number {
  return item.policyData.halfLifeDays * DAY_MS
}

export const studyDungeonPolicy: DecayPolicy<FactPayload, FactPolicyData, ReviewEvent> = {
  thresholds: { weak: THRESHOLDS.weak, dead: THRESHOLDS.dead },

  init(payload: FactPayload, _now: number): FactPolicyData {
    const days = FIRST_HALF_LIFE_DAYS[payload.knowledge]
    if (days === undefined) {
      throw new Error(
        `studyDungeonPolicy.init: unknown knowledge level ${JSON.stringify(payload.knowledge)}; expected "new", "shaky" or "solid"`
      )
    }
    return { halfLifeDays: days }
  },

  healthAt(item: Fact, now: number): number {
    // Decays from the stored health, not from 100, so a wrong answer (45)
    // keeps decaying from 45. Elapsed time is never negative, so health never
    // rises above the stored value.
    const elapsed = Math.max(0, now - item.lastEventAt)
    return item.health * Math.pow(0.5, elapsed / halfLifeMs(item))
  },

  applyEvent(item: Fact, event: ReviewEvent, _now: number) {
    const days = item.policyData.halfLifeDays
    if (event.correct) {
      return { health: HEALTH_AFTER_RIGHT, policyData: { halfLifeDays: clampHalfLife(days * 2) } }
    }
    return { health: HEALTH_AFTER_WRONG, policyData: { halfLifeDays: clampHalfLife(days / 2) } }
  },

  nextDueAt(item: Fact, now: number): number | null {
    if (item.state === "dead") return null
    if (this.healthAt(item, now) < THRESHOLDS.weak) return now
    // Solve health × 0.5^(t / halfLife) = 60 for t: t = halfLife × log2(health / 60).
    // Health is at least 60 here, so the result is never before lastEventAt.
    return item.lastEventAt + halfLifeMs(item) * Math.log2(item.health / THRESHOLDS.weak)
  },

  resurrect(_item: Fact, event: ReviewEvent, _now: number) {
    if (event.correct) {
      // policyData still holds the half-life at death; the engine keeps it.
      return { ok: true }
    }
    return { ok: false, reason: "You got it wrong. The fact stays dead." }
  },
}
