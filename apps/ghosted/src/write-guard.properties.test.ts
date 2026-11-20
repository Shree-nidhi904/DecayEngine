// Property 12 at the gate (task 3.5, design section 7.3, Req 12.5): while
// previewing, runGatedWrite never calls a write, whatever the writes are and
// however many come in a row. The app-level half (every write control on the
// sample street) is task 5.5. Real DecayEngine with the Ghosted policy on an
// adapter that counts saves. Fixed times, never the real clock.

import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { InMemoryAdapter, type StoredSnapshot } from "@decay-engine/engine"
import { runGatedWrite } from "./write-guard"
import { T0, makeEngine } from "./test/fixtures"

/** Counts save calls and keeps the last saved snapshot as JSON. */
class CountingAdapter extends InMemoryAdapter {
  saves = 0
  lastSaved: string | null = null
  override save(snapshot: StoredSnapshot): void {
    this.saves++
    this.lastSaved = JSON.stringify(snapshot)
    super.save(snapshot)
  }
}

const quotaError = () => new DOMException("The quota has been exceeded.", "QuotaExceededError")

describe("runGatedWrite while previewing", () => {
  // Feature: ghosted, Property 12: Preview never writes (gate)
  it("Property 12 (gate): any sequence of writes with previewing true is blocked and never runs", () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }), (writes) => {
        const adapter = new CountingAdapter()
        const engine = makeEngine(adapter)
        // One real person, saved before the preview starts.
        engine.addItem(
          { payload: { name: "Ola Brandt", relationship: "Work", rhythmDays: 14, lastContactAt: T0 }, importance: 2, costMinutes: 10 },
          T0
        )
        const savesBefore = adapter.saves
        const snapshotBefore = adapter.lastSaved
        const viewBefore = engine.view(T0)

        let calls = 0
        let problems = 0
        for (const [i, real] of writes.entries()) {
          // true: a real engine write; false: a write that would fail with a full quota.
          const write = real
            ? () => {
                calls++
                engine.addItem(
                  { payload: { name: "Teo Varga", relationship: "", rhythmDays: 7, lastContactAt: T0 }, importance: 1, costMinutes: 5 },
                  T0 + i
                )
              }
            : () => {
                calls++
                throw quotaError()
              }
          expect(runGatedWrite(true, write, () => problems++)).toBe("blocked")
        }

        expect(calls).toBe(0)
        expect(problems).toBe(0)
        expect(adapter.saves).toBe(savesBefore)
        expect(adapter.lastSaved).toBe(snapshotBefore)
        expect(engine.view(T0)).toEqual(viewBefore)
      }),
      { numRuns: 1000 }
    )
  })
})
