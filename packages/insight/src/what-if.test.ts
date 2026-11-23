// whatIf: outcome tests (Requirements 6 and 7; design sections 5, 6.3 and 7.5).
// Expected times are worked out here from the test policies' rules; the
// library itself never does this.

import { describe, expect, it } from "vitest"
import { DecayEngine, InMemoryAdapter, MAX_TIMESTAMP } from "@decay-engine/engine"
import { whatIf } from "./what-if"
import { DEATH_TIME_PRECISION_MS } from "./types"
import type { WhatIfResult } from "./types"
import { DAY, ITEM_ID, T0, entriesOf, indexOf } from "./test/fixtures"
import { EXP_HALF_LIFE_MS, crammingPolicy, expPolicy } from "./test/policies"
import type { TestEvent } from "./test/policies"

const P = DEATH_TIME_PRECISION_MS
const EXP_LIFE_MS = (EXP_HALF_LIFE_MS * Math.log(10)) / Math.log(2) // 3 × log2(10) days

function expEngine() {
  const engine = new DecayEngine(expPolicy, new InMemoryAdapter(), () => ITEM_ID)
  engine.addItem({ payload: { label: "a" }, importance: 2, costMinutes: 10 }, T0)
  return engine
}

function okResult<P2, D>(r: WhatIfResult<P2, D>) {
  expect(r.ok, r.ok ? "" : JSON.stringify(r.reason)).toBe(true)
  if (!r.ok) throw new Error("unreachable: asserted ok above")
  return r
}

/** c <= t <= c + P, where c is a true crossing time (the engine dates a death at most a minute late). */
function expectDeathNear(t: number | null, c: number) {
  expect(t).not.toBeNull()
  expect(t!).toBeGreaterThanOrEqual(Math.floor(c))
  expect(t!).toBeLessThanOrEqual(c + P)
}

describe("whatIf: one extra good tend", () => {
  it("never tended, extra good tend on day 5: dies about 9.97 days after day 5", () => {
    const engine = expEngine()
    engine.tick(T0 + 20 * DAY)
    const history = engine.history(ITEM_ID)
    const item = engine.view(T0 + 20 * DAY)[0]!

    const w = okResult(whatIf(expPolicy, item, history, { at: T0 + 5 * DAY, event: "good" }))
    expect(w.at).toBe(T0 + 5 * DAY)
    expectDeathNear(w.diesAt, T0 + 5 * DAY + EXP_LIFE_MS)
    expectDeathNear(w.baselineDiesAt, T0 + EXP_LIFE_MS)
    expect(w.stoppedAt).toBeNull()
    expect(w.skipped).toEqual([])
    expect(w.item.state).toBe("alive")
    expect(w.item.health).toBe(100)
    expect(entriesOf(w.history, "tended").map((e) => [e.timestamp, e.event])).toEqual([[T0 + 5 * DAY, "good"]])
    expect(entriesOf(w.history, "died")).toEqual([])
  })

  it("stops at the next recorded resurrection (next-life)", () => {
    const engine = expEngine()
    engine.tick(T0 + 20 * DAY)
    engine.resurrect(ITEM_ID, "bad", T0 + 20.5 * DAY)
    engine.resurrect(ITEM_ID, "good", T0 + 21 * DAY)
    engine.tick(T0 + 25 * DAY)
    const history = engine.history(ITEM_ID)
    const item = engine.view(T0 + 25 * DAY)[0]!

    const w = okResult(whatIf(expPolicy, item, history, { at: T0 + 2 * DAY, event: "good" }))
    expect(w.stoppedAt).toEqual({
      index: indexOf(history, "resurrected", T0 + 21 * DAY),
      timestamp: T0 + 21 * DAY,
      why: "next-life",
    })
    // The resurrect-failed entry is in the same life (while dead), before the cut
    expect(w.skipped).toEqual([
      {
        index: indexOf(history, "resurrect-failed", T0 + 20.5 * DAY),
        type: "resurrect-failed",
        timestamp: T0 + 20.5 * DAY,
      },
    ])
    expectDeathNear(w.diesAt, T0 + 2 * DAY + EXP_LIFE_MS)
    expectDeathNear(w.baselineDiesAt, T0 + EXP_LIFE_MS)
    expect(entriesOf(w.history, "resurrected")).toEqual([])
  })

  it("lists an edited entry after `at` in the same life as skipped", () => {
    const engine = expEngine()
    engine.edit(ITEM_ID, { costMinutes: 20 }, T0 + 3 * DAY)
    engine.tick(T0 + 20 * DAY)
    const history = engine.history(ITEM_ID)
    const item = engine.view(T0 + 20 * DAY)[0]!

    const w = okResult(whatIf(expPolicy, item, history, { at: T0 + DAY, event: "good" }))
    expect(w.skipped).toEqual([
      { index: indexOf(history, "edited", T0 + 3 * DAY), type: "edited", timestamp: T0 + 3 * DAY },
    ])
    expectDeathNear(w.diesAt, T0 + DAY + EXP_LIFE_MS)
  })
})

