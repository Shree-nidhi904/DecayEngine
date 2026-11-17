import { describe, it, expect } from "vitest"
import { validateItem, parseSnapshot, serializeSnapshot } from "../../src/serialization"
import { DecayEngineError } from "../../src/errors"
import type { DecayEngineErrorCode } from "../../src/errors"
import type { EngineState, HistoryEntry, Item } from "../../src/types"

// Fixed timestamps. Tests never read the real clock.
const T0 = 1_000_000
const HOUR = 3_600_000
const DAY = 24 * HOUR

type TestPayload = { name: string }
type TestPolicyData = { halfLifeDays: number }
type TestItem = Item<TestPayload, TestPolicyData>

// Fictional sample data
function makeItem(overrides: Partial<TestItem> = {}): TestItem {
  return {
    id: "item-1",
    payload: { name: "Capital of Peru" },
    policyData: { halfLifeDays: 10 },
    health: 80,
    state: "alive",
    createdAt: T0,
    lastEventAt: T0 + HOUR,
    timesResurrected: 0,
    importance: 2,
    costMinutes: 5,
    ...overrides,
  }
}

function makeDeadItem(overrides: Partial<TestItem> = {}): TestItem {
  return makeItem({
    id: "item-dead",
    health: 0,
    state: "dead",
    lastEventAt: T0 + 5 * DAY,
    diedAt: T0 + 4 * DAY,
    ...overrides,
  })
}

// Item as plain record, so tests can remove fields or set wrong types.
function rawItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...makeItem(), ...overrides }
}

function without(obj: Record<string, unknown>, field: string): Record<string, unknown> {
  const copy = { ...obj }
  delete copy[field]
  return copy
}

// Asserts that fn throws a DecayEngineError carrying the given code.
// Fails if fn does not throw at all.
function expectEngineError(fn: () => unknown, code: DecayEngineErrorCode): void {
  expect(fn).toThrow(DecayEngineError)
  expect(fn).toThrow(expect.objectContaining({ code, name: "DecayEngineError" }))
}

// Requirement 15.4: the error indicates which field failed validation.
// Word boundaries so that "id" does not match inside "Invalid".
function expectInvalidField(fn: () => unknown, field: string): void {
  expectEngineError(fn, "INVALID_ITEM_DATA")
  expect(fn).toThrow(new RegExp(`\\b${field}\\b`))
}

describe("validateItem: valid items", () => {
  it("accepts an alive item without diedAt and returns the same field values", () => {
    const item = makeItem()
    expect(validateItem(item)).toEqual(item)
  })

  it("accepts a weak item", () => {
    const item = makeItem({ health: 30, state: "weak" })
    expect(validateItem(item)).toEqual(item)
  })

  it("accepts a dead item with diedAt", () => {
    const item = makeDeadItem()
    expect(validateItem(item)).toEqual(item)
  })

  it("accepts a resurrected item (timesResurrected > 0)", () => {
    const item = makeItem({ timesResurrected: 3 })
    expect(validateItem(item)).toEqual(item)
  })

  it("accepts timestamps of 0", () => {
    const item = makeDeadItem({ createdAt: 0, lastEventAt: 0, diedAt: 0 })
    expect(validateItem(item)).toEqual(item)
  })

  it.each([0, 100])("accepts health boundary %s", (health) => {
    const item =
      health === 0 ? makeDeadItem({ health }) : makeItem({ health, state: "alive" })
    expect(validateItem(item)).toEqual(item)
  })

  it.each([1, 2, 3])("accepts importance %s", (importance) => {
    const item = makeItem({ importance })
    expect(validateItem(item)).toEqual(item)
  })

  it.each([1, 600])("accepts costMinutes boundary %s", (costMinutes) => {
    const item = makeItem({ costMinutes })
    expect(validateItem(item)).toEqual(item)
  })
})

