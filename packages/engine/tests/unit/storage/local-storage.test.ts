import { describe, it, expect, vi, afterEach } from "vitest"
import { LocalStorageAdapter } from "../../../src/storage/local-storage"
import { DecayEngineError } from "../../../src/errors"
import type { StoredSnapshot } from "../../../src/storage/interface"

// Fixed timestamps. Tests never read the real clock.
const T0 = 1_000_000
const HOUR = 3_600_000
const DAY = 24 * HOUR

// The vitest environment is node, so there is no real localStorage. This fake
// keeps data in a Map and records every getItem/setItem call. It can be told to
// throw a given error on the next getItem or setItem call; a failed setItem
// does not change stored data, like the real API on quota errors.
type StorageCall =
  | { method: "getItem"; key: string }
  | { method: "setItem"; key: string; value: string }

class FakeLocalStorage {
  readonly data = new Map<string, string>()
  readonly calls: StorageCall[] = []
  private nextGetItemError: unknown = undefined
  private nextSetItemError: unknown = undefined

  failNextGetItem(error: unknown): void {
    this.nextGetItemError = error
  }

  failNextSetItem(error: unknown): void {
    this.nextSetItemError = error
  }

  getItem(key: string): string | null {
    this.calls.push({ method: "getItem", key })
    if (this.nextGetItemError !== undefined) {
      const error = this.nextGetItemError
      this.nextGetItemError = undefined
      throw error
    }
    return this.data.has(key) ? (this.data.get(key) as string) : null
  }

  setItem(key: string, value: string): void {
    this.calls.push({ method: "setItem", key, value })
    if (this.nextSetItemError !== undefined) {
      const error = this.nextSetItemError
      this.nextSetItemError = undefined
      throw error
    }
    this.data.set(key, value)
  }
}

function installFake(): FakeLocalStorage {
  const fake = new FakeLocalStorage()
  vi.stubGlobal("localStorage", fake)
  return fake
}

// An error carrying a unique symbol. If the adapter wrapped or copied the
// error, the symbol-valued marker would not match, so matching it shows the
// same error object came through.
function makeMarkedError(name: string, message: string): Error & { marker: symbol } {
  const error = new Error(message) as Error & { marker: symbol }
  error.name = name
  error.marker = Symbol(name)
  return error
}