describe("whatIf: an extra event that shortens the life", () => {
  it("a bad extra tend on day 5 kills the item before the recorded tend on day 8 (died-before-entry)", () => {
    const engine = expEngine()
    engine.tend(ITEM_ID, "good", T0 + 8 * DAY)
    engine.tick(T0 + 30 * DAY)
    const history = engine.history(ITEM_ID)
    const item = engine.view(T0 + 30 * DAY)[0]!

    const w = okResult(whatIf(expPolicy, item, history, { at: T0 + 5 * DAY, event: "bad" as TestEvent }))
    expect(w.stoppedAt).toEqual({
      index: indexOf(history, "tended", T0 + 8 * DAY),
      timestamp: T0 + 8 * DAY,
      why: "died-before-entry",
    })
    // Health at day 5 is 100 × 2^(−5/3); the bad event halves it; it then falls below 10
    const h = (100 * Math.pow(2, -5 / 3)) / 2
    expectDeathNear(w.diesAt, T0 + 5 * DAY + (EXP_HALF_LIFE_MS * Math.log(h / 10)) / Math.log(2))
    expectDeathNear(w.baselineDiesAt, T0 + 8 * DAY + EXP_LIFE_MS)
    expect(w.diesAt!).toBeLessThan(w.baselineDiesAt!)
    expect(w.item.state).toBe("dead")
    expect(entriesOf(w.history, "died")).toHaveLength(1)
    expect(w.diesAt).toBe(w.item.diedAt)
  })
})

describe("whatIf: a policy that is not monotone (crammingPolicy, design section 6.3)", () => {
  const engine = new DecayEngine(crammingPolicy, new InMemoryAdapter(), () => ITEM_ID)
  engine.addItem({ payload: { label: "a" }, importance: 1, costMinutes: 5 }, T0)
  engine.tend(ITEM_ID, "review", T0 + 2 * DAY)
  engine.tick(T0 + 20 * DAY)
  const history = engine.history(ITEM_ID)
  const item = engine.view(T0 + 20 * DAY)[0]!

  // Each death is strictly after its crossing, because health is exactly 10 at the crossing.
  function expectAfter(t: number | null, c: number) {
    expect(t).not.toBeNull()
    expect(t!).toBeGreaterThan(c)
    expect(t!).toBeLessThanOrEqual(c + P)
  }

  it("the baseline dies 9 days after the review on day 2", () => {
    const w = okResult(whatIf(crammingPolicy, item, history, { at: T0 + DAY / 2, event: "review" }))
    expectAfter(w.baselineDiesAt, T0 + 11 * DAY)
  })

  it("an extra review on day 0.5 changes nothing: the review on day 2 still sets 100", () => {
    const w = okResult(whatIf(crammingPolicy, item, history, { at: T0 + DAY / 2, event: "review" }))
    expectAfter(w.diesAt, T0 + 11 * DAY)
  })

  it("an extra review on day 1.5 makes the day-2 review a cram (65), so it dies on day 7.5, and whatIf still returns ok", () => {
    const early = okResult(whatIf(crammingPolicy, item, history, { at: T0 + DAY / 2, event: "review" }))
    const late = okResult(whatIf(crammingPolicy, item, history, { at: T0 + 1.5 * DAY, event: "review" }))
    expectAfter(late.diesAt, T0 + 7.5 * DAY)
    expect(entriesOf(late.history, "tended").map((e) => e.health)).toEqual([100, 65])
    // A later `at` with an earlier death, and earlier than the baseline: returned as is
    expect(late.diesAt!).toBeLessThan(early.diesAt!)
    expect(late.diesAt!).toBeLessThan(late.baselineDiesAt!)
  })
})

