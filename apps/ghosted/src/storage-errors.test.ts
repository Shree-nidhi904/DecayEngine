// storage-errors.ts (Req 23.3): the real engine and LocalStorageAdapter over a
// fake localStorage, so the errors are the ones the engine really throws.
// Adapted from Study Dungeon's storage-errors.test.ts. Fixed times.

import { afterEach, describe, expect, it, vi } from "vitest"
import { DecayEngine, DecayEngineError, InMemoryAdapter, LocalStorageAdapter } from "@decay-engine/engine"
import { ghostedPolicy, type ContactEvent, type PersonPayload, type PersonPolicyData } from "./policy"
import {
  CORRUPT_SNAPSHOT_CODES,
  classifyLoadError,
  classifyWriteError,
  createEngineSafely,
  storageProblemText,
} from "./storage-errors"

const KEY = "decay-engine:ghosted"
const T0 = 1_700_000_000_000

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

afterEach(() => {
  vi.unstubAllGlobals()
})

const install = (storage: FakeStorage | undefined) => vi.stubGlobal("localStorage", storage)

const build = () => {
  let n = 0
  return new DecayEngine<PersonPayload, PersonPolicyData, ContactEvent>(
    ghostedPolicy,
    new LocalStorageAdapter("ghosted"),
    () => `p${++n}`
  )
}

const addOne = (engine: ReturnType<typeof build>) =>
  engine.addItem(
    { payload: { name: "Mira Castell", relationship: "", rhythmDays: 30, lastContactAt: T0 }, importance: 1, costMinutes: 5 },
    T0
  )

/** A DOMException-like quota error, as browsers throw it. */
function quotaError(name = "QuotaExceededError", code = 22) {
  const e = new Error("The quota has been exceeded.")
  Object.assign(e, { name, code })
  return e
}

function caught(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error("test bug: expected the call to throw")
}

describe("classifyWriteError", () => {
  it("calls a quota error during a real save 'full', and the save changes nothing", () => {
    const storage = new FakeStorage()
    install(storage)
    const engine = build()
    addOne(engine)
    const before = storage.getItem(KEY)
    storage.failWith = quotaError()

    expect(classifyWriteError(caught(() => addOne(engine)))).toBe("full")
    // The engine's guarantee: a failed save leaves storage and memory unchanged.
    expect(storage.getItem(KEY)).toBe(before)
    expect(engine.view(T0)).toHaveLength(1)
  })

  it("recognises each browser's quota error", () => {
    expect(classifyWriteError(quotaError("QuotaExceededError", 22))).toBe("full")
    expect(classifyWriteError(quotaError("NS_ERROR_DOM_QUOTA_REACHED", 1014))).toBe("full")
    expect(classifyWriteError(quotaError("Error", 22))).toBe("full")
    expect(classifyWriteError(new DOMException("full", "QuotaExceededError"))).toBe("full")
  })

  it("calls missing localStorage 'unavailable'", () => {
    install(new FakeStorage())
    const engine = build()
    install(undefined)
    const error = caught(() => addOne(engine))
    expect(error).toBeInstanceOf(DecayEngineError)
    expect(classifyWriteError(error)).toBe("unavailable")
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
    expect(createEngineSafely(build).ok).toBe(true)
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
      expect(result.ok, text).toBe(false)
      if (!result.ok) {
        expect(result.problem).toBe("corrupt")
        expect((result.error as DecayEngineError).code).toBe(code)
      }
    }
  })

  it("reports a snapshot with a broken person as 'corrupt'", () => {
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

  it("lists exactly the three codes the snapshot parser throws", () => {
    expect([...CORRUPT_SNAPSHOT_CODES].sort()).toEqual([
      "INVALID_ITEM_DATA",
      "INVALID_SNAPSHOT",
      "UNSUPPORTED_SCHEMA_VERSION",
    ])
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
    expect(classifyLoadError(new DecayEngineError("DUPLICATE_ID", "x"))).toBeNull()
    expect(classifyLoadError(new TypeError("x"))).toBeNull()
  })

  it("passes an engine on InMemoryAdapter straight through", () => {
    const result = createEngineSafely(() => new DecayEngine(ghostedPolicy, new InMemoryAdapter(), () => "x"))
    expect(result.ok).toBe(true)
  })
})

describe("storageProblemText", () => {
  it("has one Ghosted sentence per problem", () => {
    expect(Object.keys(storageProblemText).sort()).toEqual(["corrupt", "full", "stale", "unavailable"])
    expect(storageProblemText.full.startsWith("Storage full.")).toBe(true)
    expect(storageProblemText.corrupt).toContain("Reset all data")
    for (const sentence of Object.values(storageProblemText)) {
      expect(sentence).toContain("Ghosted")
      expect(sentence).not.toMatch(/Study Dungeon|facts?\b/i)
    }
    expect(storageProblemText.full).toContain("people")
    expect(storageProblemText.corrupt).toContain("people")
  })
})
