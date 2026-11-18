// Integration tests for engine.triage, engine.autopsy and engine.forecast
// (task 25.2; Requirements 17b, 17c, 17d).

import { describe, it, expect } from "vitest"
import { DecayEngine, MAX_TIMESTAMP } from "../../src/engine"
import { DecayEngineError } from "../../src/errors"
import type { DecayEngineErrorCode } from "../../src/errors"
import { InMemoryAdapter } from "../../src/storage/memory"
import { FakePolicy } from "../fake-policy"
import type { FakeEvent, FakePayload, FakePolicyData } from "../fake-policy"

// Fixed timestamps. Tests never read the real clock.
const T0 = 1_000_000
const HOUR = 3_600_000
const MINUTE = 60_000

const INVALID_NOWS = [-1, Number.NaN, Number.POSITIVE_INFINITY, MAX_TIMESTAMP + 1]

function expectEngineError(fn: () => unknown, code: DecayEngineErrorCode): void {
  expect(fn).toThrow(DecayEngineError)
  expect(fn).toThrow(expect.objectContaining({ code }))
}

// Fake policy: weak below 50, dead below 20, 1 health per hour.
// Four items, all set up at T0:
//   a  health 100  alive  importance 1  cost 10   dies just after T0 + 80h
//   b  health  30  weak   importance 1  cost 10   dies just after T0 + 10h
//   c  health  40  weak   importance 3  cost 15   dies just after T0 + 20h
//   d  health  10  dead at T0 (diedAt T0)
function setup() {
  const adapter = new InMemoryAdapter()
  const queue = ["a", "b", "c", "d"]
  const engine = new DecayEngine<FakePayload, FakePolicyData, FakeEvent>(
    new FakePolicy(),
    adapter,
    () => queue.shift() ?? "unexpected"
  )
  engine.addItem({ payload: { name: "a" }, importance: 1, costMinutes: 10 }, T0)
  engine.addItem({ payload: { name: "b" }, importance: 1, costMinutes: 10 }, T0)
  engine.addItem({ payload: { name: "c" }, importance: 3, costMinutes: 15 }, T0)
  engine.addItem({ payload: { name: "d" }, importance: 1, costMinutes: 10 }, T0)
  engine.tend("b", { type: "damage", amount: 70 }, T0)
  engine.tend("c", { type: "damage", amount: 60 }, T0)
  engine.tend("d", { type: "damage", amount: 90 }, T0)
  return { engine, adapter }
}

function allHistory(engine: DecayEngine<FakePayload, FakePolicyData, FakeEvent>) {
  return ["a", "b", "c", "d"].map((id) => engine.history(id))
}

describe("engine.triage", () => {
  it("picks only weak items and stays within the budget", () => {
    const { engine } = setup()
    // Budget 20: b (10 min) and c (15 min) do not both fit.
    //   b value 70 x 0.7 x 1 =  49
    //   c value 60 x 0.6 x 3 = 108  -> c is picked, b is left over.
    const result = engine.triage(20, T0)

    expect(result.picks.map((p) => p.item.id)).toEqual(["c"])
    expect(result.others.map((p) => p.item.id)).toEqual(["b"])
    expect(result.picks[0]!.value).toBeCloseTo(108, 9)
    expect(result.picks.reduce((sum, p) => sum + p.item.costMinutes, 0)).toBeLessThanOrEqual(20)
  })

  it("is read-only", () => {
    const { engine, adapter } = setup()
    const stored = adapter.load()
    const history = allHistory(engine)

    // Five hours later every item has decayed; c and b are still weak.
    const result = engine.triage(30, T0 + 5 * HOUR)
    expect(result.picks.map((p) => p.item.id).sort()).toEqual(["b", "c"])

    expect(adapter.load()).toEqual(stored)
    expect(allHistory(engine)).toEqual(history)
  })

  it.each([0, -1, 1.5, 1441, Number.NaN, Number.POSITIVE_INFINITY])(
    "throws INVALID_BUDGET for budgetMinutes %s",
    (budget) => {
      const { engine } = setup()
      expectEngineError(() => engine.triage(budget, T0), "INVALID_BUDGET")
    }
  )

  it.each(INVALID_NOWS)("throws INVALID_TIMESTAMP for now %s", (now) => {
    const { engine } = setup()
    expectEngineError(() => engine.triage(20, now), "INVALID_TIMESTAMP")
  })
})

