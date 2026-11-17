import { describe, it, expect } from "vitest"
import { triage, triageValue, MAX_BUDGET_MINUTES } from "../../src/triage"
import { findDeathAfter } from "../../src/bisection"
import { DecayEngine } from "../../src/engine"
import { DecayEngineError } from "../../src/errors"
import type { DecayEngineErrorCode } from "../../src/errors"
import { InMemoryAdapter } from "../../src/storage/memory"
import { MAX_FORECAST_HORIZON_MS } from "../../src/types"
import type { Item, TriageResult } from "../../src/types"
import { FakePolicy } from "../fake-policy"
import type { FakePayload, FakePolicyData } from "../fake-policy"

// Fixed timestamps. Tests never read the real clock.
const T0 = 1_000_000
const HOUR = 3_600_000
const MINUTE = 60_000
const NOW = T0 + 1000 * HOUR

// Fake policy: weak below 50, dead below 20, 1 health per hour.
const policy = new FakePolicy()
type FakeItem = Item<FakePayload, FakePolicyData>

// An item whose stored health is its health at NOW (lastEventAt = NOW).
function item(id: string, health: number, importance: number, costMinutes: number, overrides: Partial<FakeItem> = {}): FakeItem {
  return {
    id,
    payload: { name: id },
    policyData: { decayRate: 1 / HOUR },
    health,
    state: health >= 50 ? "alive" : health >= 20 ? "weak" : "dead",
    createdAt: T0,
    lastEventAt: NOW,
    timesResurrected: 0,
    importance,
    costMinutes,
    ...overrides,
  }
}

function ids(candidates: TriageResult<FakePayload, FakePolicyData>["picks"]): string[] {
  return candidates.map((c) => c.item.id)
}

function minutes(candidates: TriageResult<FakePayload, FakePolicyData>["picks"]): number {
  return candidates.reduce((sum, c) => sum + c.item.costMinutes, 0)
}

function totalValue(candidates: TriageResult<FakePayload, FakePolicyData>["picks"]): number {
  return candidates.reduce((sum, c) => sum + c.value, 0)
}

function expectEngineError(fn: () => unknown, code: DecayEngineErrorCode): void {
  expect(fn).toThrow(DecayEngineError)
  expect(fn).toThrow(expect.objectContaining({ code }))
}

describe("triageValue (the locked rule)", () => {
  it.each([
    // (100 - h) x (1 - h/100) x importance
    { health: 40, importance: 3, value: 60 * 0.6 * 3 }, // 108
    { health: 30, importance: 1, value: 70 * 0.7 * 1 }, // 49
    { health: 45, importance: 2, value: 55 * 0.55 * 2 }, // 60.5
    { health: 25, importance: 2, value: 75 * 0.75 * 2 }, // 112.5
    { health: 100, importance: 3, value: 0 },
    { health: 0, importance: 1, value: 100 },
  ])("health $health, importance $importance -> $value", ({ health, importance, value }) => {
    expect(triageValue(health, importance)).toBeCloseTo(value, 9)
  })
})

