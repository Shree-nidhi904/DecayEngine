import { describe, it, expect } from "vitest"
import { settle } from "../../src/settle"
import { bisectCrossing } from "../../src/bisection"
import { DecayEngineError } from "../../src/errors"
import type { Item } from "../../src/types"
import { FakePolicy } from "../fake-policy"
import type { FakePayload, FakePolicyData } from "../fake-policy"

// Fixed timestamps. Tests never read the real clock.
const T0 = 1_000_000
const HOUR = 3_600_000
const MINUTE = 60_000

// Adding 1/7 makes every exact crossing time fall between whole milliseconds
// (1/7 hour = 514285.714... ms). Bisection only checks whole-millisecond times,
// so it can never land exactly on a crossing, and "strictly after exact" is fair.
const OFFSET = 1 / 7
// Valid stored health (0..100) with the offset: weak crossing at 40h + 1/7h,
// dead crossing at 70h + 1/7h after lastEventAt.
const OFFSET_HEALTH = 90 + OFFSET

type FakeItem = Item<FakePayload, FakePolicyData>

function makeItem(policy: FakePolicy, overrides: Partial<FakeItem> = {}): FakeItem {
  return {
    id: "item-1",
    payload: { name: "Capital of Peru" },
    policyData: policy.init({ name: "Capital of Peru" }, T0),
    health: 100,
    state: "alive",
    createdAt: T0,
    lastEventAt: T0,
    timesResurrected: 0,
    importance: 2,
    costMinutes: 5,
    ...overrides,
  }
}

// Deep copy for "unchanged" checks. Items are JSON-serializable by contract.
function clone(item: FakeItem): FakeItem {
  return JSON.parse(JSON.stringify(item)) as FakeItem
}

// Exact moment health reaches `threshold` under the fake policy's linear decay
function exactCrossing(item: FakeItem, threshold: number): number {
  return item.lastEventAt + (item.health - threshold) / item.policyData.decayRate
}

describe("settle: returns unchanged", () => {
  it("returns a dead item unchanged with no history, even far in the future", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy, {
      health: 0,
      state: "dead",
      diedAt: T0 + 80 * HOUR,
      lastEventAt: T0 + 90 * HOUR,
    })
    const before = clone(item)

    const result = settle(item, policy, T0 + 500 * HOUR)

    expect(result.item).toEqual(before)
    expect(result.historyEntries).toEqual([])
    expect(item).toEqual(before) // input not mutated
  })

  it("returns the item unchanged with no history when now < lastEventAt", () => {
    const policy = new FakePolicy()
    // Stored at 10h with health 90. If settle called healthAt at T0 the fake
    // policy would report 100 (time running backward), so unchanged proves it did not.
    const item = makeItem(policy, { health: 90, lastEventAt: T0 + 10 * HOUR })
    const before = clone(item)

    const result = settle(item, policy, T0)

    expect(result.item).toEqual(before)
    expect(result.historyEntries).toEqual([])
    expect(item).toEqual(before)
  })

  it("returns the item unchanged with no history when now === lastEventAt", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy, { health: 73, lastEventAt: T0 + 5 * HOUR })
    const before = clone(item)

    const result = settle(item, policy, T0 + 5 * HOUR)

    expect(result.item).toEqual(before)
    expect(result.item.lastEventAt).toBe(T0 + 5 * HOUR)
    expect(result.historyEntries).toEqual([])
  })

  it("does not move lastEventAt when health is unchanged at a later now", () => {
    const policy = new FakePolicy()
    // decayRate 0: healthAt returns the stored health at every time
    const item = makeItem(policy, { health: 64, policyData: { decayRate: 0 } })
    const before = clone(item)

    const result = settle(item, policy, T0 + 100 * HOUR)

    expect(result.item).toEqual(before)
    expect(result.item.lastEventAt).toBe(T0)
    expect(result.historyEntries).toEqual([])
  })
})

describe("settle: health decrease", () => {
  it("updates health and lastEventAt with no history when the state does not change", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy, { health: 100 })
    const before = clone(item)
    const now = T0 + 10 * HOUR

    const result = settle(item, policy, now)

    // 10 hours at 1 health per hour
    expect(result.item.health).toBeCloseTo(90, 9)
    expect(result.item).toEqual({
      ...before,
      health: result.item.health,
      state: "alive",
      lastEventAt: now,
    })
    expect(result.item.diedAt).toBeUndefined()
    expect(result.historyEntries).toEqual([])
    expect(item).toEqual(before) // input not mutated
  })

  it("is pure: the same inputs give the same output", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy, { health: OFFSET_HEALTH })
    const now = T0 + 100 * HOUR

    expect(settle(item, policy, now)).toEqual(settle(item, policy, now))
  })
})

