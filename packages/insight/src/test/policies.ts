// Small test policies for Insight's tests. A package cannot import an app's
// policy, so these stand in for one. Source: .kiro/specs/insight/design.md
// (sections 6.3 and 7.1). All pure and synchronous, no clock.
//
// The numbers below are only in the tests. Insight's library files never
// compute health or a death time.

import type { DecayPolicy } from "@decay-engine/engine"
import { DAY } from "./fixtures"

export type TestPayload = { label: string }
export type TestEvent = "good" | "bad"
export type CountData = { tends: number; lives: number }

/** expPolicy's half-life: 3 days. From 100 it dies after 3 × log2(10) ≈ 9.9658 days. */
export const EXP_HALF_LIFE_MS = 3 * DAY
/** linearPolicy loses 7 health per day. From 100 it dies after 80 / 7 ≈ 11.4286 days. */
export const LINEAR_RATE_PER_DAY = 7

function resurrectCounting(
  lives: number,
  event: TestEvent
): { ok: true; policyData: CountData } | { ok: false; reason: string } {
  return event === "good"
    ? { ok: true, policyData: { tends: 0, lives: lives + 1 } }
    : { ok: false, reason: "wrong answer" }
}

/** Halves every 3 days. Good sets 100, bad halves the current health. */
export const expPolicy: DecayPolicy<TestPayload, CountData, TestEvent> = {
  thresholds: { weak: 60, dead: 10 },
  init: () => ({ tends: 0, lives: 1 }),
  healthAt: (item, now) => item.health * Math.pow(2, -(now - item.lastEventAt) / EXP_HALF_LIFE_MS),
  applyEvent: (item, event) => ({
    health: event === "good" ? 100 : item.health / 2,
    policyData: { tends: item.policyData.tends + 1, lives: item.policyData.lives },
  }),
  nextDueAt: (item) => item.lastEventAt + DAY,
  resurrect: (item, event) => resurrectCounting(item.policyData.lives, event),
}

/** Loses 7 per day in a straight line. Good sets 100, bad takes 20 off. */
export const linearPolicy: DecayPolicy<TestPayload, CountData, TestEvent> = {
  thresholds: { weak: 50, dead: 20 },
  init: () => ({ tends: 0, lives: 1 }),
  healthAt: (item, now) =>
    Math.max(0, item.health - (LINEAR_RATE_PER_DAY * (now - item.lastEventAt)) / DAY),
  applyEvent: (item, event) => ({
    health: event === "good" ? 100 : Math.max(0, item.health - 20),
    policyData: { tends: item.policyData.tends + 1, lives: item.policyData.lives },
  }),
  nextDueAt: (item) => item.lastEventAt + DAY,
  resurrect: (item, event) => resurrectCounting(item.policyData.lives, event),
}

export type CrammingData = { lastReviewAt: number }

/**
 * Not monotone (design section 6.3). Loses 10 per day. A review sets 100 if at
 * least a day passed since the last review, otherwise it takes 30 off.
 */
export const crammingPolicy: DecayPolicy<TestPayload, CrammingData, "review"> = {
  thresholds: { weak: 60, dead: 10 },
  init: (_payload, now) => ({ lastReviewAt: now }),
  healthAt: (item, now) => Math.max(0, item.health - (10 * (now - item.lastEventAt)) / DAY),
  applyEvent: (item, _event, now) => ({
    health: now - item.policyData.lastReviewAt >= DAY ? 100 : Math.max(0, item.health - 30),
    policyData: { lastReviewAt: now },
  }),
  nextDueAt: () => null,
  resurrect: (_item, _event, now) => ({ ok: true, policyData: { lastReviewAt: now } }),
}

export type HalfLifePayload = { halfLifeDays: number }

/** Like expPolicy, but the half-life is read from the payload (for limit L1). */
export const payloadHalfLifePolicy: DecayPolicy<HalfLifePayload, Record<string, never>, TestEvent> = {
  thresholds: { weak: 60, dead: 10 },
  init: () => ({}),
  healthAt: (item, now) =>
    item.health * Math.pow(2, -(now - item.lastEventAt) / (item.payload.halfLifeDays * DAY)),
  applyEvent: (item, event) => ({ health: event === "good" ? 100 : item.health / 2, policyData: {} }),
  nextDueAt: () => null,
  resurrect: () => ({ ok: true }),
}

/** Like expPolicy, but applyEvent throws: a policy bug that replay must let through. */
export const throwingPolicy: DecayPolicy<TestPayload, Record<string, never>, TestEvent> = {
  thresholds: { weak: 60, dead: 10 },
  init: () => ({}),
  healthAt: (item, now) => item.health * Math.pow(2, -(now - item.lastEventAt) / EXP_HALF_LIFE_MS),
  applyEvent: () => {
    throw new Error("policy bug")
  },
  nextDueAt: () => null,
  resurrect: () => ({ ok: true }),
}