describe("triage", () => {
  describe("worked example", () => {
    // Four weak items, budget 20 minutes.
    //
    //   item  health  importance  cost  value                    value/min
    //   A     40      3           10    60 x 0.60 x 3 = 108.0    10.8
    //   B     30      1            5    70 x 0.70 x 1 =  49.0     9.8
    //   C     45      2            8    55 x 0.55 x 2 =  60.5     7.5625
    //   D     25      2           12    75 x 0.75 x 2 = 112.5     9.375
    //
    // Every subset that fits 20 minutes:
    //   A+B 15 min 157.0 | A+C 18 min 168.5 | B+C 13 min 109.5
    //   B+D 17 min 161.5 | C+D 20 min 173.0 | singles at most 112.5
    //   (A+D 22, any three: over budget)
    // Best: C+D, 173.0 in exactly 20 minutes.
    // Greedy by value/min would take A (10 min) then B (15 min), and then
    // nothing else fits: 157.0. So triage must not be greedy.
    //
    // picks by value/min descending: D (9.375), C (7.5625)
    // others by diesAt (1 health/hour, dead below 20):
    //   B dies 10h after NOW, A dies 20h after NOW -> B, A
    const items = [item("A", 40, 3, 10), item("B", 30, 1, 5), item("C", 45, 2, 8), item("D", 25, 2, 12)]

    it("picks C and D, in that display order, using all 20 minutes", () => {
      const result = triage(items, 20, policy, NOW)
      expect(ids(result.picks)).toEqual(["D", "C"])
      expect(minutes(result.picks)).toBe(20)
      expect(totalValue(result.picks)).toBeCloseTo(173, 9)
    })

    it("lists A and B as others, soonest death first", () => {
      const result = triage(items, 20, policy, NOW)
      expect(ids(result.others)).toEqual(["B", "A"])
    })

    it("reports value, valuePerMinute and diesAt for each candidate", () => {
      const result = triage(items, 20, policy, NOW)
      const d = result.picks[0]!
      expect(d.value).toBeCloseTo(112.5, 9)
      expect(d.valuePerMinute).toBeCloseTo(9.375, 9)
      // D at 25 crosses 20 five hours after NOW; bisection lands at most a minute later
      expect(d.diesAt).toBeGreaterThanOrEqual(NOW + 5 * HOUR)
      expect(d.diesAt).toBeLessThanOrEqual(NOW + 5 * HOUR + MINUTE)
    })
  })

  describe("candidates", () => {
    it("considers only items weak at now (health in [dead, weak))", () => {
      const items = [
        item("alive", 80, 3, 1),
        item("exactly-weak-threshold", 50, 3, 1), // alive
        item("weak", 30, 1, 1),
        item("exactly-dead-threshold", 20, 1, 1), // weak
        item("stored-dead", 0, 3, 1, { state: "dead", diedAt: NOW - HOUR }),
        // stored alive at 55, ten hours ago: 45 at NOW, weak
        item("weak-by-decay", 55, 1, 1, { lastEventAt: NOW - 10 * HOUR }),
        // stored weak at 25, ten hours ago: 15 at NOW, dead
        item("dead-by-decay", 25, 3, 1, { lastEventAt: NOW - 10 * HOUR }),
      ]
      const result = triage(items, MAX_BUDGET_MINUTES, policy, NOW)
      expect(ids(result.picks).sort()).toEqual(["exactly-dead-threshold", "weak", "weak-by-decay"])
      expect(result.others).toEqual([])
    })

    it("uses health at now, not stored health", () => {
      const result = triage([item("x", 55, 1, 1, { lastEventAt: NOW - 10 * HOUR })], 10, policy, NOW)
      const [candidate] = result.picks
      expect(candidate!.item.health).toBeCloseTo(45, 9)
      expect(candidate!.item.lastEventAt).toBe(NOW)
      expect(candidate!.value).toBeCloseTo(triageValue(45, 1), 9)
    })

    it("returns empty picks and others when no item is weak", () => {
      expect(triage([item("a", 90, 1, 1), item("b", 70, 1, 1)], 60, policy, NOW)).toEqual({ picks: [], others: [] })
      expect(triage([], 60, policy, NOW)).toEqual({ picks: [], others: [] })
    })

    it("computes diesAt with findDeathAfter over the 10-year horizon, null if never", () => {
      const dying = item("dying", 30, 1, 100)
      const frozen = item("frozen", 30, 1, 100, { policyData: { decayRate: 0 } })
      const result = triage([dying, frozen], 1, policy, NOW)

      const byId = Object.fromEntries(result.others.map((c) => [c.item.id, c]))
      expect(byId.dying!.diesAt).toBe(findDeathAfter(dying, policy, NOW, NOW + MAX_FORECAST_HORIZON_MS))
      expect(byId.dying!.diesAt).toBeGreaterThanOrEqual(NOW + 10 * HOUR)
      expect(byId.dying!.diesAt).toBeLessThanOrEqual(NOW + 10 * HOUR + MINUTE)
      expect(byId.frozen!.diesAt).toBeNull()
    })
  })

  describe("budget", () => {
    it("never spends more than the budget", () => {
      const items = Array.from({ length: 12 }, (_, i) => item(`i${i}`, 21 + i * 2, 1 + (i % 3), 3 + ((i * 7) % 11)))
      for (const budget of [1, 5, 10, 17, 30, 60]) {
        const result = triage(items, budget, policy, NOW)
        expect(minutes(result.picks)).toBeLessThanOrEqual(budget)
        expect(result.picks.length + result.others.length).toBe(12)
      }
    })

    it("picks nothing when every weak item costs more than the budget", () => {
      const result = triage([item("a", 30, 3, 15), item("b", 40, 3, 25)], 10, policy, NOW)
      expect(result.picks).toEqual([])
      expect(ids(result.others)).toEqual(["a", "b"])
    })

    it("picks an item whose cost equals the budget exactly", () => {
      const result = triage([item("a", 30, 1, 10)], 10, policy, NOW)
      expect(ids(result.picks)).toEqual(["a"])
    })

    it("finds the maximum total value (checked against every subset)", () => {
      const items = [
        item("a", 21, 1, 9),
        item("b", 33, 3, 4),
        item("c", 48, 2, 6),
        item("d", 27, 2, 11),
        item("e", 39, 1, 3),
        item("f", 44, 3, 7),
        item("g", 25, 3, 13),
        item("h", 36, 2, 5),
      ]
      const budget = 25
      let best = 0
      for (let mask = 0; mask < 1 << items.length; mask++) {
        let cost = 0
        let value = 0
        items.forEach((it, i) => {
          if (mask & (1 << i)) {
            cost += it.costMinutes
            value += triageValue(it.health, it.importance)
          }
        })
        if (cost <= budget && value > best) best = value
      }
      expect(totalValue(triage(items, budget, policy, NOW).picks)).toBeCloseTo(best, 9)
    })

    it.each([0, -1, MAX_BUDGET_MINUTES + 1, 1.5, NaN, Infinity, "20"])(
      "throws INVALID_BUDGET for budgetMinutes %s",
      (budget) => {
        const fn = () => triage([item("a", 30, 1, 1)], budget as number, policy, NOW)
        expectEngineError(fn, "INVALID_BUDGET")
        expect(fn).toThrow(/budgetMinutes/)
      }
    )

    it.each([1, MAX_BUDGET_MINUTES])("accepts budgetMinutes %i", (budget) => {
      expect(ids(triage([item("a", 30, 1, 1)], budget, policy, NOW).picks)).toEqual(["a"])
    })
  })

  describe("ordering and determinism", () => {
    it("sorts picks by valuePerMinute descending, ties by id ascending", () => {
      const items = [item("b", 30, 1, 5), item("a", 30, 1, 5), item("c", 40, 3, 2)]
      const result = triage(items, 60, policy, NOW)
      expect(ids(result.picks)).toEqual(["c", "a", "b"])
    })

    it("sorts others by diesAt ascending, nulls last, ties by id ascending", () => {
      const frozen = { policyData: { decayRate: 0 } }
      const items = [
        item("never-z", 30, 1, 99, frozen),
        item("later", 40, 1, 99), // dies 20h after NOW
        item("never-a", 30, 1, 99, frozen),
        item("soon-b", 25, 1, 99), // dies 5h after NOW
        item("soon-a", 25, 1, 99), // same diesAt as soon-b
      ]
      const result = triage(items, 1, policy, NOW)
      expect(result.picks).toEqual([])
      expect(ids(result.others)).toEqual(["soon-a", "soon-b", "later", "never-a", "never-z"])
    })

    it("is deterministic and independent of input order, including value ties", () => {
      // a and b have equal value; only one fits
      const items = [item("b", 30, 1, 10), item("a", 30, 1, 10), item("c", 45, 1, 10)]
      const first = triage(items, 10, policy, NOW)
      expect(triage(items, 10, policy, NOW)).toStrictEqual(first)
      expect(triage([...items].reverse(), 10, policy, NOW)).toStrictEqual(first)
      expect(ids(first.picks)).toEqual(["a"])
    })
  })

  describe("read-only", () => {
    it("does not change the input items and returns copies", () => {
      const items = [item("a", 55, 1, 1, { lastEventAt: NOW - 10 * HOUR })]
      const before = JSON.parse(JSON.stringify(items)) as FakeItem[]

      const result = triage(items, 10, policy, NOW)
      result.picks[0]!.item.payload.name = "changed"
      expect(items).toEqual(before)
    })
  })
})

