import { describe, it, expect, vi, afterEach } from "vitest"
import { FakePolicy } from "../fake-policy"
import type { FakePayload, FakePolicyData, FakeEvent } from "../fake-policy"
import type { Item } from "../../src/types"

// Fixed timestamps. Tests never read the real clock.
const T0 = 1_000_000
const HOUR = 3_600_000

// Default fake decay rate: 1 health per hour, in health per millisecond.
const DEFAULT_RATE = 1 / HOUR

// A rate that is exact in binary floating point (1 health per 1024 ms),
// used where a test wants exact equality on computed times.
const EXACT_RATE = 1 / 1024

type FakeItem = Item<FakePayload, FakePolicyData>

function makeItem(overrides: Partial<FakeItem> = {}): FakeItem {
  return {
    id: "item-1",
    payload: { name: "Capital of Peru" },
    policyData: { decayRate: DEFAULT_RATE },
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

function isPromiseLike(value: unknown): boolean {
  return (
    value instanceof Promise ||
    (typeof value === "object" &&
      value !== null &&
      typeof (value as { then?: unknown }).then === "function")
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("FakePolicy thresholds and init", () => {
  it("uses thresholds weak = 50, dead = 20", () => {
    expect(new FakePolicy().thresholds).toEqual({ weak: 50, dead: 20 })
  })

  it("init returns a decay rate of 1 health per hour (1 / 3_600_000 per ms)", () => {
    const policy = new FakePolicy()
    expect(policy.init({ name: "Capital of Peru" }, T0)).toEqual({ decayRate: 1 / 3_600_000 })
  })

  it("init returns the same policyData regardless of payload and now", () => {
    const policy = new FakePolicy()
    const a = policy.init({ name: "A" }, T0)
    const b = policy.init({ name: "B" }, T0 + 1000 * HOUR)
    expect(a).toEqual(b)
  })
})

describe("FakePolicy never reads the clock", () => {
  it("runs every policy function with Date.now, new Date() and performance.now all throwing", () => {
    const nowSpy = vi.fn((): number => {
      throw new Error("clock read: Date.now()")
    })
    const dateCtorSpy = vi.fn()
    class ThrowingDate {
      static now = nowSpy
      constructor(...args: unknown[]) {
        dateCtorSpy(...args)
        throw new Error("clock read: new Date()")
      }
    }
    const perfNowSpy = vi.fn((): number => {
      throw new Error("clock read: performance.now()")
    })
    vi.stubGlobal("Date", ThrowingDate)
    vi.stubGlobal("performance", { now: perfNowSpy })

    // Run every function while the clock is poisoned. Results are collected
    // and asserted after the globals are restored, so vitest internals never
    // see the stubbed Date. Any clock read throws and fails this test.
    const policy = new FakePolicy()
    const policyData = policy.init({ name: "Capital of Peru" }, T0)
    const item = makeItem({ policyData, health: 100, lastEventAt: T0 })
    const health = policy.healthAt(item, T0 + 10 * HOUR)
    const boosted = policy.applyEvent(item, { type: "boost", amount: 5 }, T0 + HOUR)
    const damaged = policy.applyEvent(item, { type: "damage", amount: 5 }, T0 + HOUR)
    const due = policy.nextDueAt(item, T0)
    const resurrectOk = policy.resurrect(item, { type: "boost", amount: 1 }, T0)
    policy.setResurrectFailure(true)
    const resurrectFail = policy.resurrect(item, { type: "boost", amount: 1 }, T0)

    vi.unstubAllGlobals()

    expect(nowSpy).not.toHaveBeenCalled()
    expect(dateCtorSpy).not.toHaveBeenCalled()
    expect(perfNowSpy).not.toHaveBeenCalled()

    expect(policyData).toEqual({ decayRate: DEFAULT_RATE })
    expect(health).toBeCloseTo(90, 9)
    expect(boosted).toEqual({ health: 105, policyData })
    expect(damaged).toEqual({ health: 95, policyData })
    expect(due).not.toBeNull()
    expect(Math.abs(due! - (T0 + 50 * HOUR))).toBeLessThan(1)
    expect(resurrectOk).toEqual({ ok: true })
    expect(resurrectFail).toEqual({ ok: false, reason: "Resurrection not available" })
  })
})

describe("FakePolicy.healthAt", () => {
  it("returns item.health unchanged when now equals lastEventAt", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 73.5, lastEventAt: T0 })
    expect(policy.healthAt(item, T0)).toBe(73.5)
  })

  it.each([
    { hours: 1, expected: 99 },
    { hours: 10, expected: 90 },
    { hours: 50, expected: 50 }, // reaches the weak threshold
    { hours: 80, expected: 20 }, // reaches the dead threshold
    { hours: 100, expected: 0 },
  ])("at the default rate, health 100 after $hours hours is $expected", ({ hours, expected }) => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 100, lastEventAt: T0, policyData: policy.init({ name: "x" }, T0) })
    expect(policy.healthAt(item, T0 + hours * HOUR)).toBeCloseTo(expected, 9)
  })

  it("decays in proportion to elapsed time: 30 minutes costs 0.5 health", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 60, lastEventAt: T0 })
    expect(policy.healthAt(item, T0 + 30 * 60_000)).toBeCloseTo(59.5, 9)
  })

  it("measures decay from lastEventAt, not createdAt", () => {
    const policy = new FakePolicy()
    // Created at T0, last tended at T0 + 5h with health 70.
    const item = makeItem({ createdAt: T0, lastEventAt: T0 + 5 * HOUR, health: 70 })
    // 10 hours after the last event: 70 - 10 = 60
    expect(policy.healthAt(item, T0 + 15 * HOUR)).toBeCloseTo(60, 9)
  })

  it("uses the decayRate stored in item.policyData", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 100, lastEventAt: T0, policyData: { decayRate: EXACT_RATE } })
    // 2048 ms at 1/1024 per ms = exactly 2 health
    expect(policy.healthAt(item, T0 + 2048)).toBe(98)
    // 10240 ms = exactly 10 health
    expect(policy.healthAt(item, T0 + 10240)).toBe(90)
  })

  it("does not clamp: decay past zero returns a negative number (the engine clamps)", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 10, lastEventAt: T0, policyData: { decayRate: EXACT_RATE } })
    // 20480 ms = 20 health lost from 10
    expect(policy.healthAt(item, T0 + 20480)).toBe(-10)
  })
})

