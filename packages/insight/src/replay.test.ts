// replay: input checks, rebuilding, skipped entries, divergence and the known
// limits (Requirements 2 to 4 and 8; design sections 4 and 7.5).

import { describe, expect, it } from "vitest"
import { DecayEngine, InMemoryAdapter } from "@decay-engine/engine"
import type { HistoryEntry } from "@decay-engine/engine"
import { replay } from "./replay"
import { DEATH_TIME_PRECISION_MS } from "./types"
import type { ReplayResult } from "./types"
import { DAY, ITEM_ID, T0, entriesOf, indexOf, makeItem, thrown } from "./test/fixtures"
import { expPolicy, payloadHalfLifePolicy, throwingPolicy } from "./test/policies"
import type { CountData, TestPayload } from "./test/policies"

function expEngine() {
  const engine = new DecayEngine(expPolicy, new InMemoryAdapter(), () => ITEM_ID)
  engine.addItem({ payload: { label: "a" }, importance: 2, costMinutes: 10 }, T0)
  return engine
}

function okResult<P, D>(r: ReplayResult<P, D>) {
  expect(r.ok, r.ok ? "" : JSON.stringify(r.reason)).toBe(true)
  if (!r.ok) throw new Error("unreachable: asserted ok above")
  return r
}

const item0 = makeItem<TestPayload, CountData>({ label: "a" }, { tends: 0, lives: 1 })
const created: HistoryEntry = { type: "created", itemId: ITEM_ID, timestamp: T0, health: 100 }
const tendedAt = (t: number, event: unknown = "good"): HistoryEntry => ({
  type: "tended",
  itemId: ITEM_ID,
  timestamp: t,
  health: 100,
  event,
})

describe("replay: invalid history (Requirement 2.1)", () => {
  const cases: Array<[string, HistoryEntry[], { problem: string; index: number | null }]> = [
    ["empty", [], { problem: "empty", index: null }],
    ["first-not-created", [tendedAt(T0 + DAY)], { problem: "first-not-created", index: 0 }],
    [
      "created-time-mismatch",
      [{ ...created, timestamp: T0 + 1 }],
      { problem: "created-time-mismatch", index: 0 },
    ],
    ["other-item", [created, { ...tendedAt(T0 + DAY), itemId: "other" }], { problem: "other-item", index: 1 }],
    ["bad-timestamp (negative)", [created, tendedAt(-5)], { problem: "bad-timestamp", index: 1 }],
    ["bad-timestamp (NaN)", [created, tendedAt(Number.NaN)], { problem: "bad-timestamp", index: 1 }],
    [
      "out-of-order",
      [created, tendedAt(T0 + 2 * DAY), tendedAt(T0 + DAY)],
      { problem: "out-of-order", index: 2 },
    ],
    ["second-created", [created, { ...created, timestamp: T0 + DAY }], { problem: "second-created", index: 1 }],
    [
      "unknown-type",
      [created, { ...tendedAt(T0 + DAY), type: "poked" } as unknown as HistoryEntry],
      { problem: "unknown-type", index: 1 },
    ],
  ]

  for (const [name, history, expected] of cases) {
    it(name, () => {
      expect(replay(expPolicy, item0, history)).toEqual({
        ok: false,
        reason: { code: "invalid-history", ...expected },
      })
    })
  }
})

