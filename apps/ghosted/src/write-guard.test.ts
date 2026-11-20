// write-guard.ts (Req 23.3, 12.5): a storage problem during a write is reported
// and changes nothing; every other error is rethrown; while previewing,
// runGatedWrite never calls the write. A real DecayEngine on an InMemoryAdapter
// whose save can be made to fail. Adapted from Study Dungeon's
// write-guard.test.ts. Fixed times.

import { describe, expect, it, vi } from "vitest"
import { DecayEngine, DecayEngineError, InMemoryAdapter, type StoredSnapshot } from "@decay-engine/engine"
import { ghostedPolicy, type ContactEvent, type PersonPayload, type PersonPolicyData } from "./policy"
import { reportWriteError, runGatedWrite, runWrite } from "./write-guard"

const T0 = 1_700_000_000_000

/** An adapter whose saves throw `failWith` while it is set, and that counts saves. */
class FailingAdapter extends InMemoryAdapter {
  failWith: unknown = null
  saves = 0
  override save(snapshot: StoredSnapshot): void {
    if (this.failWith !== null) throw this.failWith
    this.saves++
    super.save(snapshot)
  }
}

const quotaError = () => new DOMException("The quota has been exceeded.", "QuotaExceededError")

function setup() {
  const adapter = new FailingAdapter()
  let n = 0
  const engine = new DecayEngine<PersonPayload, PersonPolicyData, ContactEvent>(ghostedPolicy, adapter, () => `p${n++}`)
  const add = () =>
    engine.addItem(
      { payload: { name: "Mira Castell", relationship: "College", rhythmDays: 30, lastContactAt: T0 }, importance: 2, costMinutes: 10 },
      T0
    )
  return { adapter, engine, add }
}

describe("runWrite", () => {
  it("returns true and reports nothing when the write succeeds", () => {
    const { engine, add } = setup()
    const onProblem = vi.fn()
    expect(runWrite(() => void add(), onProblem)).toBe(true)
    expect(onProblem).not.toHaveBeenCalled()
    expect(engine.view(T0)).toHaveLength(1)
  })

  it("a quota error during addItem is reported as full, returns false, and saves and keeps nothing", () => {
    const { adapter, engine, add } = setup()
    const before = adapter.load()
    adapter.failWith = quotaError()
    const onProblem = vi.fn()

    expect(runWrite(() => void add(), onProblem)).toBe(false)

    expect(onProblem.mock.calls).toEqual([["full"]])
    expect(engine.view(T0)).toEqual([])
    expect(adapter.load()).toEqual(before)
  })

  it("rethrows an error that is not a storage problem, without reporting it", () => {
    const { adapter, add } = setup()
    const bug = new Error("disk on fire")
    adapter.failWith = bug
    const onProblem = vi.fn()
    expect(() => runWrite(() => void add(), onProblem)).toThrow(bug)
    expect(onProblem).not.toHaveBeenCalled()
  })
})

describe("reportWriteError", () => {
  it("reports full for a quota error and unavailable for the engine's STORAGE_UNAVAILABLE", () => {
    const onProblem = vi.fn()
    expect(reportWriteError(quotaError(), onProblem)).toBe(true)
    expect(
      reportWriteError(new DecayEngineError("STORAGE_UNAVAILABLE", "localStorage is not available"), onProblem)
    ).toBe(true)
    expect(onProblem.mock.calls).toEqual([["full"], ["unavailable"]])
  })

  it("returns false and reports nothing for any other error", () => {
    const onProblem = vi.fn()
    expect(reportWriteError(new TypeError("x is undefined"), onProblem)).toBe(false)
    expect(reportWriteError("not even an error", onProblem)).toBe(false)
    expect(onProblem).not.toHaveBeenCalled()
  })
})

describe("runGatedWrite", () => {
  it("returns 'blocked' while previewing, without calling the write, and nothing is saved", () => {
    const { adapter, engine, add } = setup()
    const write = vi.fn(() => void add())
    const onProblem = vi.fn()

    expect(runGatedWrite(true, write, onProblem)).toBe("blocked")

    expect(write).not.toHaveBeenCalled()
    expect(onProblem).not.toHaveBeenCalled()
    expect(adapter.saves).toBe(0)
    expect(engine.view(T0)).toEqual([])
  })

  it("blocks even a write that would throw, so a preview can never raise or report anything", () => {
    const write = vi.fn(() => {
      throw new Error("must not run")
    })
    const onProblem = vi.fn()
    expect(runGatedWrite(true, write, onProblem)).toBe("blocked")
    expect(write).not.toHaveBeenCalled()
    expect(onProblem).not.toHaveBeenCalled()
  })

  it("returns 'saved' when not previewing and the write succeeds", () => {
    const { adapter, engine, add } = setup()
    const onProblem = vi.fn()
    expect(runGatedWrite(false, () => void add(), onProblem)).toBe("saved")
    expect(adapter.saves).toBe(1)
    expect(engine.view(T0)).toHaveLength(1)
    expect(onProblem).not.toHaveBeenCalled()
  })

  it("returns 'storage-problem' and reports it once when the save fails with a full quota", () => {
    const { adapter, engine, add } = setup()
    adapter.failWith = quotaError()
    const onProblem = vi.fn()
    expect(runGatedWrite(false, () => void add(), onProblem)).toBe("storage-problem")
    expect(onProblem.mock.calls).toEqual([["full"]])
    expect(engine.view(T0)).toEqual([])
  })

  it("returns 'storage-problem' for STORAGE_UNAVAILABLE", () => {
    const onProblem = vi.fn()
    const write = () => {
      throw new DecayEngineError("STORAGE_UNAVAILABLE", "localStorage is not available")
    }
    expect(runGatedWrite(false, write, onProblem)).toBe("storage-problem")
    expect(onProblem.mock.calls).toEqual([["unavailable"]])
  })

  it("rethrows any other error, without reporting it", () => {
    const { adapter, add } = setup()
    const bug = new Error("disk on fire")
    adapter.failWith = bug
    const onProblem = vi.fn()
    expect(() => runGatedWrite(false, () => void add(), onProblem)).toThrow(bug)
    const dead = new DecayEngineError("ITEM_ALREADY_DEAD", "went dark")
    expect(() =>
      runGatedWrite(false, () => {
        throw dead
      }, onProblem)
    ).toThrow(dead)
    expect(onProblem).not.toHaveBeenCalled()
  })
})