describe("FakePolicy.applyEvent boost", () => {
  it("adds the boost amount to item.health", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 40 })
    const result = policy.applyEvent(item, { type: "boost", amount: 25 }, T0)
    expect(result.health).toBe(65)
  })

  it("returns policyData unchanged", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 40, policyData: { decayRate: EXACT_RATE } })
    const result = policy.applyEvent(item, { type: "boost", amount: 25 }, T0)
    expect(result).toEqual({ health: 65, policyData: { decayRate: EXACT_RATE } })
  })

  it("starts from item.health, not from decayed health at now", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 40, lastEventAt: T0 })
    // 10 hours have passed, but applyEvent works on stored health; the engine settles first.
    const result = policy.applyEvent(item, { type: "boost", amount: 25 }, T0 + 10 * HOUR)
    expect(result.health).toBe(65)
  })

  it("can return health above 100 (no clamping in the fake policy)", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 90 })
    const result = policy.applyEvent(item, { type: "boost", amount: 30 }, T0)
    expect(result.health).toBe(120)
  })

  it("does not mutate the input item", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 40 })
    const before = JSON.parse(JSON.stringify(item)) as FakeItem
    policy.applyEvent(item, { type: "boost", amount: 25 }, T0)
    expect(item).toEqual(before)
  })
})

describe("FakePolicy.applyEvent damage", () => {
  it("subtracts the damage amount from item.health", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 70 })
    const result = policy.applyEvent(item, { type: "damage", amount: 25 }, T0)
    expect(result.health).toBe(45)
  })

  it("returns policyData unchanged", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 70, policyData: { decayRate: EXACT_RATE } })
    const result = policy.applyEvent(item, { type: "damage", amount: 25 }, T0)
    expect(result).toEqual({ health: 45, policyData: { decayRate: EXACT_RATE } })
  })

  it("can return health below 0 (no clamping in the fake policy)", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 10 })
    const result = policy.applyEvent(item, { type: "damage", amount: 30 }, T0)
    expect(result.health).toBe(-20)
  })

  it("does not mutate the input item", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 70 })
    const before = JSON.parse(JSON.stringify(item)) as FakeItem
    policy.applyEvent(item, { type: "damage", amount: 25 }, T0)
    expect(item).toEqual(before)
  })
})

