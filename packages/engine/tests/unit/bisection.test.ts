import { describe, it, expect } from "vitest"
import { bisectCrossing, findDeathAfter, BISECT_PRECISION_MS } from "../../src/bisection"
import { clampHealth, deriveState } from "../../src/state-derivation"
import type { Item } from "../../src/types"
import { FakePolicy } from "../fake-policy"
import type { FakePayload, FakePolicyData } from "../fake-policy"

// Fixed timestamps. Tests never read the real clock.
const T0 = 1_000_000
const HOUR = 3_600_000
const MINUTE = 60_000

// 100 + 1/7 makes every exact crossing time fall between whole milliseconds
// (1/7 hour = 514285.714... ms). Bisection only checks whole-millisecond times,
// so it can never land exactly on the crossing, and "strictly after exact" is
// a fair check.
const START_HEALTH = 100 + 1 / 7

type FakeItem = Item<FakePayload, FakePolicyData>

function makeItem(policy: FakePolicy, overrides: Partial<FakeItem> = {}): FakeItem {
  return {
    id: "item-1",
    payload: { name: "Capital of Peru" },
    policyData: policy.init({ name: "Capital of Peru" }, T0),
    health: START_HEALTH,
    state: "alive",
    createdAt: T0,
    lastEventAt: T0,
    timesResurrected: 0,
    importance: 2,
    costMinutes: 5,
    ...overrides,
  }
}

// Exact moment health reaches `threshold` under the fake policy's linear decay
function exactCrossing(item: FakeItem, threshold: number): number {
  return item.lastEventAt + (item.health - threshold) / item.policyData.decayRate
}

function healthAt(policy: FakePolicy, item: FakeItem, t: number): number {
  return clampHealth(policy.healthAt(item, t))
}

// Stand-in for view(t): engine.view is not implemented yet, so derive the
// state the same way settle will (clamped policy.healthAt, then deriveState).
function stateAt(policy: FakePolicy, item: FakeItem, t: number): "alive" | "weak" | "dead" {
  return deriveState(healthAt(policy, item, t), policy.thresholds)
}

describe("BISECT_PRECISION_MS", () => {
  it("is one minute", () => {
    expect(BISECT_PRECISION_MS).toBe(60_000)
  })
})

describe("bisectCrossing", () => {
  it("finds the dead-threshold crossing within 1 minute after the exact time, never before", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy)
    const exact = exactCrossing(item, policy.thresholds.dead) // T0 + 80h + 1/7h
    const toTime = T0 + 100 * HOUR

    const result = bisectCrossing(item, policy, policy.thresholds.dead, T0, toTime)

    expect(result).toBeGreaterThan(exact)
    expect(result).toBeLessThanOrEqual(exact + MINUTE)
    expect(healthAt(policy, item, result)).toBeLessThan(policy.thresholds.dead)
    expect(healthAt(policy, item, result - MINUTE)).toBeGreaterThanOrEqual(policy.thresholds.dead)
  })

  it("finds the weak-threshold crossing within 1 minute after the exact time, never before", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy)
    const exact = exactCrossing(item, policy.thresholds.weak) // T0 + 50h + 1/7h
    const toTime = T0 + 100 * HOUR

    const result = bisectCrossing(item, policy, policy.thresholds.weak, T0, toTime)

    expect(result).toBeGreaterThan(exact)
    expect(result).toBeLessThanOrEqual(exact + MINUTE)
    expect(healthAt(policy, item, result)).toBeLessThan(policy.thresholds.weak)
    expect(healthAt(policy, item, result - MINUTE)).toBeGreaterThanOrEqual(policy.thresholds.weak)
  })

  it.each([
    { label: "0 ms (same time)", gap: 0 },
    { label: "1 ms", gap: 1 },
    { label: "59 999 ms", gap: 59_999 },
    { label: "exactly 60 000 ms", gap: 60_000 },
  ])("returns toTime when fromTime and toTime are $label apart", ({ gap }) => {
    const policy = new FakePolicy()
    const item = makeItem(policy)
    // Both ends well past death, so the precondition (below threshold at toTime) holds
    const fromTime = T0 + 90 * HOUR
    const toTime = fromTime + gap

    expect(bisectCrossing(item, policy, policy.thresholds.dead, fromTime, toTime)).toBe(toTime)
  })

  // Window of exactly two minutes: the loop runs once (mid = left + 60000),
  // then stops. The result must be the right end of the remaining interval.
  it("returns the upper end of the final interval when the crossing is in the first half", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy)
    const exact = exactCrossing(item, policy.thresholds.dead)
    const left = Math.floor(exact) - 10_000 // crossing is 10 s after left
    const toTime = left + 2 * MINUTE

    const result = bisectCrossing(item, policy, policy.thresholds.dead, left, toTime)

    // Final interval is [left, left + 60000]; the upper end is returned
    expect(result).toBe(left + MINUTE)
    expect(healthAt(policy, item, left)).toBeGreaterThanOrEqual(policy.thresholds.dead)
    expect(healthAt(policy, item, result)).toBeLessThan(policy.thresholds.dead)
  })

  it("returns the upper end of the final interval when the crossing is in the second half", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy)
    const exact = exactCrossing(item, policy.thresholds.dead)
    const left = Math.floor(exact) - 70_000 // crossing is 70 s after left
    const toTime = left + 2 * MINUTE

    const result = bisectCrossing(item, policy, policy.thresholds.dead, left, toTime)

    // Final interval is [left + 60000, toTime]; its left bound is still alive-or-weak
    expect(result).toBe(toTime)
    expect(healthAt(policy, item, left + MINUTE)).toBeGreaterThanOrEqual(policy.thresholds.dead)
    expect(healthAt(policy, item, result)).toBeLessThan(policy.thresholds.dead)
  })

  it("state at the bisected dead crossing is dead, and weak one minute earlier", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy)

    const result = bisectCrossing(item, policy, policy.thresholds.dead, T0, T0 + 100 * HOUR)

    expect(stateAt(policy, item, result)).toBe("dead")
    expect(stateAt(policy, item, result - MINUTE)).toBe("weak")
  })

  it("state at the bisected weak crossing is weak, and alive one minute earlier", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy)

    const result = bisectCrossing(item, policy, policy.thresholds.weak, T0, T0 + 100 * HOUR)

    expect(stateAt(policy, item, result)).toBe("weak")
    expect(stateAt(policy, item, result - MINUTE)).toBe("alive")
  })
})

describe("findDeathAfter", () => {
  it("returns null when the item is still not dead at toTime", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy)
    // At 80h health is 20 + 1/7: weak, not dead
    const toTime = T0 + 80 * HOUR

    expect(stateAt(policy, item, toTime)).toBe("weak")
    expect(findDeathAfter(item, policy, T0, toTime)).toBeNull()
  })

  it("returns the dead-threshold crossing when the item dies inside the window", () => {
    const policy = new FakePolicy()
    const item = makeItem(policy)
    const exact = exactCrossing(item, policy.thresholds.dead)
    const fromTime = T0 + 10 * HOUR
    const toTime = T0 + 200 * HOUR

    const result = findDeathAfter(item, policy, fromTime, toTime)

    expect(result).toBe(bisectCrossing(item, policy, policy.thresholds.dead, fromTime, toTime))
    expect(result).toBeGreaterThan(exact)
    expect(result).toBeLessThanOrEqual(exact + MINUTE)
    expect(stateAt(policy, item, result as number)).toBe("dead")
    expect(stateAt(policy, item, (result as number) - MINUTE)).toBe("weak")
  })
})