// Fictional sample data. Built fresh on every call so each test compares
// against values the adapter has never seen.
function makeSnapshot(): StoredSnapshot {
  return {
    schemaVersion: 1,
    items: [
      {
        id: "item-1",
        payload: {
          name: "Capital of Peru",
          tags: ["geography", "south-america"],
          meta: { source: "Atlas deck" },
        },
        policyData: {
          halfLifeDays: 10,
          reviews: [{ at: T0 + HOUR, correct: true }],
        },
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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("LocalStorageAdapter", () => {
  describe("load and save", () => {
    it("load returns null when the key does not exist", () => {
      const fake = installFake()
      const adapter = new LocalStorageAdapter("study-dungeon")

      expect(adapter.load()).toBeNull()
      expect(fake.calls).toEqual([{ method: "getItem", key: "decay-engine:study-dungeon" }])
    })

    it("save then load returns the same data", () => {
      installFake()
      const adapter = new LocalStorageAdapter("study-dungeon")

      adapter.save(makeSnapshot())

      expect(adapter.load()).toEqual(makeSnapshot())
    })

    it("multiple saves: the last save wins", () => {
      installFake()
      const adapter = new LocalStorageAdapter("study-dungeon")

      adapter.save(makeSnapshot())
      adapter.save(makeOtherSnapshot())

      expect(adapter.load()).toEqual(makeOtherSnapshot())
    })
  })

  describe("namespace", () => {
    it("uses the key decay-engine:<namespace> for setItem and getItem", () => {
      const fake = installFake()
      const adapter = new LocalStorageAdapter("ghosted")

      adapter.save(makeSnapshot())
      adapter.load()

      expect(fake.calls.map((call) => [call.method, call.key])).toEqual([
        ["setItem", "decay-engine:ghosted"],
        ["getItem", "decay-engine:ghosted"],
      ])
      expect([...fake.data.keys()]).toEqual(["decay-engine:ghosted"])
    })

    it("adapters with different namespaces do not see each other's data", () => {
      installFake()
      const dungeon = new LocalStorageAdapter("study-dungeon")
      const ghosted = new LocalStorageAdapter("ghosted")
      const reaper = new LocalStorageAdapter("expiry-reaper")

      dungeon.save(makeSnapshot())
      ghosted.save(makeOtherSnapshot())

      expect(dungeon.load()).toEqual(makeSnapshot())
      expect(ghosted.load()).toEqual(makeOtherSnapshot())
      expect(reaper.load()).toBeNull()
    })

    it("adapters with the same namespace share data", () => {
      installFake()
      const writer = new LocalStorageAdapter("study-dungeon")
      const reader = new LocalStorageAdapter("study-dungeon")

      writer.save(makeSnapshot())

      expect(reader.load()).toEqual(makeSnapshot())
    })
  })

  describe("JSON serialization", () => {
    it("save writes exactly JSON.stringify(snapshot)", () => {
      const fake = installFake()
      const adapter = new LocalStorageAdapter("study-dungeon")

      adapter.save(makeSnapshot())

      expect(fake.data.get("decay-engine:study-dungeon")).toBe(JSON.stringify(makeSnapshot()))
    })

    it("load returns an equal object that is a different reference from the saved one", () => {
      installFake()
      const adapter = new LocalStorageAdapter("study-dungeon")
      const saved = makeSnapshot()

      adapter.save(saved)
      const loaded = adapter.load() as StoredSnapshot

      expect(loaded).toEqual(saved)
      expect(loaded).not.toBe(saved)
      expect(loaded.items[0]).not.toBe(saved.items[0])
      expect(loaded.items[0].payload).not.toBe(saved.items[0].payload)
      expect(loaded.history).not.toBe(saved.history)
    })

    it("load parses JSON text that was already in storage", () => {
      const fake = installFake()
      fake.data.set("decay-engine:expiry-reaper", JSON.stringify(makeOtherSnapshot()))
      const adapter = new LocalStorageAdapter("expiry-reaper")

      expect(adapter.load()).toEqual(makeOtherSnapshot())
    })
  })

  describe("storage lookup", () => {
    it("looks up localStorage on each call, not once in the constructor", () => {
      const adapter = new LocalStorageAdapter("study-dungeon")
      const first = installFake()

      adapter.save(makeSnapshot())

      const second = installFake()

      expect(adapter.load()).toBeNull()
      expect(first.data.get("decay-engine:study-dungeon")).toBe(JSON.stringify(makeSnapshot()))
      expect(second.calls).toEqual([{ method: "getItem", key: "decay-engine:study-dungeon" }])
    })
  })

  describe("storage failures", () => {
    it("propagates the same error object when getItem throws", () => {
      const fake = installFake()
      const adapter = new LocalStorageAdapter("study-dungeon")
      const failure = makeMarkedError("SecurityError", "access to storage is denied")

      fake.failNextGetItem(failure)

      expect(() => adapter.load()).toThrow(
        expect.objectContaining({
          name: "SecurityError",
          message: "access to storage is denied",
          marker: failure.marker,
        })
      )
    })

    it("propagates the same error object when setItem throws", () => {
      const fake = installFake()
      const adapter = new LocalStorageAdapter("study-dungeon")
      const failure = makeMarkedError("QuotaExceededError", "storage quota exceeded")

      fake.failNextSetItem(failure)

      expect(() => adapter.save(makeSnapshot())).toThrow(
        expect.objectContaining({
          name: "QuotaExceededError",
          message: "storage quota exceeded",
          marker: failure.marker,
        })
      )
    })

    it("a failed save leaves previously saved data readable and unchanged", () => {
      const fake = installFake()
      const adapter = new LocalStorageAdapter("study-dungeon")

      adapter.save(makeSnapshot())
      fake.failNextSetItem(makeMarkedError("QuotaExceededError", "storage quota exceeded"))

      expect(() => adapter.save(makeOtherSnapshot())).toThrow("storage quota exceeded")
      expect(fake.data.get("decay-engine:study-dungeon")).toBe(JSON.stringify(makeSnapshot()))
      expect(adapter.load()).toEqual(makeSnapshot())
    })

    it("propagates the SyntaxError from JSON.parse when stored text is not valid JSON", () => {
      const fake = installFake()
      fake.data.set("decay-engine:study-dungeon", "{not valid json")
      const adapter = new LocalStorageAdapter("study-dungeon")

      expect(() => adapter.load()).toThrow(SyntaxError)
      expect(() => adapter.load()).not.toThrow(DecayEngineError)
    })
  })

  describe("missing localStorage", () => {
    const cases = [
      { operation: "load", missing: undefined },
      { operation: "load", missing: null },
      { operation: "save", missing: undefined },
      { operation: "save", missing: null },
    ] as const

    it.each(cases)(
      "$operation throws STORAGE_UNAVAILABLE when localStorage is $missing",
      ({ operation, missing }) => {
        vi.stubGlobal("localStorage", missing)
        const adapter = new LocalStorageAdapter("study-dungeon")
        const run =
          operation === "load" ? () => adapter.load() : () => adapter.save(makeSnapshot())

        expect(run).toThrow(DecayEngineError)
        expect(run).toThrow(
          expect.objectContaining({
            code: "STORAGE_UNAVAILABLE",
            message: expect.stringContaining(`LocalStorageAdapter.${operation}`),
          })
        )
      }
    )
  })
})
