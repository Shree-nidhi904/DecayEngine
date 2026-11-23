// The live-change message (task L3, Requirement 23.3, design "Live State
// Changes"): the exact sentences for one, two and many facts, for each kind
// of change, and the order that picks the creature named. Facts come from a
// real engine (fixed T0); the changes are written out, as a tick's
// diffStates gives them, and the names are passed in as the App does.

import { describe, expect, it } from "vitest"
import { liveKind, liveNotice } from "./live-changes"
import type { Fact } from "./policy"
import type { StateChange } from "./state-changes"
import { T0, makeEngine } from "./test/fixtures"

/** Facts f1, f2, … at T0 with the given creature names and importance. */
function factsOf(...list: [name: string, importance: number][]): { facts: Fact[]; nameOf: (id: string) => string } {
  const { engine, add } = makeEngine()
  const names = new Map<string, string>()
  list.forEach(([name, importance], i) => {
    add(`f${i + 1}`, "solid", T0, { importance })
    names.set(`f${i + 1}`, name)
  })
  return { facts: engine.view(T0), nameOf: (id) => names.get(id) ?? id }
}

const wake = (id: string): StateChange => ({ id, from: "alive", to: "weak" })
const die = (id: string): StateChange => ({ id, from: "weak", to: "dead" })
const asleep = (id: string): StateChange => ({ id, from: "alive", to: "dead" })

describe("liveKind", () => {
  it("names the three changes time can cause, and nothing else", () => {
    expect(liveKind(wake("f1"))).toBe("wake")
    expect(liveKind(die("f1"))).toBe("die")
    expect(liveKind(asleep("f1"))).toBe("dieAsleep")
    expect(liveKind({ id: "f1", from: "weak", to: "alive" })).toBeNull()
    expect(liveKind({ id: "f1", from: "dead", to: "alive" })).toBeNull()
    expect(liveKind({ id: "f1", from: "dead", to: "weak" })).toBeNull()
  })
})

describe("one fact", () => {
  const { facts, nameOf } = factsOf(["Gaze", 2])

  it("Crypt → Dungeon: the creature wakes", () => {
    expect(liveNotice([wake("f1")], facts, nameOf)!.text).toBe("Gaze just weakened.")
  })
  it("Dungeon → Graveyard", () => {
    expect(liveNotice([die("f1")], facts, nameOf)!.text).toBe("Gaze just died and went to the Graveyard.")
  })
  it("Crypt → Graveyard in one tick", () => {
    expect(liveNotice([asleep("f1")], facts, nameOf)!.text).toBe("Gaze just died in its sleep and went to the Graveyard.")
  })
  it("the badge kind: weak for a weakening, dead for a death", () => {
    expect(liveNotice([wake("f1")], facts, nameOf)!.worst).toBe("weak")
    expect(liveNotice([die("f1")], facts, nameOf)!.worst).toBe("dead")
    expect(liveNotice([asleep("f1")], facts, nameOf)!.worst).toBe("dead")
  })
})

describe("two facts, the more important first", () => {
  // Wisp has importance 3, Gaze 2.
  const { facts, nameOf } = factsOf(["Gaze", 2], ["Wisp", 3])

  it("both weakened", () => {
    expect(liveNotice([wake("f1"), wake("f2")], facts, nameOf)!.text).toBe("Wisp and Gaze just weakened.")
  })
  it("both died, one of them in its sleep", () => {
    expect(liveNotice([die("f1"), asleep("f2")], facts, nameOf)!.text).toBe(
      "Wisp and Gaze just died and went to the Graveyard."
    )
  })
  it("one of each", () => {
    expect(liveNotice([die("f1"), wake("f2")], facts, nameOf)!.text).toBe("Wisp just weakened and Gaze went to the Graveyard.")
    expect(liveNotice([wake("f1"), asleep("f2")], facts, nameOf)!.text).toBe(
      "Wisp just went to the Graveyard in its sleep and Gaze weakened."
    )
  })
})

describe("three or more facts, naming the most important", () => {
  const { facts, nameOf } = factsOf(["Gaze", 2], ["Wisp", 1], ["Grub", 3], ["Moth", 2])

  it("all weakened", () => {
    expect(liveNotice([wake("f1"), wake("f2"), wake("f3")], facts, nameOf)!.text).toBe("3 facts weakened, Grub's among them.")
  })
  it("all died (from the Dungeon and in their sleep)", () => {
    expect(liveNotice([die("f1"), asleep("f2"), die("f4")], facts, nameOf)!.text).toBe(
      "3 facts went to the Graveyard, Gaze's among them."
    )
  })
  it("some of each", () => {
    expect(liveNotice([wake("f1"), die("f2"), wake("f3"), asleep("f4")], facts, nameOf)!.text).toBe(
      "2 facts weakened and 2 went to the Graveyard, Grub's among them."
    )
    expect(liveNotice([die("f1"), wake("f2"), die("f4")], facts, nameOf)!.text).toBe(
      "1 fact weakened and 2 went to the Graveyard, Gaze's among them."
    )
  })
})

describe("the order that picks who is named", () => {
  it("importance first, then a death before a weakening, then name, then id", () => {
    const { facts, nameOf } = factsOf(["Moth", 2], ["Gaze", 2], ["Gaze", 2], ["Wisp", 1])
    // Importance 2 for f1 to f3: Moth died, so it comes before the two Gazes that weakened.
    const notice = liveNotice([wake("f2"), die("f1"), wake("f3"), asleep("f4")], facts, nameOf)!
    expect(notice.changes.map((c) => c.id)).toEqual(["f1", "f2", "f3", "f4"])
    expect(notice.text).toBe("2 facts weakened and 2 went to the Graveyard, Moth's among them.")
  })

  it("keeps only the changes time can cause, and facts it knows", () => {
    const { facts, nameOf } = factsOf(["Gaze", 2], ["Wisp", 3])
    expect(liveNotice([{ id: "f2", from: "weak", to: "alive" }, wake("f1"), wake("f9")], facts, nameOf)!.text).toBe(
      "Gaze just weakened."
    )
    expect(liveNotice([{ id: "f2", from: "dead", to: "alive" }], facts, nameOf)).toBeNull()
    expect(liveNotice([], facts, nameOf)).toBeNull()
  })
})
