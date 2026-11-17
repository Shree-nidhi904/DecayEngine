import { describe, it, expect } from "vitest"
import {
  deriveState,
  validateThresholds,
  clampHealth,
  applyHealth,
} from "../../src/state-derivation"
import type { Crossings } from "../../src/state-derivation"
import { DecayEngineError } from "../../src/errors"
import type { DecayEngineErrorCode } from "../../src/errors"
import type { Item } from "../../src/types"
import * as indexModule from "../../src/index"

// Fixed timestamps. Tests never read the real clock.
const T0 = 1_000_000
const HOUR = 3_600_000
const DAY = 24 * HOUR

// Non-default thresholds so nothing depends on 60/0 style constants
const TH_A = { weak: 50, dead: 20 }
const TH_B = { weak: 70, dead: 10 }

type TestPayload = { name: string }
type TestPolicyData = { halfLifeDays: number }
type TestItem = Item<TestPayload, TestPolicyData>

function makeItem(overrides: Partial<TestItem> = {}): TestItem {
  return {
    id: "item-1",
    payload: { name: "Capital of Peru" },
    policyData: { halfLifeDays: 10 },
    health: 80,
    state: "alive",
    createdAt: T0,
    lastEventAt: T0,
    timesResurrected: 0,
    importance: 2,
    costMinutes: 5,
    ...overrides,
  }
}

// Asserts that fn throws a DecayEngineError carrying the given code.
// Fails if fn does not throw at all.
function expectEngineError(fn: () => unknown, code: DecayEngineErrorCode): void {
  expect(fn).toThrow(DecayEngineError)
  expect(fn).toThrow(expect.objectContaining({ code, name: "DecayEngineError" }))
}

describe("deriveState", () => {
  it.each([
    { health: 50, expected: "alive" }, // exactly weak threshold
    { health: 49.999, expected: "weak" }, // just below weak
    { health: 20, expected: "weak" }, // exactly dead threshold
    { health: 19.999, expected: "dead" }, // just below dead
    { health: 0, expected: "dead" },
    { health: 100, expected: "alive" },
  ] as const)("with { weak: 50, dead: 20 }: health $health -> $expected", ({ health, expected }) => {
    expect(deriveState(health, TH_A)).toBe(expected)
  })

  it.each([
    { health: 70, expected: "alive" },
    { health: 69.999, expected: "weak" },
    { health: 10, expected: "weak" },
    { health: 9.999, expected: "dead" },
  ] as const)("with { weak: 70, dead: 10 }: health $health -> $expected", ({ health, expected }) => {
    expect(deriveState(health, TH_B)).toBe(expected)
  })
})

describe("public index exports", () => {
  it("re-exports the same deriveState and validateThresholds functions", () => {
    expect(indexModule.deriveState).toBe(deriveState)
    expect(indexModule.validateThresholds).toBe(validateThresholds)
  })

  it("does not export clampHealth or applyHealth", () => {
    expect("clampHealth" in indexModule).toBe(false)
    expect("applyHealth" in indexModule).toBe(false)
  })
})

describe("validateThresholds", () => {
  it.each([
    { weak: 50, dead: 20 },
    { weak: 70, dead: 10 },
    { weak: 100, dead: 99.5 },
    { weak: 0.2, dead: 0.1 },
  ])("accepts { weak: $weak, dead: $dead }", (thresholds) => {
    expect(() => validateThresholds(thresholds)).not.toThrow()
  })

  it.each([
    { label: "non-number weak", weak: "50" as unknown as number, dead: 20 },
    { label: "non-number dead", weak: 50, dead: "20" as unknown as number },
    { label: "NaN weak", weak: Number.NaN, dead: 20 },
    { label: "NaN dead", weak: 50, dead: Number.NaN },
    { label: "Infinity weak", weak: Number.POSITIVE_INFINITY, dead: 20 },
    { label: "-Infinity dead", weak: 50, dead: Number.NEGATIVE_INFINITY },
    { label: "dead === 0", weak: 50, dead: 0 },
    { label: "negative dead", weak: 50, dead: -5 },
    { label: "weak > 100", weak: 101, dead: 20 },
    { label: "dead === weak", weak: 40, dead: 40 },
    { label: "dead > weak", weak: 30, dead: 40 },
  ])("rejects $label with INVALID_THRESHOLDS", ({ weak, dead }) => {
    expectEngineError(() => validateThresholds({ weak, dead }), "INVALID_THRESHOLDS")
  })
})