describe("replay: invalid item and options (Requirements 2.2 to 2.4)", () => {
  it("importance 0 is the engine's INVALID_IMPORTANCE", () => {
    const r = replay(expPolicy, { ...item0, importance: 0 }, [created])
    expect(r).toMatchObject({ ok: false, reason: { code: "invalid-item", engineCode: "INVALID_IMPORTANCE" } })
  })

  it("until before the last entry, or not a time, is invalid", () => {
    const history = [created, tendedAt(T0 + DAY)]
    for (const until of [T0, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const r = replay(expPolicy, item0, history, { until })
      expect(r).toMatchObject({ ok: false, reason: { code: "invalid-options", option: "until" } })
    }
  })

  it("horizonMs that is not a positive finite number is invalid", () => {
    for (const horizonMs of [0, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
      const r = replay(expPolicy, item0, [created], { horizonMs })
      expect(r).toMatchObject({ ok: false, reason: { code: "invalid-options", option: "horizonMs" } })
    }
  })
})

describe("replay: rebuilding (Requirements 3 and 4)", () => {
  it("reproduces a fixed history: tended healths, the death and diesAt", () => {
    const engine = expEngine()
    engine.tend(ITEM_ID, "good", T0 + 5 * DAY)
    engine.tend(ITEM_ID, "bad", T0 + 8 * DAY)
    engine.tick(T0 + 30 * DAY)
    const history = engine.history(ITEM_ID)
    const item = engine.view(T0 + 30 * DAY)[0]!

    // The default `until` is the last entry's timestamp (Requirement 7), so ask for day 30 as the original ticked.
    const r = okResult(replay(expPolicy, item, history, { until: T0 + 30 * DAY }))
    expect(r.until).toBe(T0 + 30 * DAY)
    expect(r.item.id).toBe(ITEM_ID)
    expect(r.item.state).toBe("dead")

    const recorded = entriesOf(history, "tended")
    const replayed = entriesOf(r.history, "tended")
    expect(replayed.map((e) => [e.timestamp, e.event])).toEqual([
      [T0 + 5 * DAY, "good"],
      [T0 + 8 * DAY, "bad"],
    ])
    replayed.forEach((e, i) => expect(Math.abs(e.health - recorded[i]!.health)).toBeLessThanOrEqual(1e-9))
    // 100 at day 5, 50 just before day 8, so 25 after the bad event
    expect(replayed[1]!.health).toBeCloseTo(25, 9)

    const recordedDied = entriesOf(history, "died")
    const replayedDied = entriesOf(r.history, "died")
    expect(replayedDied).toHaveLength(1)
    expect(Math.abs(replayedDied[0]!.timestamp - recordedDied[0]!.timestamp)).toBeLessThanOrEqual(
      DEATH_TIME_PRECISION_MS
    )
    expect(r.diesAt).toBe(r.item.diedAt)
    expect(r.skipped).toEqual([])
  })

  it("lists edited and resurrect-failed entries as skipped, with their indices", () => {
    const engine = expEngine()
    engine.edit(ITEM_ID, { importance: 3 }, T0 + DAY)
    engine.tick(T0 + 20 * DAY)
    engine.resurrect(ITEM_ID, "bad", T0 + 21 * DAY)
    engine.resurrect(ITEM_ID, "good", T0 + 22 * DAY)
    const history = engine.history(ITEM_ID)
    const item = engine.view(T0 + 22 * DAY)[0]!

    const r = okResult(replay(expPolicy, item, history))
    expect(r.skipped).toEqual([
      { index: indexOf(history, "edited", T0 + DAY), type: "edited", timestamp: T0 + DAY },
      {
        index: indexOf(history, "resurrect-failed", T0 + 21 * DAY),
        type: "resurrect-failed",
        timestamp: T0 + 21 * DAY,
      },
    ])
    expect(entriesOf(r.history, "edited")).toEqual([])
    expect(entriesOf(r.history, "resurrect-failed")).toEqual([])
  })

  it("rebuilds a resurrection's replaced policyData, and ignores the input's policyData, health and state (L3, L7)", () => {
    const engine = expEngine()
    engine.tend(ITEM_ID, "good", T0 + DAY)
    engine.tick(T0 + 20 * DAY)
    engine.resurrect(ITEM_ID, "good", T0 + 21 * DAY)
    const history = engine.history(ITEM_ID)
    const item = engine.view(T0 + 21 * DAY)[0]!
    expect(item.policyData).toEqual({ tends: 0, lives: 2 })

    const r = okResult(replay(expPolicy, item, history))
    expect(r.item.policyData).toEqual({ tends: 0, lives: 2 })
    expect(r.item.timesResurrected).toBe(1)
    expect(r.item.state).toBe("alive")

    const wrong = {
      ...item,
      policyData: { tends: 99, lives: 99 },
      health: 3,
      state: "dead" as const,
      diedAt: T0,
      lastEventAt: T0,
      timesResurrected: 7,
    }
    expect(replay(expPolicy, wrong, history)).toEqual(r)
  })

  it("ticks to options.until after the last entry", () => {
    const engine = expEngine()
    engine.tend(ITEM_ID, "good", T0 + DAY)
    const history = engine.history(ITEM_ID)
    const item = engine.view(T0 + DAY)[0]!

    const r = okResult(replay(expPolicy, item, history, { until: T0 + 30 * DAY }))
    expect(r.until).toBe(T0 + 30 * DAY)
    expect(r.item.state).toBe("dead")
    expect(entriesOf(r.history, "died")).toHaveLength(1)
  })
})

describe("replay: divergence (Requirements 3.5 and 3.6)", () => {
  it("a recorded tend after the replayed death is ITEM_ALREADY_DEAD", () => {
    expect(replay(expPolicy, item0, [created, tendedAt(T0 + 30 * DAY)])).toEqual({
      ok: false,
      reason: {
        code: "diverged",
        index: 1,
        timestamp: T0 + 30 * DAY,
        entryType: "tended",
        engineCode: "ITEM_ALREADY_DEAD",
        policyReason: null,
      },
    })
  })

  it("a recorded resurrection of a living item is ITEM_NOT_DEAD", () => {
    const resurrected: HistoryEntry = {
      type: "resurrected",
      itemId: ITEM_ID,
      timestamp: T0 + DAY,
      health: 100,
      event: "good",
    }
    expect(replay(expPolicy, item0, [created, resurrected])).toEqual({
      ok: false,
      reason: {
        code: "diverged",
        index: 1,
        timestamp: T0 + DAY,
        entryType: "resurrected",
        engineCode: "ITEM_NOT_DEAD",
        policyReason: null,
      },
    })
  })

  it("a recorded resurrection the policy now refuses is RESURRECT_REFUSED with the policy's reason", () => {
    const resurrected: HistoryEntry = {
      type: "resurrected",
      itemId: ITEM_ID,
      timestamp: T0 + 30 * DAY,
      health: 100,
      event: "bad",
    }
    expect(replay(expPolicy, item0, [created, resurrected])).toEqual({
      ok: false,
      reason: {
        code: "diverged",
        index: 1,
        timestamp: T0 + 30 * DAY,
        entryType: "resurrected",
        engineCode: "RESURRECT_REFUSED",
        policyReason: "wrong answer",
      },
    })
  })
})

describe("replay: known limit L1, the current payload is used", () => {
  it("after a payload edit, a replayed tend gives the health of the current payload, not the recorded one", () => {
    const engine = new DecayEngine(payloadHalfLifePolicy, new InMemoryAdapter(), () => ITEM_ID)
    engine.addItem({ payload: { halfLifeDays: 3 }, importance: 1, costMinutes: 5 }, T0)
    engine.edit(ITEM_ID, { payload: { halfLifeDays: 10 } }, T0 + DAY)
    engine.tend(ITEM_ID, "bad", T0 + 2 * DAY)
    const history = engine.history(ITEM_ID)
    const item = engine.view(T0 + 2 * DAY)[0]!
    const recorded = entriesOf(history, "tended")[0]!.health

    // What the current payload gives from the start, with the same tend
    const current = new DecayEngine(payloadHalfLifePolicy, new InMemoryAdapter(), () => ITEM_ID)
    current.addItem({ payload: { halfLifeDays: 10 }, importance: 1, costMinutes: 5 }, T0)
    current.tend(ITEM_ID, "bad", T0 + 2 * DAY)
    const expected = entriesOf(current.history(ITEM_ID), "tended")[0]!.health

    const r = okResult(replay(payloadHalfLifePolicy, item, history))
    const replayed = entriesOf(r.history, "tended")[0]!.health
    expect(replayed).toBe(expected)
    expect(Math.abs(replayed - recorded)).toBeGreaterThan(1)
    expect(r.skipped).toEqual([{ index: 1, type: "edited", timestamp: T0 + DAY }])
  })
})

describe("replay: errors from the policy go through (Requirement 8.2)", () => {
  it("throws the policy's own error", () => {
    const item = makeItem<TestPayload, Record<string, never>>({ label: "a" }, {})
    const error = thrown(() => replay(throwingPolicy, item, [created, tendedAt(T0 + DAY)]))
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe("policy bug")
  })
})
