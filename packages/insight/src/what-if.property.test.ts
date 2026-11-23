// Properties P-B, P-C1, P-C2, P-C3, P-D and P-E for whatIf (requirements.md,
// "Correctness properties"; design sections 6 and 7.4). Valid and invalid
// times `at` are chosen from the lives in replay()'s history of a generated
// scenario.

import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { MAX_TIMESTAMP } from "@decay-engine/engine"
import { replay } from "./replay"
import { whatIf } from "./what-if"
import { DEATH_TIME_PRECISION_MS } from "./types"
import type { ReplayResult, WhatIfResult } from "./types"
import { DAY, T0, deepFreeze, findNonJson } from "./test/fixtures"
import type { CountData, TestPayload } from "./test/policies"
import { livesOf, pick, runScenario, scenarioArb } from "./test/scenario"
import type { Life, ScenarioRun } from "./test/scenario"

const P = DEATH_TIME_PRECISION_MS
const RUNS = { numRuns: 100 }
const fraction = fc.integer({ min: 0, max: 1_000_000 })

function okReplay<P2, D>(r: ReplayResult<P2, D>) {
  expect(r.ok, r.ok ? "" : JSON.stringify(r.reason)).toBe(true)
  if (!r.ok) throw new Error("unreachable: asserted ok above")
  return r
}

function okWhatIf<P2, D>(r: WhatIfResult<P2, D>) {
  expect(r.ok, r.ok ? "" : JSON.stringify(r.reason)).toBe(true)
  if (!r.ok) throw new Error("unreachable: asserted ok above")
  return r
}

function expectJson(r: unknown) {
  expect(findNonJson(r)).toBeNull()
  expect(JSON.parse(JSON.stringify(r))).toEqual(r)
}

/** The baseline replay and the lives with room for a valid `at`: (start, death − P). */
function validLives(run: ScenarioRun): { lives: Life[] } {
  const base = okReplay<TestPayload, CountData>(replay(run.policy, run.item, run.history, { until: run.end }))
  const lives = livesOf(base.history, base.diesAt).filter(
    (l) => l.death !== null && l.start + 1 <= l.death - P - 1
  )
  return { lives }
}

/** The life's last replayed event at or before `at`: its start or a tend. */
function lastEventBefore(life: Life, at: number): number {
  return life.tends.filter((t) => t <= at).reduce((a, t) => (t > a ? t : a), life.start)
}

/** `a` is not earlier than `b` by P or more; null means "does not die", later than any time. */
function expectNotEarlier(a: number | null, b: number | null) {
  if (b === null) {
    expect(a).toBeNull()
  } else if (a !== null) {
    expect(a).toBeGreaterThan(b - P)
  }
}

describe("P-B: whatIf is deterministic and changes nothing", () => {
  it("two calls give equal results and the inputs are unchanged", () => {
    fc.assert(
      fc.property(scenarioArb, fraction, (s, u) => {
        const run = runScenario(s)
        const item = deepFreeze(run.item)
        const history = deepFreeze(run.history)
        const itemBefore = JSON.stringify(item)
        const historyBefore = JSON.stringify(history)
        const at = pick(T0 - DAY, run.end + DAY, u)

        const first = whatIf(run.policy, item, history, { at, event: "good" })
        const second = whatIf(run.policy, item, history, { at, event: "good" })
        expect(second).toEqual(first)
        expect(JSON.stringify(item)).toBe(itemBefore)
        expect(JSON.stringify(history)).toBe(historyBefore)
      }),
      RUNS
    )
  })
})

