// The diffStates property (task L3, Requirement 23.12, design "Live State
// Changes", Property): diffStates reports exactly the items present in both
// views whose state differs, once each, in the order of `after`. Generated
// views over a small id pool, so items overlap, appear and disappear; every
// state is drawn from all three.

import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { diffStates, type LifeState, type StateOf } from "./state-changes"

const state = fc.constantFrom<LifeState>("alive", "weak", "dead")
/** A view: distinct ids from f0 to f7, each with a state, in a shuffled order. */
const view = fc.uniqueArray(fc.record({ id: fc.integer({ min: 0, max: 7 }).map((n) => `f${n}`), state }), {
  selector: (item) => item.id,
  maxLength: 8,
})

describe("Property (Requirement 23.12): diffStates reports exactly the changed items", () => {
  it("every reported change is real, every real change is reported, in the order of `after`", () => {
    fc.assert(
      fc.property(view, view, (before: StateOf[], after: StateOf[]) => {
        const was = new Map(before.map((i) => [i.id, i.state] as const))
        const expected = after
          .filter((i) => was.has(i.id) && was.get(i.id) !== i.state)
          .map((i) => ({ id: i.id, from: was.get(i.id)!, to: i.state }))
        expect(diffStates(before, after)).toEqual(expected)
        // Comparing a view with itself never reports anything.
        expect(diffStates(after, after)).toEqual([])
      }),
      { numRuns: 200 }
    )
  })

  it("the generator reaches every state and every kind of change (fixed seed)", () => {
    const samples = fc.sample(fc.tuple(view, view), { numRuns: 300, seed: 23 })
    const states = new Set(samples.flatMap(([b, a]) => [...b, ...a].map((i) => i.state)))
    expect(states).toEqual(new Set(["alive", "weak", "dead"]))
    const kinds = new Set(samples.flatMap(([b, a]) => diffStates(b, a).map((c) => `${c.from}>${c.to}`)))
    for (const kind of ["alive>weak", "weak>dead", "alive>dead", "weak>alive", "dead>alive", "dead>weak"]) {
      expect(kinds.has(kind), kind).toBe(true)
    }
  })
})