describe("whatIf: typed reasons, never thrown (Requirement 6)", () => {
  const engine = expEngine()
  engine.tick(T0 + 20 * DAY)
  engine.resurrect(ITEM_ID, "good", T0 + 21 * DAY)
  engine.tick(T0 + 40 * DAY)
  const history = engine.history(ITEM_ID)
  const item = engine.view(T0 + 40 * DAY)[0]!
  const died = entriesOf(history, "died")

  it("invalid-at for values that are not a time", () => {
    const bad: unknown[] = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, MAX_TIMESTAMP + 1, "soon"]
    for (const at of bad) {
      const w = whatIf(expPolicy, item, history, { at: at as number, event: "good" })
      expect(w).toMatchObject({ ok: false, reason: { code: "invalid-at" } })
    }
  })

  it("at-not-after-creation at createdAt and before it", () => {
    for (const at of [T0, T0 - DAY]) {
      expect(whatIf(expPolicy, item, history, { at, event: "good" })).toEqual({
        ok: false,
        reason: { code: "at-not-after-creation", at, createdAt: T0 },
      })
    }
  })

  it("at-item-dead between a death and the next resurrection", () => {
    const w = whatIf(expPolicy, item, history, { at: T0 + 15 * DAY, event: "good" })
    expect(w).toMatchObject({ ok: false, reason: { code: "at-item-dead", at: T0 + 15 * DAY } })
    if (w.ok || w.reason.code !== "at-item-dead") throw new Error("unreachable: asserted above")
    expect(Math.abs(w.reason.diedAt - died[0]!.timestamp)).toBeLessThanOrEqual(P)
  })

  it("at-item-dead after the final death", () => {
    const w = whatIf(expPolicy, item, history, { at: T0 + 39 * DAY, event: "good" })
    expect(w).toMatchObject({ ok: false, reason: { code: "at-item-dead", at: T0 + 39 * DAY } })
    if (w.ok || w.reason.code !== "at-item-dead") throw new Error("unreachable: asserted above")
    expect(died).toHaveLength(2)
    expect(Math.abs(w.reason.diedAt - died[1]!.timestamp)).toBeLessThanOrEqual(P)
  })

  it("invalid-event for undefined and for a function", () => {
    for (const event of [undefined, () => "good"]) {
      const w = whatIf(expPolicy, item, history, { at: T0 + DAY, event: event as unknown as TestEvent })
      expect(w).toMatchObject({ ok: false, reason: { code: "invalid-event" } })
    }
  })

  it("replay-failed for an invalid history, checked before `at`", () => {
    expect(whatIf(expPolicy, item, [], { at: Number.NaN, event: "good" })).toEqual({
      ok: false,
      reason: { code: "replay-failed", reason: { code: "invalid-history", problem: "empty", index: null } },
    })
  })

  it("replay-failed for an invalid horizonMs", () => {
    const w = whatIf(expPolicy, item, history, { at: T0 + DAY, event: "good" }, { horizonMs: 0 })
    expect(w).toMatchObject({
      ok: false,
      reason: { code: "replay-failed", reason: { code: "invalid-options", option: "horizonMs" } },
    })
  })
})