describe("clampHealth", () => {
  it.each([
    { input: -5, expected: 0 },
    { input: 0, expected: 0 },
    { input: 100, expected: 100 },
    { input: 150, expected: 100 },
    { input: 42.5, expected: 42.5 },
  ])("clamps $input to $expected", ({ input, expected }) => {
    expect(clampHealth(input)).toBe(expected)
  })

  it.each([
    { label: "NaN", input: Number.NaN },
    { label: "Infinity", input: Number.POSITIVE_INFINITY },
    { label: "-Infinity", input: Number.NEGATIVE_INFINITY },
    { label: 'string "50"', input: "50" },
    { label: "undefined", input: undefined },
    { label: "null", input: null },
  ])("rejects $label with INVALID_HEALTH", ({ input }) => {
    expectEngineError(() => clampHealth(input), "INVALID_HEALTH")
  })

  // Requirement 16.5: the error names the policy function and the bad value
  it.each([
    { label: "NaN", input: Number.NaN, shown: "NaN" },
    { label: "Infinity", input: Number.POSITIVE_INFINITY, shown: "Infinity" },
    { label: 'string "abc"', input: "abc", shown: "abc" },
  ])("with source healthAt, rejects $label naming healthAt and the value", ({ input, shown }) => {
    const fn = () => clampHealth(input, "healthAt")
    expectEngineError(fn, "INVALID_HEALTH")
    expect(fn).toThrow(`Policy healthAt returned invalid health: ${shown}`)
  })
})

