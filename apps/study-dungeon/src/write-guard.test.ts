// write-guard.ts (task 18.3): a storage problem during a write is reported and
// changes nothing; every other error is rethrown. A real DecayEngine on an
// InMemoryAdapter whose save can be made to fail; fixed times.

import { describe, expect, it, vi } from "vitest"
import { DecayEngine, DecayEngineError, InMemoryAdapter, type StoredSnapshot } from "@decay-engine/engine"
import { studyDungeonPolicy, type FactPayload, type FactPolicyData, type ReviewEvent } from "./policy"
import { reportWriteError, runWrite } from "./write-guard"
import { day } from "./test/fixtures"

/** An adapter whose next saves throw `failWith` while it is set. */
class FailingAdapter extends InMemoryAdapter {
  failWith: unknown = null
  override save(snapshot: StoredSnapshot): void {
    if (this.failWith !== null) throw this.failWith
    super.save(snapshot)
  }
}

const quotaError = () => new DOMException("The quota has been exceeded.", "QuotaExceededError")

function setup() {
  const adapter = new FailingAdapter()
  let n = 0
  const engine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(studyDungeonPolicy, adapter, () => `f${n++}`)
  const add = () =>
    engine.addItem(
      { payload: { question: "Capital of Peru?", answer: "Lima", why: "", knowledge: "solid" }, importance: 2, costMinutes: 2 },
      day(0)
    )
  return { adapter, engine, add }
}

describe("runWrite", () => {
  it("returns true and reports nothing when the write succeeds", () => {
    const { engine, add } = setup()
    const onProblem = vi.fn()
    expect(runWrite(() => void add(), onProblem)).toBe(true)
    expect(onProblem).not.toHaveBeenCalled()
    expect(engine.view(day(0))).toHaveLength(1)
  })

  it("a quota error during addItem is reported as full, returns false, and saves and keeps nothing", () => {
    const { adapter, engine, add } = setup()
    const before = adapter.load()
    adapter.failWith = quotaError()
    const onProblem = vi.fn()

    expect(runWrite(() => void add(), onProblem)).toBe(false)

    expect(onProblem.mock.calls).toEqual([["full"]])
    expect(engine.view(day(0))).toEqual([])
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