describe("DecayEngine.triage", () => {
  function engineWith(adds: Array<{ at: number; importance: number; costMinutes: number }>) {
    const adapter = new InMemoryAdapter()
    let n = 0
    const engine = new DecayEngine(new FakePolicy(), adapter, () => `item-${++n}`)
    for (const { at, importance, costMinutes } of adds) {
      engine.addItem({ payload: { name: "fact" }, importance, costMinutes }, at)
    }
    return { engine, adapter }
  }

  it("uses each item's health at now", () => {
    const { engine } = engineWith([
      { at: T0, importance: 2, costMinutes: 5 }, // 40 at 60h: weak
      { at: T0 + 30 * HOUR, importance: 2, costMinutes: 5 }, // 70 at 60h: alive
    ])
    const result = engine.triage(30, T0 + 60 * HOUR)
    expect(ids(result.picks)).toEqual(["item-1"])
    expect(result.picks[0]!.item.health).toBeCloseTo(40, 9)
  })

  it("does not change storage", () => {
    const { engine, adapter } = engineWith([{ at: T0, importance: 2, costMinutes: 5 }])
    const before = adapter.load()
    engine.triage(30, T0 + 60 * HOUR)
    expect(adapter.load()).toEqual(before)
    expect(engine.view(T0)[0]).toMatchObject({ health: 100, lastEventAt: T0 })
  })

  it("throws INVALID_TIMESTAMP for an invalid now and INVALID_BUDGET for a bad budget", () => {
    const { engine } = engineWith([{ at: T0, importance: 2, costMinutes: 5 }])
    expectEngineError(() => engine.triage(30, NaN), "INVALID_TIMESTAMP")
    expectEngineError(() => engine.triage(0, T0), "INVALID_BUDGET")
  })
})