describe("validateItem: missing required fields", () => {
  it.each([
    "id",
    "payload",
    "policyData",
    "health",
    "state",
    "createdAt",
    "lastEventAt",
    "timesResurrected",
    "importance",
    "costMinutes",
  ])("rejects an item missing %s and names the field", (field) => {
    expectInvalidField(() => validateItem(without(rawItem(), field)), field)
  })
})

describe("validateItem: invalid field types", () => {
  it.each([
    { field: "id", value: 42 },
    { field: "id", value: "" },
    { field: "health", value: "80" },
    { field: "state", value: 1 },
    { field: "createdAt", value: "1000000" },
    { field: "lastEventAt", value: null },
    { field: "diedAt", value: "yesterday" },
    { field: "timesResurrected", value: "0" },
    { field: "importance", value: "2" },
    { field: "costMinutes", value: "5" },
  ])("rejects $field = $value and names the field", ({ field, value }) => {
    expectInvalidField(() => validateItem(rawItem({ [field]: value })), field)
  })

  it.each([
    { field: "createdAt", value: -1 },
    { field: "createdAt", value: Number.POSITIVE_INFINITY },
    { field: "lastEventAt", value: -1 },
    { field: "lastEventAt", value: Number.NaN },
    { field: "diedAt", value: -1 },
    { field: "diedAt", value: Number.POSITIVE_INFINITY },
  ])("rejects timestamp $field = $value and names the field", ({ field, value }) => {
    expectInvalidField(() => validateItem(rawItem({ [field]: value })), field)
  })

  it.each([-1, 1.5])("rejects timesResurrected %s", (timesResurrected) => {
    expectInvalidField(
      () => validateItem(rawItem({ timesResurrected })),
      "timesResurrected"
    )
  })
})

describe("validateItem: health out of range", () => {
  it.each([-0.01, 100.01, -1, 101, Number.NaN])("rejects health %s", (health) => {
    expectInvalidField(() => validateItem(rawItem({ health })), "health")
  })
})

describe("validateItem: invalid state values", () => {
  it.each(["resurrected", "ALIVE", "", "zombie"])("rejects state %j", (state) => {
    expectInvalidField(() => validateItem(rawItem({ state })), "state")
  })
})

describe("validateItem: dead items missing diedAt", () => {
  it("rejects a dead item without diedAt, naming diedAt and the dead state", () => {
    const item = without({ ...makeDeadItem() }, "diedAt")
    const fn = () => validateItem(item)
    expectInvalidField(fn, "diedAt")
    expect(fn).toThrow(/dead/)
  })
})

describe("validateItem: dead items with health above 0", () => {
  it("rejects a dead item with health 5 and names health", () => {
    expectInvalidField(() => validateItem(makeDeadItem({ health: 5 })), "health")
  })
})

describe("validateItem: invalid importance", () => {
  it.each([0, 4, 1.5])("rejects importance %s", (importance) => {
    expectInvalidField(() => validateItem(rawItem({ importance })), "importance")
  })
})

describe("validateItem: invalid costMinutes", () => {
  it.each([0, -1, 601, 1.5])("rejects costMinutes %s", (costMinutes) => {
    expectInvalidField(() => validateItem(rawItem({ costMinutes })), "costMinutes")
  })
})

// Shared fixture: two items, each with its own history in timestamp order.
const ALIVE = makeItem({ id: "fact-a" })
const DEAD = makeDeadItem({ id: "fact-b", timesResurrected: 1 })

const HISTORY_A: HistoryEntry[] = [
  { type: "created", itemId: "fact-a", timestamp: T0, health: 100 },
  { type: "tended", itemId: "fact-a", timestamp: T0 + HOUR, health: 80, event: { correct: true } },
]
const HISTORY_B: HistoryEntry[] = [
  { type: "created", itemId: "fact-b", timestamp: T0, health: 100 },
  { type: "state-changed", itemId: "fact-b", timestamp: T0 + DAY, health: 40, from: "alive", to: "weak" },
  { type: "died", itemId: "fact-b", timestamp: T0 + 4 * DAY, health: 0 },
]