describe("settle: state transitions", () => {
  it("alive -> weak records one state-changed entry at the bisected weak crossing", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy, { health: OFFSET_HEALTH })
    const now = T0 + 60 * HOUR
    const exact = exactCrossing(item, policy.thresholds.weak) // T0 + 40h + 1/7h
    const expectedWeakAt = bisectCrossing(item, policy, policy.thresholds.weak, T0, now)

    const result = settle(item, policy, now)

    // 60 hours at 1 health per hour from 90 + 1/7
    expect(result.item.health).toBeCloseTo(30 + OFFSET, 9)
    expect(result.item.state).toBe("weak")
    expect(result.item.lastEventAt).toBe(now)
    expect(result.item.diedAt).toBeUndefined()
    expect(result.historyEntries).toEqual([
      {
        type: "state-changed",
        itemId: "item-1",
        timestamp: expectedWeakAt,
        health: result.item.health,
        from: "alive",
        to: "weak",
      },
    ])
    expect(expectedWeakAt).toBeGreaterThan(exact)
    expect(expectedWeakAt).toBeLessThanOrEqual(exact + MINUTE)
    expect(expectedWeakAt).not.toBe(now)
  })

  it("weak -> dead records only a died entry at the bisected dead crossing", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy, { health: 40 + OFFSET, state: "weak" })
    const now = T0 + 30 * HOUR
    const exact = exactCrossing(item, policy.thresholds.dead) // T0 + 20h + 1/7h
    const expectedDeadAt = bisectCrossing(item, policy, policy.thresholds.dead, T0, now)

    const result = settle(item, policy, now)

    expect(result.item).toEqual({
      ...item,
      health: 0,
      state: "dead",
      lastEventAt: now,
      diedAt: expectedDeadAt,
    })
    expect(result.historyEntries).toEqual([
      { type: "died", itemId: "item-1", timestamp: expectedDeadAt, health: 0 },
    ])
    expect(expectedDeadAt).toBeGreaterThan(exact)
    expect(expectedDeadAt).toBeLessThanOrEqual(exact + MINUTE)
  })

  it("weak item that decays but stays weak records no history", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy, { health: 45, state: "weak" })
    const now = T0 + 5 * HOUR

    const result = settle(item, policy, now)

    expect(result.item.health).toBeCloseTo(40, 9)
    expect(result.item.state).toBe("weak")
    expect(result.item.lastEventAt).toBe(now)
    expect(result.historyEntries).toEqual([])
  })
})

describe("settle: item dying", () => {
  it("sets diedAt, sets health to 0 and state to dead", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy, { health: OFFSET_HEALTH })
    const now = T0 + 90 * HOUR

    const result = settle(item, policy, now)

    expect(result.item.state).toBe("dead")
    expect(result.item.health).toBe(0)
    expect(result.item.diedAt).toBe(
      bisectCrossing(item, policy, policy.thresholds.dead, T0, now)
    )
    expect(result.item.lastEventAt).toBe(now)
  })

  it("clamps a negative policy health to 0 (fake policy does not clamp)", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy, { health: 100 })
    const now = T0 + 200 * HOUR
    expect(policy.healthAt(item, now)).toBeCloseTo(-100, 9) // policy itself goes below 0

    const result = settle(item, policy, now)

    expect(result.item.health).toBe(0)
    expect(result.item.state).toBe("dead")
    const died = result.historyEntries.find((e) => e.type === "died")
    expect(died?.health).toBe(0)
  })
})

describe("settle: misbehaving policy", () => {
  it("throws INVALID_HEALTH naming healthAt and NaN when healthAt returns NaN", () => {
    class NaNPolicy extends FakePolicy {
      override healthAt(): number {
        return Number.NaN
      }
    }
    const policy = new NaNPolicy()
    const item = makeItem(policy, { health: 80 })
    const fn = () => settle(item, policy, T0 + 10 * HOUR)

    expect(fn).toThrow(DecayEngineError)
    expect(fn).toThrow(expect.objectContaining({ code: "INVALID_HEALTH" }))
    expect(fn).toThrow(/healthAt/)
    expect(fn).toThrow(/NaN/)
  })
})

describe("settle: crossing timestamps", () => {
  it("stamps died and state-changed with bisected times, not now, and diedAt <= lastEventAt", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy, { health: OFFSET_HEALTH })
    const now = T0 + 100 * HOUR
    // Bisection runs on the STORED item over [lastEventAt, now]
    const expectedWeakAt = bisectCrossing(item, policy, policy.thresholds.weak, T0, now)
    const expectedDeadAt = bisectCrossing(item, policy, policy.thresholds.dead, T0, now)

    const result = settle(item, policy, now)

    expect(result.historyEntries).toEqual([
      {
        type: "state-changed",
        itemId: "item-1",
        timestamp: expectedWeakAt,
        health: policy.thresholds.weak,
        from: "alive",
        to: "weak",
      },
      { type: "died", itemId: "item-1", timestamp: expectedDeadAt, health: 0 },
    ])
    expect(expectedWeakAt).not.toBe(now)
    expect(expectedDeadAt).not.toBe(now)
    expect(expectedWeakAt).toBeLessThan(expectedDeadAt)
    expect(result.item.diedAt).toBe(expectedDeadAt)
    expect(result.item.lastEventAt).toBe(now)
    expect(result.item.diedAt as number).toBeLessThanOrEqual(result.item.lastEventAt)
  })

  it("item untended for 100 hours: state-changed at ~50h and died at ~80h, each within 1 minute after exact", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy, { health: 100 })
    const now = T0 + 100 * HOUR
    const exactWeak = T0 + 50 * HOUR
    const exactDead = T0 + 80 * HOUR

    const result = settle(item, policy, now)

    expect(result.historyEntries).toHaveLength(2)
    const [changed, died] = result.historyEntries
    expect(changed.type).toBe("state-changed")
    expect(died.type).toBe("died")

    // Health 100 exactly can land bisection on the exact crossing (where health
    // equals the threshold, not below it), so the lower bound is inclusive here.
    expect(changed.timestamp).toBeGreaterThanOrEqual(exactWeak)
    expect(changed.timestamp).toBeLessThanOrEqual(exactWeak + MINUTE)
    expect(died.timestamp).toBeGreaterThanOrEqual(exactDead)
    expect(died.timestamp).toBeLessThanOrEqual(exactDead + MINUTE)

    expect(result.item).toEqual({
      ...item,
      health: 0,
      state: "dead",
      lastEventAt: now,
      diedAt: died.timestamp,
    })
  })
})
