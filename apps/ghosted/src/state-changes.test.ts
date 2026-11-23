// diffStates and snapshotStates (task L3, Req 38.1, design section 15.2).
// Pure functions: plain objects, no engine, no clock.

import { describe, expect, it } from "vitest"
import { diffStates, snapshotStates, type LifeState, type StateOf } from "./state-changes"

const STATES: readonly LifeState[] = ["alive", "weak", "dead"]

describe("diffStates", () => {
  it.each(STATES.flatMap((from) => STATES.filter((to) => to !== from).map((to) => [from, to] as const)))(
    "reports %s → %s",
    (from, to) => {
      expect(diffStates([{ id: "p1", state: from }], [{ id: "p1", state: to }])).toEqual([{ id: "p1", from, to }])
    }
  )

  it.each(STATES)("reports nothing when %s stays %s", (state) => {
    expect(diffStates([{ id: "p1", state }], [{ id: "p1", state }])).toEqual([])
  })

  it("reports nothing for empty views", () => {
    expect(diffStates([], [])).toEqual([])
  })

  it("reports several changes at once and leaves out the unchanged ones", () => {
    const before: StateOf[] = [
      { id: "a", state: "alive" },
      { id: "b", state: "weak" },
      { id: "c", state: "alive" },
      { id: "d", state: "dead" },
    ]
    const after: StateOf[] = [
      { id: "a", state: "weak" },
      { id: "b", state: "dead" },
      { id: "c", state: "alive" },
      { id: "d", state: "dead" },
    ]
    expect(diffStates(before, after)).toEqual([
      { id: "a", from: "alive", to: "weak" },
      { id: "b", from: "weak", to: "dead" },
    ])
  })

  it("lists the changes in the order of `after`, whatever the order of `before`", () => {
    const before: StateOf[] = [
      { id: "z", state: "alive" },
      { id: "m", state: "alive" },
      { id: "a", state: "weak" },
    ]
    const after: StateOf[] = [
      { id: "a", state: "dead" },
      { id: "z", state: "dead" },
      { id: "m", state: "weak" },
    ]
    expect(diffStates(before, after).map((c) => c.id)).toEqual(["a", "z", "m"])
    expect(diffStates([...before].reverse(), after).map((c) => c.id)).toEqual(["a", "z", "m"])
  })

  it("an item added or removed in between is not a change", () => {
    const before: StateOf[] = [
      { id: "gone", state: "alive" },
      { id: "kept", state: "alive" },
    ]
    const after: StateOf[] = [
      { id: "kept", state: "weak" },
      { id: "new", state: "dead" },
    ]
    expect(diffStates(before, after)).toEqual([{ id: "kept", from: "alive", to: "weak" }])
  })

  it("does not change its inputs, and returns new objects", () => {
    const before: StateOf[] = [{ id: "p1", state: "alive" }]
    const after: StateOf[] = [{ id: "p1", state: "weak" }]
    const copies = JSON.stringify([before, after])
    const changes = diffStates(before, after)
    expect(JSON.stringify([before, after])).toBe(copies)
    expect(changes[0]).not.toBe(after[0])
  })

  it("is the same for the same inputs (pure)", () => {
    const before: StateOf[] = [{ id: "p1", state: "alive" }, { id: "p2", state: "weak" }]
    const after: StateOf[] = [{ id: "p1", state: "dead" }, { id: "p2", state: "weak" }]
    expect(diffStates(before, after)).toEqual(diffStates(before, after))
  })
})

describe("snapshotStates", () => {
  it("copies only the id and the state, so a later change to the item does not reach the copy", () => {
    const item = { id: "p1", state: "alive" as LifeState, health: 90, payload: { name: "Mira Castell" } }
    const snapshot = snapshotStates([item])
    expect(snapshot).toEqual([{ id: "p1", state: "alive" }])
    item.state = "weak"
    expect(snapshot).toEqual([{ id: "p1", state: "alive" }])
  })
})