describe("P-C: whatIf with a good event", () => {
  it("P-C1 never earlier by the precision or more, and P-C2 strictly later when nothing else resets", () => {
    let total = 0
    let strict = 0
    fc.assert(
      fc.property(scenarioArb, fc.nat(), fraction, fc.boolean(), (s, lifeIndex, u, afterLast) => {
        const run = runScenario(s)
        const { lives } = validLives(run)
        fc.pre(lives.length > 0)
        const life = lives[lifeIndex % lives.length]!
        const hi = life.death! - P - 1
        const lo = life.start + 1
        const lastTend = life.tends.reduce((a, t) => (t > a ? t : a), life.start)
        const loStrict = Math.max(lo, lastTend + P + 1)
        const at = afterLast && loStrict <= hi ? pick(loStrict, hi, u) : pick(lo, hi, u)

        const w = okWhatIf(whatIf(run.policy, run.item, run.history, { at, event: "good" }))
        expectJson(w)
        expect(w.baselineDiesAt).not.toBeNull()

        // P-C1
        expectNotEarlier(w.diesAt, w.baselineDiesAt)

        // P-C2: no recorded tend of this life after `at`, and `at` more than P after the life's last event
        total++
        const noTendAfter = life.tends.every((t) => t <= at)
        if (noTendAfter && at - lastEventBefore(life, at) > P) {
          strict++
          if (w.diesAt !== null) expect(w.diesAt).toBeGreaterThan(w.baselineDiesAt!)
        }
      }),
      RUNS
    )
    expect(total).toBeGreaterThan(0)
    expect(strict / total).toBeGreaterThanOrEqual(0.2)
  })

  it("P-C3 a later `at` in the same life never gives an earlier death, beyond the precision", () => {
    fc.assert(
      fc.property(scenarioArb, fc.nat(), fraction, fraction, (s, lifeIndex, u1, u2) => {
        const run = runScenario(s)
        const { lives } = validLives(run)
        fc.pre(lives.length > 0)
        const life = lives[lifeIndex % lives.length]!
        const lo = life.start + 1
        const hi = life.death! - P - 1
        const [a1, a2] = [pick(lo, hi, u1), pick(lo, hi, u2)].sort((x, y) => x - y) as [number, number]

        const w1 = okWhatIf(whatIf(run.policy, run.item, run.history, { at: a1, event: "good" }))
        const w2 = okWhatIf(whatIf(run.policy, run.item, run.history, { at: a2, event: "good" }))
        expectNotEarlier(w2.diesAt, w1.diesAt)
      }),
      RUNS
    )
  })
})

describe("P-D: an invalid `at` gives a typed reason", () => {
  it("before or at creation: at-not-after-creation", () => {
    fc.assert(
      fc.property(scenarioArb, fraction, (s, u) => {
        const run = runScenario(s)
        const at = T0 - pick(0, 30 * DAY, u)
        const w = whatIf(run.policy, run.item, run.history, { at, event: "good" })
        expect(w).toEqual({ ok: false, reason: { code: "at-not-after-creation", at, createdAt: T0 } })
        expectJson(w)
      }),
      RUNS
    )
  })

  it("at or after a death and before the next resurrection, or after the final death: at-item-dead", () => {
    fc.assert(
      fc.property(scenarioArb, fc.nat(), fraction, (s, lifeIndex, u) => {
        const run = runScenario(s)
        const base = okReplay(replay(run.policy, run.item, run.history, { until: run.end }))
        // Only deaths that are in the replay's history (died entries), not forecasts
        const dead = livesOf(base.history, null).filter((l) => l.death !== null)
        fc.pre(dead.length > 0)
        const life = dead[lifeIndex % dead.length]!
        const death = life.death!
        const end = life.nextStart === null ? death + 30 * DAY : life.nextStart - 1
        fc.pre(death <= end)
        const at = pick(death, end, u)

        const w = whatIf(run.policy, run.item, run.history, { at, event: "good" })
        expect(w).toMatchObject({ ok: false, reason: { code: "at-item-dead", at } })
        if (w.ok || w.reason.code !== "at-item-dead") throw new Error("unreachable: asserted above")
        expect(Math.abs(w.reason.diedAt - death)).toBeLessThanOrEqual(P)
        expectJson(w)
      }),
      RUNS
    )
  })

  it("values that are not a time: invalid-at", () => {
    const values: unknown[] = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, MAX_TIMESTAMP + 1, "soon"]
    fc.assert(
      fc.property(scenarioArb, fc.constantFrom(...values), (s, at) => {
        const run = runScenario(s)
        const w = whatIf(run.policy, run.item, run.history, { at: at as number, event: "good" })
        expect(w).toMatchObject({ ok: false, reason: { code: "invalid-at" } })
        expectJson(w)
      }),
      RUNS
    )
  })
})

describe("P-E: whatIf results are JSON", () => {
  it("every result, ok or not, survives a JSON round trip with nothing undefined", () => {
    fc.assert(
      fc.property(scenarioArb, fraction, fc.constantFrom<"good" | "bad">("good", "bad"), (s, u, event) => {
        const run = runScenario(s)
        const at = pick(T0 - DAY, run.end + 30 * DAY, u)
        expectJson(whatIf(run.policy, run.item, run.history, { at, event }))
      }),
      RUNS
    )
  })
})