describe("engine.autopsy", () => {
  it("throws AUTOPSY_REQUIRES_DEAD_ITEM for an item that is not dead", () => {
    const { engine } = setup()
    expectEngineError(() => engine.autopsy("a", T0), "AUTOPSY_REQUIRES_DEAD_ITEM")
    expectEngineError(() => engine.autopsy("b", T0), "AUTOPSY_REQUIRES_DEAD_ITEM")
  })

  it("reports a death that was never ticked, with bisected times", () => {
    const { engine } = setup()
    const report = engine.autopsy("a", T0 + 100 * HOUR)

    expect(report.diedAt).toBeGreaterThanOrEqual(T0 + 80 * HOUR)
    expect(report.diedAt).toBeLessThanOrEqual(T0 + 80 * HOUR + MINUTE)
    expect(report.wentWeakAt).not.toBeNull()
    expect(report.wentWeakAt!).toBeGreaterThanOrEqual(T0 + 50 * HOUR)
    expect(report.wentWeakAt!).toBeLessThanOrEqual(T0 + 50 * HOUR + MINUTE)
    expect(report.lifeStartedAt).toBe(T0)
    expect(report.lastTend).toBeNull()
    expect(report.silenceMs).toBe(report.diedAt - T0)
  })

  it("reports the tend that killed an item", () => {
    const { engine } = setup()
    const report = engine.autopsy("d", T0)

    expect(report.diedAt).toBe(T0)
    expect(report.lastTend).toEqual({ at: T0, event: { type: "damage", amount: 90 } })
    expect(report.silenceMs).toBe(0)
  })

  it("is read-only", () => {
    const { engine, adapter } = setup()
    const stored = adapter.load()
    const history = allHistory(engine)

    engine.autopsy("a", T0 + 100 * HOUR)

    expect(adapter.load()).toEqual(stored)
    expect(allHistory(engine)).toEqual(history)
    expect(engine.graveyard().map((i) => i.id)).toEqual(["d"])
  })

  it("throws ITEM_NOT_FOUND for an unknown id", () => {
    const { engine } = setup()
    expectEngineError(() => engine.autopsy("nope", T0), "ITEM_NOT_FOUND")
  })

  it.each(INVALID_NOWS)("throws INVALID_TIMESTAMP for now %s", (now) => {
    const { engine } = setup()
    expectEngineError(() => engine.autopsy("d", now), "INVALID_TIMESTAMP")
  })
})

describe("engine.forecast", () => {
  it("predicts the deaths within the horizon, soonest first", () => {
    const { engine } = setup()

    const day = engine.forecast(T0, 24 * HOUR)
    expect(day.map((e) => e.item.id)).toEqual(["b", "c"])
    expect(day[0]!.diesAt).toBeGreaterThanOrEqual(T0 + 10 * HOUR)
    expect(day[0]!.diesAt).toBeLessThanOrEqual(T0 + 10 * HOUR + MINUTE)
    expect(day[1]!.diesAt).toBeGreaterThanOrEqual(T0 + 20 * HOUR)
    expect(day[1]!.diesAt).toBeLessThanOrEqual(T0 + 20 * HOUR + MINUTE)

    const longer = engine.forecast(T0, 100 * HOUR)
    expect(longer.map((e) => e.item.id)).toEqual(["b", "c", "a"])
  })

  it("view(entry.diesAt) shows each forecast item dead, and one minute earlier not dead", () => {
    const { engine } = setup()
    const entries = engine.forecast(T0, 100 * HOUR)
    expect(entries).toHaveLength(3)

    for (const entry of entries) {
      const atDeath = engine.view(entry.diesAt).find((i) => i.id === entry.item.id)
      expect(atDeath?.state).toBe("dead")
      expect(atDeath?.diedAt).toBeLessThanOrEqual(entry.diesAt)

      const before = engine.view(entry.diesAt - MINUTE).find((i) => i.id === entry.item.id)
      expect(before?.state).not.toBe("dead")
    }
  })

  it("settles at now first: items dead at now are left out", () => {
    const { engine } = setup()
    // At T0 + 15h, b has died (never ticked); c is at health 25 and a at 85.
    const entries = engine.forecast(T0 + 15 * HOUR, 100 * HOUR)

    expect(entries.map((e) => e.item.id)).toEqual(["c", "a"])
    expect(entries[0]!.item.health).toBeCloseTo(25, 9)
    expect(entries[1]!.item.health).toBeCloseTo(85, 9)
  })

  it("is read-only", () => {
    const { engine, adapter } = setup()
    const stored = adapter.load()
    const history = allHistory(engine)

    const entries = engine.forecast(T0 + 15 * HOUR, 100 * HOUR)
    entries[0]!.item.health = 99

    expect(adapter.load()).toEqual(stored)
    expect(allHistory(engine)).toEqual(history)
    expect(engine.graveyard().map((i) => i.id)).toEqual(["d"])
    expect(engine.view(T0).find((i) => i.id === "c")?.health).toBe(40)
  })

  it.each([0, -1, -HOUR, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "throws INVALID_HORIZON for horizonMs %s",
    (horizon) => {
      const { engine } = setup()
      expectEngineError(() => engine.forecast(T0, horizon), "INVALID_HORIZON")
    }
  )

  it("throws INVALID_HORIZON for a non-number horizonMs", () => {
    const { engine } = setup()
    expectEngineError(() => engine.forecast(T0, "1000" as unknown as number), "INVALID_HORIZON")
    expectEngineError(() => engine.forecast(T0, null as unknown as number), "INVALID_HORIZON")
  })

  it.each(INVALID_NOWS)("throws INVALID_TIMESTAMP for now %s", (now) => {
    const { engine } = setup()
    expectEngineError(() => engine.forecast(now, 24 * HOUR), "INVALID_TIMESTAMP")
  })

  it("checks now before horizonMs", () => {
    const { engine } = setup()
    expectEngineError(() => engine.forecast(-1, 0), "INVALID_TIMESTAMP")
  })
})
