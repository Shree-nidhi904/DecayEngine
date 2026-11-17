import { describe, it, expect } from "vitest"
import { InMemoryAdapter } from "../../../src/storage/memory"
import type { StoredSnapshot } from "../../../src/storage/interface"

// Fixed timestamps. Tests never read the real clock.
const T0 = 1_000_000
const HOUR = 3_600_000
const DAY = 24 * HOUR

type TestPayload = { name: string; tags: string[]; meta: { source: string } }
type TestPolicyData = { halfLifeDays: number; reviews: { at: number; correct: boolean }[] }

// Fictional sample data. Built fresh on every call so each test compares
// against values the adapter has never seen.
function makeSnapshot(): StoredSnapshot {
  const payload: TestPayload = {
    name: "Capital of Peru",
    tags: ["geography", "south-america"],
    meta: { source: "Atlas deck" },
  }
  const policyData: TestPolicyData = {
    halfLifeDays: 10,
    reviews: [{ at: T0 + HOUR, correct: true }],
  }
  return {
    schemaVersion: 1,
    items: [
      {
        id: "item-1",
        payload,
        policyData,
        health: 80,
        state: "alive",
        createdAt: T0,
        lastEventAt: T0 + HOUR,
        timesResurrected: 0,
        importance: 2,
        costMinutes: 5,
      },
    ],
    history: [
      { type: "created", itemId: "item-1", timestamp: T0, health: 100 },
      {
        type: "tended",
        itemId: "item-1",
        timestamp: T0 + HOUR,
        health: 80,
        event: { answer: "Lima", correct: true },
      },
    ],
  }
}

function makeOtherSnapshot(): StoredSnapshot {
  return {
    schemaVersion: 1,
    items: [
      {
        id: "item-2",
        payload: { name: "Mara Quill", tags: ["friend"], meta: { source: "manual" } },
        policyData: { halfLifeDays: 30, reviews: [] },
        health: 0,
        state: "dead",
        createdAt: T0 + DAY,
        lastEventAt: T0 + 20 * DAY,
        diedAt: T0 + 20 * DAY,
        timesResurrected: 1,
        importance: 3,
        costMinutes: 15,
      },
    ],
    history: [
      { type: "created", itemId: "item-2", timestamp: T0 + DAY, health: 100 },
      { type: "died", itemId: "item-2", timestamp: T0 + 20 * DAY, health: 0 },
    ],
  }
}

function payloadOf(snapshot: StoredSnapshot, index: number): TestPayload {
  return snapshot.items[index].payload as TestPayload
}

function policyDataOf(snapshot: StoredSnapshot, index: number): TestPolicyData {
  return snapshot.items[index].policyData as TestPolicyData
}

describe("InMemoryAdapter", () => {
  it("load returns null when nothing has been saved", () => {
    const adapter = new InMemoryAdapter()

    expect(adapter.load()).toBeNull()
  })

  it("save then load returns the same data", () => {
    const adapter = new InMemoryAdapter()

    adapter.save(makeSnapshot())

    expect(adapter.load()).toEqual(makeSnapshot())
  })

  it("load returns a deep copy: mutating nested fields of a loaded snapshot does not change stored data", () => {
    const adapter = new InMemoryAdapter()
    adapter.save(makeSnapshot())

    const loaded = adapter.load() as StoredSnapshot
    payloadOf(loaded, 0).name = "Changed"
    payloadOf(loaded, 0).tags.push("extra")
    payloadOf(loaded, 0).meta.source = "Changed"
    policyDataOf(loaded, 0).reviews[0].correct = false
    loaded.items[0].health = 1
    loaded.history[0].health = 1
    loaded.history.pop()
    loaded.items.push(makeOtherSnapshot().items[0])

    expect(adapter.load()).toEqual(makeSnapshot())
  })

  it("two load calls return different object references at every nesting level", () => {
    const adapter = new InMemoryAdapter()
    adapter.save(makeSnapshot())

    const first = adapter.load() as StoredSnapshot
    const second = adapter.load() as StoredSnapshot

    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first.items).not.toBe(second.items)
    expect(first.items[0]).not.toBe(second.items[0])
    expect(first.items[0].payload).not.toBe(second.items[0].payload)
    expect(payloadOf(first, 0).meta).not.toBe(payloadOf(second, 0).meta)
    expect(first.items[0].policyData).not.toBe(second.items[0].policyData)
    expect(first.history).not.toBe(second.history)
    expect(first.history[0]).not.toBe(second.history[0])
  })

  it("save stores a deep copy: mutating nested fields of the saved object afterwards does not change stored data", () => {
    const adapter = new InMemoryAdapter()
    const input = makeSnapshot()
    adapter.save(input)

    payloadOf(input, 0).name = "Changed"
    payloadOf(input, 0).tags.length = 0
    payloadOf(input, 0).meta.source = "Changed"
    policyDataOf(input, 0).reviews.push({ at: T0 + DAY, correct: false })
    input.items[0].state = "dead"
    input.history[0].timestamp = T0 + 99 * DAY
    input.history.push({ type: "died", itemId: "item-1", timestamp: T0 + DAY, health: 0 })
    input.schemaVersion = 2

    expect(adapter.load()).toEqual(makeSnapshot())
  })

  it("multiple saves: the last save wins", () => {
    const adapter = new InMemoryAdapter()

    adapter.save(makeSnapshot())
    adapter.save(makeOtherSnapshot())

    expect(adapter.load()).toEqual(makeOtherSnapshot())

    adapter.save(makeSnapshot())

    expect(adapter.load()).toEqual(makeSnapshot())
  })
})