describe("applyHealth", () => {
  const now = T0 + 10 * DAY
  const weakAt = T0 + 4 * DAY
  const deadAt = T0 + 8 * DAY

  it("alive -> weak with crossings.weakAt: entry timestamp is weakAt", () => {
    const item = makeItem({ health: 80, state: "alive" })
    const crossings: Crossings = { weakAt }
    const result = applyHealth(item, 35, now, TH_A, crossings)

    expect(result.item).toEqual({ ...item, health: 35, state: "weak", lastEventAt: now })
    expect(result.item.diedAt).toBeUndefined()
    expect(result.historyEntries).toEqual([
      {
        type: "state-changed",
        itemId: "item-1",
        timestamp: weakAt,
        health: 35,
        from: "alive",
        to: "weak",
      },
    ])
  })

  it("alive -> weak without crossings: entry timestamp is now", () => {
    const item = makeItem({ health: 80, state: "alive" })
    const result = applyHealth(item, 35, now, TH_A)

    expect(result.item).toEqual({ ...item, health: 35, state: "weak", lastEventAt: now })
    expect(result.historyEntries).toEqual([
      {
        type: "state-changed",
        itemId: "item-1",
        timestamp: now,
        health: 35,
        from: "alive",
        to: "weak",
      },
    ])
  })

  it("weak -> alive: entry timestamp is now even when crossings.weakAt is given", () => {
    const item = makeItem({ health: 30, state: "weak" })
    const result = applyHealth(item, 90, now, TH_A, { weakAt })

    expect(result.item).toEqual({ ...item, health: 90, state: "alive", lastEventAt: now })
    expect(result.item.diedAt).toBeUndefined()
    expect(result.historyEntries).toEqual([
      {
        type: "state-changed",
        itemId: "item-1",
        timestamp: now,
        health: 90,
        from: "weak",
        to: "alive",
      },
    ])
  })

  it("weak -> dead with crossings.deadAt: diedAt is deadAt, health 0, single died entry", () => {
    const item = makeItem({ health: 30, state: "weak" })
    // 5 is above 0 but below dead (20), so it must be clamped to 0
    const result = applyHealth(item, 5, now, TH_A, { deadAt })

    expect(result.item).toEqual({
      ...item,
      health: 0,
      state: "dead",
      lastEventAt: now,
      diedAt: deadAt,
    })
    expect(result.historyEntries).toEqual([
      { type: "died", itemId: "item-1", timestamp: deadAt, health: 0 },
    ])
  })

  it("weak -> dead without crossings: diedAt is now", () => {
    const item = makeItem({ health: 30, state: "weak" })
    const result = applyHealth(item, 5, now, TH_A)

    expect(result.item).toEqual({
      ...item,
      health: 0,
      state: "dead",
      lastEventAt: now,
      diedAt: now,
    })
    expect(result.historyEntries).toEqual([
      { type: "died", itemId: "item-1", timestamp: now, health: 0 },
    ])
  })

  it("alive -> dead with both crossings: state-changed (alive -> weak) at weakAt, then died at deadAt", () => {
    const item = makeItem({ health: 90, state: "alive" })
    const result = applyHealth(item, 3, now, TH_B, { weakAt, deadAt })

    expect(result.item).toEqual({
      ...item,
      health: 0,
      state: "dead",
      lastEventAt: now,
      diedAt: deadAt,
    })
    expect(result.historyEntries).toEqual([
      {
        type: "state-changed",
        itemId: "item-1",
        timestamp: weakAt,
        health: TH_B.weak,
        from: "alive",
        to: "weak",
      },
      { type: "died", itemId: "item-1", timestamp: deadAt, health: 0 },
    ])
  })

  it("alive -> dead with only crossings.deadAt: state-changed timestamp falls back to deadAt", () => {
    const item = makeItem({ health: 90, state: "alive" })
    const result = applyHealth(item, 3, now, TH_B, { deadAt })

    expect(result.item.diedAt).toBe(deadAt)
    expect(result.historyEntries).toEqual([
      {
        type: "state-changed",
        itemId: "item-1",
        timestamp: deadAt,
        health: TH_B.weak,
        from: "alive",
        to: "weak",
      },
      { type: "died", itemId: "item-1", timestamp: deadAt, health: 0 },
    ])
  })

  it("alive -> dead with no crossings: both entries at now", () => {
    const item = makeItem({ health: 90, state: "alive" })
    const result = applyHealth(item, 3, now, TH_B)

    expect(result.item).toEqual({
      ...item,
      health: 0,
      state: "dead",
      lastEventAt: now,
      diedAt: now,
    })
    expect(result.historyEntries).toEqual([
      {
        type: "state-changed",
        itemId: "item-1",
        timestamp: now,
        health: TH_B.weak,
        from: "alive",
        to: "weak",
      },
      { type: "died", itemId: "item-1", timestamp: now, health: 0 },
    ])
  })

  it("alive -> alive: health and lastEventAt update, no entries", () => {
    const item = makeItem({ health: 90, state: "alive" })
    const result = applyHealth(item, 75, now, TH_A, { weakAt, deadAt })

    expect(result.item).toEqual({ ...item, health: 75, state: "alive", lastEventAt: now })
    expect(result.item.diedAt).toBeUndefined()
    expect(result.historyEntries).toEqual([])
  })

  it("weak -> weak: health and lastEventAt update, no entries", () => {
    const item = makeItem({ health: 45, state: "weak" })
    const result = applyHealth(item, 25, now, TH_A)

    expect(result.item).toEqual({ ...item, health: 25, state: "weak", lastEventAt: now })
    expect(result.item.diedAt).toBeUndefined()
    expect(result.historyEntries).toEqual([])
  })

  it("does not mutate the input item", () => {
    const item = makeItem({ health: 90, state: "alive" })
    // JSON round-trip is a safe deep copy here: Item fields are JSON-serializable
    const before = JSON.parse(JSON.stringify(item)) as TestItem

    const result = applyHealth(item, 3, now, TH_B, { weakAt, deadAt })

    expect(item).toEqual(before)
    expect("diedAt" in item).toBe(false)
    expect(result.item).not.toBe(item)
  })

  it("carries all other fields through unchanged", () => {
    const item = makeItem({
      id: "fact-42",
      payload: { name: "Boiling point of water" },
      policyData: { halfLifeDays: 3 },
      health: 30,
      state: "weak",
      createdAt: T0 - DAY,
      lastEventAt: T0,
      timesResurrected: 2,
      importance: 3,
      costMinutes: 15,
    })
    const result = applyHealth(item, 1, now, TH_A, { deadAt })

    expect(result.item.id).toBe("fact-42")
    expect(result.item.payload).toEqual({ name: "Boiling point of water" })
    expect(result.item.policyData).toEqual({ halfLifeDays: 3 })
    expect(result.item.createdAt).toBe(T0 - DAY)
    expect(result.item.timesResurrected).toBe(2)
    expect(result.item.importance).toBe(3)
    expect(result.item.costMinutes).toBe(15)
    expect(result.historyEntries.every((e) => e.itemId === "fact-42")).toBe(true)
  })
})
