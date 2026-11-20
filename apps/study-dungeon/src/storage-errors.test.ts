// Tests for the storage problem helpers (task 18.3).
// Uses the real engine and LocalStorageAdapter over a fake localStorage, so the
// errors are the ones the engine really throws.
//
// Written by - Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import { afterEach, describe, expect, it } from "vitest"
import { DecayEngine, DecayEngineError, InMemoryAdapter, LocalStorageAdapter } from "@decay-engine/engine"
import { studyDungeonPolicy, type FactPayload, type FactPolicyData, type ReviewEvent } from "./policy"
import {
  classifyLoadError,
  classifyWriteError,
  createEngineSafely,
  storageProblemText,
} from "./storage-errors"

const KEY = "decay-engine:study-dungeon"
const T = Date.UTC(2026, 10, 19)

/** A Storage-like map that can be told to fail like a full browser quota. */
class FakeStorage {
  data = new Map<string, string>()
  failWith: unknown = null
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null
  }
  setItem(k: string, v: string) {
    if (this.failWith !== null) throw this.failWith
    this.data.set(k, v)
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
}

// Save the descriptor rather than the value: reading Node's own localStorage
// getter prints a warning when no storage file is configured.
const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
afterEach(() => {
  if (original === undefined) delete (globalThis as { localStorage?: unknown }).localStorage
  else Object.defineProperty(globalThis, "localStorage", original)
})

function install(storage: FakeStorage | undefined) {
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true })
}

const build = () => {
  let n = 0
  return new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(
    studyDungeonPolicy,
    new LocalStorageAdapter("study-dungeon"),
    () => `f${++n}`
  )
}

const addOne = (engine: ReturnType<typeof build>) =>
  engine.addItem({ payload: { question: "q", answer: "a", why: "", knowledge: "new" }, importance: 1, costMinutes: 1 }, T)

/** A DOMException-like quota error, as browsers throw it. */
function quotaError(name = "QuotaExceededError", code = 22) {
  const e = new Error("The quota has been exceeded.")
  Object.assign(e, { name, code })
  return e
}

describe("classifyWriteError", () => {
  it("calls a quota error during a real save 'full', and the save changes nothing", () => {
    const storage = new FakeStorage()
    install(storage)
    const engine = build()
    addOne(engine)
    const before = storage.getItem(KEY)
    storage.failWith = quotaError()
    let caught: unknown = null
    try {
      addOne(engine)
    } catch (error) {
      caught = error
    }
    expect(classifyWriteError(caught)).toBe("full")
    // The engine's guarantee: a failed save leaves storage and memory unchanged.
    expect(storage.getItem(KEY)).toBe(before)
    expect(engine.view(T)).toHaveLength(1)
  })

  it("recognises each browser's quota error", () => {
    expect(classifyWriteError(quotaError("QuotaExceededError", 22))).toBe("full")
    expect(classifyWriteError(quotaError("NS_ERROR_DOM_QUOTA_REACHED", 1014))).toBe("full")
    // Some browsers only set the legacy code.
    expect(classifyWriteError(quotaError("Error", 22))).toBe("full")
  })

  it("calls missing localStorage 'unavailable'", () => {
    install(new FakeStorage())
    const engine = build()
    install(undefined)
    let caught: unknown = null
    try {
      addOne(engine)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(DecayEngineError)
    expect(classifyWriteError(caught)).toBe("unavailable")
  })

  it("returns null for errors that are not about storage, so the app rethrows them", () => {
    expect(classifyWriteError(new DecayEngineError("ITEM_ALREADY_DEAD", "x"))).toBeNull()
    expect(classifyWriteError(new TypeError("boom"))).toBeNull()
    expect(classifyWriteError("a string")).toBeNull()
    expect(classifyWriteError(null)).toBeNull()
  })
})

describe("classifyLoadError and createEngineSafely", () => {
  it("builds the engine normally when storage is fine", () => {
    install(new FakeStorage())
    const result = createEngineSafely(build)
    expect(result.ok).toBe(true)
  })

  it("reports text that is not JSON as 'corrupt' instead of crashing", () => {
    const storage = new FakeStorage()
    storage.data.set(KEY, "{not json")
    install(storage)
    const result = createEngineSafely(build)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problem).toBe("corrupt")
      expect(result.error).toBeInstanceOf(SyntaxError)
    }
  })

  it("reports a snapshot the engine rejects as 'corrupt'", () => {
    const cases: Array<[string, string]> = [
      ["[1, 2, 3]", "INVALID_SNAPSHOT"],
      [JSON.stringify({ schemaVersion: 999, items: [], history: [] }), "UNSUPPORTED_SCHEMA_VERSION"],
    ]
    for (const [text, code] of cases) {
      const storage = new FakeStorage()
      storage.data.set(KEY, text)
      install(storage)
      const result = createEngineSafely(build)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.problem).toBe("corrupt")
        expect((result.error as DecayEngineError).code).toBe(code)
      }
    }
  })

  it("reports a snapshot with a broken item as 'corrupt'", () => {
    // Save a real snapshot, then damage one item's health.
    const storage = new FakeStorage()
    install(storage)
    addOne(build())
    const snapshot = JSON.parse(storage.getItem(KEY)!)
    snapshot.items[0].health = "lots"
    storage.data.set(KEY, JSON.stringify(snapshot))
    const result = createEngineSafely(build)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problem).toBe("corrupt")
      expect((result.error as DecayEngineError).code).toBe("INVALID_ITEM_DATA")
    }
  })

  it("reports missing localStorage as 'unavailable'", () => {
    install(undefined)
    const result = createEngineSafely(build)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problem).toBe("unavailable")
  })

  it("reports a blocked localStorage (SecurityError) as 'unavailable'", () => {
    const blocked = new Error("blocked")
    blocked.name = "SecurityError"
    expect(classifyLoadError(blocked)).toBe("unavailable")
  })

  it("rethrows errors that are not storage problems, because they are bugs", () => {
    const bug = new DecayEngineError("MISSING_POLICY", "no policy")
    expect(() =>
      createEngineSafely(() => {
        throw bug
      })
    ).toThrow(bug)
    // An engine code from other operations is not 'corrupt' at load.
    expect(classifyLoadError(new DecayEngineError("DUPLICATE_ID", "x"))).toBeNull()
    expect(classifyLoadError(new TypeError("x"))).toBeNull()
  })

  it("does not touch an InMemoryAdapter engine (sanity check of the generic helper)", () => {
    const result = createEngineSafely(
      () => new DecayEngine(studyDungeonPolicy, new InMemoryAdapter(), () => "x")
    )
    expect(result.ok).toBe(true)
  })
})

describe("storageProblemText", () => {
  it("has a sentence for every problem, and the full one says 'Storage full' as the design asks", () => {
    expect(Object.keys(storageProblemText).sort()).toEqual(["corrupt", "full", "unavailable"])
    expect(storageProblemText.full.startsWith("Storage full.")).toBe(true)
    expect(storageProblemText.corrupt).toContain("Reset all data")
  })
})