function makeState(): EngineState<TestPayload, TestPolicyData> {
  return {
    items: new Map([
      [ALIVE.id, ALIVE],
      [DEAD.id, DEAD],
    ]),
    history: new Map([
      [ALIVE.id, HISTORY_A],
      [DEAD.id, HISTORY_B],
    ]),
  }
}

describe("parseSnapshot: valid snapshots", () => {
  it("parses an empty snapshot into empty Maps", () => {
    const state = parseSnapshot({ schemaVersion: 1, items: [], history: [] })
    expect(state.items).toBeInstanceOf(Map)
    expect(state.history).toBeInstanceOf(Map)
    expect(state.items.size).toBe(0)
    expect(state.history.size).toBe(0)
  })

  it("keys items by id and groups flat history per item in stored order", () => {
    const state = parseSnapshot<TestPayload, TestPolicyData>({
      schemaVersion: 1,
      items: [ALIVE, DEAD],
      // Interleaved across items, as a flat stored array may be
      history: [HISTORY_A[0], HISTORY_B[0], HISTORY_B[1], HISTORY_A[1], HISTORY_B[2]],
    })
    expect(state.items.size).toBe(2)
    expect(state.items.get("fact-a")).toEqual(ALIVE)
    expect(state.items.get("fact-b")).toEqual(DEAD)
    expect(state.history.get("fact-a")).toEqual(HISTORY_A)
    expect(state.history.get("fact-b")).toEqual(HISTORY_B)
  })
})

describe("parseSnapshot: invalid snapshots", () => {
  it.each([
    { label: "null", data: null },
    { label: "a string", data: "snapshot" },
    { label: "an array", data: [] },
  ])("rejects $label with INVALID_SNAPSHOT", ({ data }) => {
    expectEngineError(() => parseSnapshot(data), "INVALID_SNAPSHOT")
  })

  it.each([
    { label: "items missing", data: { schemaVersion: 1, history: [] } },
    { label: "items not an array", data: { schemaVersion: 1, items: {}, history: [] } },
    { label: "history missing", data: { schemaVersion: 1, items: [] } },
    { label: "history not an array", data: { schemaVersion: 1, items: [], history: "x" } },
  ])("rejects a snapshot with $label with INVALID_SNAPSHOT", ({ data }) => {
    expectEngineError(() => parseSnapshot(data), "INVALID_SNAPSHOT")
  })

  it.each([0, 2, 99])(
    "rejects schemaVersion %s with UNSUPPORTED_SCHEMA_VERSION naming found and expected versions",
    (schemaVersion) => {
      const fn = () => parseSnapshot({ schemaVersion, items: [], history: [] })
      expectEngineError(fn, "UNSUPPORTED_SCHEMA_VERSION")
      expect(fn).toThrow(new RegExp(`\\b${schemaVersion}\\b`))
      expect(fn).toThrow(/\b1\b/)
    }
  )

  it("rejects a snapshot containing an invalid item with INVALID_ITEM_DATA naming the field", () => {
    const bad = { ...DEAD, importance: 4 }
    expectInvalidField(
      () => parseSnapshot({ schemaVersion: 1, items: [ALIVE, bad], history: [] }),
      "importance"
    )
  })

  it("rejects a snapshot with duplicate item ids with INVALID_SNAPSHOT", () => {
    const twin = makeItem({ id: "fact-a", payload: { name: "Capital of Chile" } })
    expectEngineError(
      () => parseSnapshot({ schemaVersion: 1, items: [ALIVE, twin], history: [] }),
      "INVALID_SNAPSHOT"
    )
  })

  it("rejects a history entry whose itemId matches no item with INVALID_SNAPSHOT", () => {
    const orphan: HistoryEntry = { type: "created", itemId: "fact-zzz", timestamp: T0, health: 100 }
    expectEngineError(
      () =>
        parseSnapshot({ schemaVersion: 1, items: [ALIVE], history: [HISTORY_A[0], orphan] }),
      "INVALID_SNAPSHOT"
    )
  })

  it("rejects a snapshot containing a dead item without diedAt", () => {
    const bad = without({ ...DEAD }, "diedAt")
    expectInvalidField(
      () => parseSnapshot({ schemaVersion: 1, items: [bad], history: [] }),
      "diedAt"
    )
  })
})