describe("FakePolicy.nextDueAt", () => {
  it("at the default rate, health 100 at T0 is due 50 hours later (when it reaches weak = 50)", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 100, lastEventAt: T0 })
    // Within 1 ms of the exact answer (floating-point rate 1 / 3_600_000)
    expect(Math.abs(policy.nextDueAt(item, T0)! - (T0 + 50 * HOUR))).toBeLessThan(1)
  })

  it("gives the same due time whether asked at T0 or 10 hours later", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 100, lastEventAt: T0 })
    // At T0 + 10h health is 90; 40 more hours to reach 50
    expect(Math.abs(policy.nextDueAt(item, T0 + 10 * HOUR)! - (T0 + 50 * HOUR))).toBeLessThan(1)
  })

  it("computes the exact time until weak with an exact rate", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 80, lastEventAt: T0, policyData: { decayRate: EXACT_RATE } })
    // (80 - 50) / (1/1024) = 30 * 1024 = 30720 ms
    expect(policy.nextDueAt(item, T0)).toBe(T0 + 30720)
    // Asked 1024 ms later: health 79, (79 - 50) * 1024 = 29696; T0 + 1024 + 29696 = T0 + 30720
    expect(policy.nextDueAt(item, T0 + 1024)).toBe(T0 + 30720)
  })

  it("returns now when health at now is exactly the weak threshold", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 50, lastEventAt: T0, policyData: { decayRate: EXACT_RATE } })
    expect(policy.nextDueAt(item, T0)).toBe(T0)
  })

  it("returns now when the item is already below the weak threshold", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 45, state: "weak", lastEventAt: T0 })
    expect(policy.nextDueAt(item, T0 + HOUR)).toBe(T0 + HOUR)
  })

  it("returns now when decay has carried health below weak by the time of the call", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 100, lastEventAt: T0 })
    // At T0 + 60h health is 40, below weak
    expect(policy.nextDueAt(item, T0 + 60 * HOUR)).toBe(T0 + 60 * HOUR)
  })
})

describe("FakePolicy.resurrect", () => {
  const boost: FakeEvent = { type: "boost", amount: 10 }
  const damage: FakeEvent = { type: "damage", amount: 10 }

  it("succeeds by default and returns a plain object synchronously", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 0, state: "dead", diedAt: T0 })
    const result = policy.resurrect(item, boost, T0 + HOUR)

    expect(isPromiseLike(result)).toBe(false)
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(result).toEqual({ ok: true })
  })

  it("succeeds after setResurrectFailure(false), for any event type", () => {
    const policy = new FakePolicy()
    policy.setResurrectFailure(false)
    const item = makeItem({ health: 0, state: "dead", diedAt: T0 })

    const r1 = policy.resurrect(item, boost, T0 + HOUR)
    const r2 = policy.resurrect(item, damage, T0 + HOUR)

    expect(isPromiseLike(r1)).toBe(false)
    expect(isPromiseLike(r2)).toBe(false)
    expect(r1).toEqual({ ok: true })
    expect(r2).toEqual({ ok: true })
  })

  it("fails after setResurrectFailure(true) and returns a plain object synchronously", () => {
    const policy = new FakePolicy()
    policy.setResurrectFailure(true)
    const item = makeItem({ health: 0, state: "dead", diedAt: T0 })
    const result = policy.resurrect(item, boost, T0 + HOUR)

    expect(isPromiseLike(result)).toBe(false)
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(result).toEqual({ ok: false, reason: "Resurrection not available" })
  })

  it("switches back to success after setResurrectFailure(true) then (false)", () => {
    const policy = new FakePolicy()
    const item = makeItem({ health: 0, state: "dead", diedAt: T0 })

    policy.setResurrectFailure(true)
    expect(policy.resurrect(item, boost, T0)).toEqual({
      ok: false,
      reason: "Resurrection not available",
    })

    policy.setResurrectFailure(false)
    expect(policy.resurrect(item, boost, T0)).toEqual({ ok: true })
  })

  it("failure setting on one instance does not affect another instance", () => {
    const failing = new FakePolicy()
    failing.setResurrectFailure(true)
    const fresh = new FakePolicy()
    const item = makeItem({ health: 0, state: "dead", diedAt: T0 })

    expect(fresh.resurrect(item, boost, T0)).toEqual({ ok: true })
    expect(failing.resurrect(item, boost, T0).ok).toBe(false)
  })
})