describe("serializeSnapshot", () => {
  it("converts Maps to arrays with schemaVersion 1", () => {
    const stored = serializeSnapshot(makeState())
    expect(stored.schemaVersion).toBe(1)
    expect(Array.isArray(stored.items)).toBe(true)
    expect(Array.isArray(stored.history)).toBe(true)
    expect(stored.items).toHaveLength(2)
    expect(stored.items).toEqual(expect.arrayContaining([ALIVE, DEAD]))
    expect(stored.history).toHaveLength(HISTORY_A.length + HISTORY_B.length)
  })

  it("keeps each item's history entries in their original order", () => {
    const stored = serializeSnapshot(makeState())
    expect(stored.history.filter((e) => e.itemId === "fact-a")).toEqual(HISTORY_A)
    expect(stored.history.filter((e) => e.itemId === "fact-b")).toEqual(HISTORY_B)
  })

  it("includes every item field, with diedAt for a dead item (Requirement 15.1)", () => {
    const stored = serializeSnapshot(makeState())
    const dead = stored.items.find((i) => i.id === "fact-b")
    expect(dead).toBeDefined()
    expect(Object.keys(dead as object).sort()).toEqual(
      [
        "id",
        "payload",
        "policyData",
        "health",
        "state",
        "createdAt",
        "lastEventAt",
        "diedAt",
        "timesResurrected",
        "importance",
        "costMinutes",
      ].sort()
    )
    expect(dead).toEqual(DEAD)
  })

  it("stores no undefined values when diedAt was cleared to undefined", () => {
    const cleared: TestItem = { ...makeItem({ id: "fact-c", timesResurrected: 1 }), diedAt: undefined }
    const stored = serializeSnapshot<TestPayload, TestPolicyData>({
      items: new Map([[cleared.id, cleared]]),
      history: new Map([[cleared.id, []]]),
    })
    expect(Object.values(stored.items[0] as object)).not.toContain(undefined)
  })

  it("produces a snapshot that survives JSON unchanged", () => {
    const stored = serializeSnapshot(makeState())
    expect(JSON.parse(JSON.stringify(stored))).toEqual(stored)
  })

  it("serializes an empty state to empty arrays", () => {
    const stored = serializeSnapshot({ items: new Map(), history: new Map() })
    expect(stored).toEqual({ schemaVersion: 1, items: [], history: [] })
  })
})

describe("round-trip: serializeSnapshot then parseSnapshot", () => {
  it("produces the same items and history", () => {
    const original = makeState()
    const restored = parseSnapshot<TestPayload, TestPolicyData>(serializeSnapshot(original))
    expect(restored.items).toEqual(original.items)
    expect(restored.history).toEqual(original.history)
    expect(restored.items.get("fact-b")).toStrictEqual(DEAD)
  })

  it("produces the same data after passing through JSON (as localStorage does)", () => {
    const original = makeState()
    const json = JSON.stringify(serializeSnapshot(original))
    const restored = parseSnapshot<TestPayload, TestPolicyData>(JSON.parse(json))
    expect(restored.items).toEqual(original.items)
    expect(restored.history).toEqual(original.history)
  })

  it("round-trips an empty state", () => {
    const restored = parseSnapshot(serializeSnapshot({ items: new Map(), history: new Map() }))
    expect(restored.items.size).toBe(0)
    expect(restored.history.size).toBe(0)
  })
})
