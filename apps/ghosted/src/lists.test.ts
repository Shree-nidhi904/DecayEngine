// lists.ts (tasks 4.1-4.3; Req 11.1-11.3, 13.1, 16.2, 8.1): shown state,
// last logged contact, the three orders and their ties by id, "starts fading
// in N days" and the hero's person. People are built through the real engine
// at fixed times.

import { describe, expect, it } from "vitest"
import type { HistoryEntry, IdGenerator } from "@decay-engine/engine"
import {
  compareIds,
  daysUntilFading,
  heroTarget,
  lastLoggedContactAt,
  shownFreshness,
  shownState,
  sortEmpty,
  sortFading,
  sortStillLit,
  stateCounts,
} from "./lists"
import { ghostedPolicy, type Person, type PersonPayload } from "./policy"
import type { GhostedEngine } from "./engine-instance"
import { DAY_MS, T0, day, makeEngine } from "./test/fixtures"

/** Ids handed out in the given order, so a tie-break by id can be told from insertion order. */
function idsInOrder(...ids: string[]): IdGenerator {
  let i = 0
  return () => ids[i++]!
}

function add(engine: GhostedEngine, name: string, lastContactAt: number, rhythmDays = 30, at = T0): string {
  const payload: PersonPayload = { name, relationship: "", rhythmDays, lastContactAt }
  return engine.addItem({ payload, importance: 2, costMinutes: 10 }, at)
}

const ids = (people: readonly Person[]) => people.map((p) => p.id)

describe("shownState (Req 16.2)", () => {
  it("is alive, litAgain after a reconnect, weak or dead", () => {
    const engine = makeEngine()
    const lit = add(engine, "Priya Raman", T0)
    const fading = add(engine, "Sam Rivera", day(-50))
    const dark = add(engine, "Leo Marchetti", day(-90))
    const back = add(engine, "Nia Bello", day(-90))
    engine.resurrect(back, { kind: "call" }, T0)
    const byId = new Map(engine.view(T0).map((p) => [p.id, p]))
    expect([lit, fading, dark, back].map((id) => shownState(byId.get(id)!))).toEqual(["alive", "weak", "dead", "litAgain"])

    // Reconnected, then fading again: the word is "flickering", not "lit again".
    expect(shownState(engine.view(day(40)).find((p) => p.id === back)!)).toBe("weak")
  })
})

describe("lastLoggedContactAt (Req 13.1)", () => {
  it("is the payload's date when nothing was logged", () => {
    const engine = makeEngine()
    const id = add(engine, "Priya Raman", day(-12))
    const person = engine.view(T0)[0]!
    expect(lastLoggedContactAt(engine.history(id), person.payload)).toBe(day(-12))
  })

  it("is the latest tended or resurrected entry, never policyData.lastContactAt", () => {
    const engine = makeEngine()
    const id = add(engine, "Sam Rivera", day(-90)) // dark at the add
    engine.resurrect(id, { kind: "meetup" }, day(1))
    engine.tend(id, { kind: "text" }, day(20)) // age 19: 78.9 → 100
    engine.tick(day(50)) // a settle after the text adds no contact
    const person = engine.view(day(50))[0]!
    expect(lastLoggedContactAt(engine.history(id), person.payload)).toBe(day(20))

    const textOnly = makeEngine()
    const other = add(textOnly, "Ola Brandt", day(-50))
    textOnly.tend(other, { kind: "text" }, T0) // 44.4 → 84.4: the policy's last contact is about 14 days back
    const p = textOnly.view(T0)[0]!
    expect(p.policyData.lastContactAt).toBeLessThan(day(-13))
    expect(lastLoggedContactAt(textOnly.history(other), p.payload)).toBe(T0)
  })

  it("ignores entries that are not contacts", () => {
    const history: HistoryEntry[] = [
      { type: "created", itemId: "p1", timestamp: day(5), health: 100 },
      { type: "edited", itemId: "p1", timestamp: day(9), health: 90, fieldsChanged: ["payload"] },
      { type: "state-changed", itemId: "p1", timestamp: day(9), health: 59, from: "alive", to: "weak" },
    ]
    const payload: PersonPayload = { name: "Teo Varga", relationship: "", rhythmDays: 30, lastContactAt: day(2) }
    expect(lastLoggedContactAt(history, payload)).toBe(day(2))
  })
})

describe("sortFading (Req 11.1)", () => {
  it("weak people only, lowest freshness first, ties by id whatever the order they were added", () => {
    const engine = makeEngine(undefined, idsInOrder("p-c", "p-b", "p-a", "p-lit", "p-dark"))
    add(engine, "Teo Varga", day(-50)) // p-c 44.4
    add(engine, "Ola Brandt", day(-70)) // p-b 22.2
    add(engine, "Ines Moreau", day(-50)) // p-a 44.4, ties with p-c
    add(engine, "Priya Raman", T0)
    add(engine, "Leo Marchetti", day(-90))
    expect(ids(sortFading(engine.view(T0)))).toEqual(["p-b", "p-a", "p-c"])
  })
})

describe("sortEmpty (Req 11.2)", () => {
  it("dead people only, most recently dark first, ties by id: the engine's graveyard order", () => {
    const engine = makeEngine(undefined, idsInOrder("d-z", "d-y", "d-x", "lit"))
    add(engine, "Teo Varga", T0) // d-z: dark just after day 81
    add(engine, "Ola Brandt", day(-90)) // d-y: dark at the add (T0)
    add(engine, "Ines Moreau", day(-95)) // d-x: dark at the add (T0), ties with d-y
    add(engine, "Priya Raman", day(80), 30, day(80)) // lit
    engine.tick(day(100))

    const order = ids(sortEmpty(engine.view(day(100))))
    expect(order).toEqual(["d-z", "d-x", "d-y"])
    expect(order).toEqual(engine.graveyard().map((p) => p.id))
  })

  it("includes a death seen only in a preview, which the stored graveyard does not have yet", () => {
    const engine = makeEngine()
    const id = add(engine, "Teo Varga", T0)
    expect(engine.graveyard()).toEqual([])
    expect(ids(sortEmpty(engine.view(day(90))))).toEqual([id])
  })
})

describe("sortStillLit and daysUntilFading (Req 11.3)", () => {
  it("lit people only, soonest to fade first (the policy's nextDueAt), ties by id", () => {
    const engine = makeEngine(undefined, idsInOrder("s-c", "s-b", "s-a", "s-weak"))
    add(engine, "Teo Varga", day(-20)) // s-c fades on day 16
    add(engine, "Ola Brandt", day(-30)) // s-b fades on day 6
    add(engine, "Ines Moreau", day(-20)) // s-a fades on day 16, ties with s-c
    add(engine, "Sam Rivera", day(-50))
    const people = engine.view(T0)
    const rows = sortStillLit(people, T0)
    expect(rows.map((r) => r.person.id)).toEqual(["s-b", "s-a", "s-c"])
    for (const r of rows) expect(r.fadesAt).toBe(ghostedPolicy.nextDueAt(r.person, T0))
    expect(rows.map((r) => daysUntilFading(r.fadesAt, T0))).toEqual([6, 16, 16])
  })

  it("rounds up to whole days and never goes below 0", () => {
    expect(daysUntilFading(day(36), T0)).toBe(36)
    expect(daysUntilFading(day(36) + 1, T0)).toBe(37)
    expect(daysUntilFading(T0 + DAY_MS / 2, T0)).toBe(1)
    expect(daysUntilFading(T0, T0)).toBe(0)
    expect(daysUntilFading(day(-3), T0)).toBe(0)
  })
})

describe("heroTarget (Req 8.1)", () => {
  it("is the weak person with the lowest freshness, ties by id, and undefined when nobody is fading", () => {
    const engine = makeEngine(undefined, idsInOrder("h-b", "h-a", "h-lit"))
    add(engine, "Ola Brandt", day(-60))
    add(engine, "Ines Moreau", day(-60))
    add(engine, "Priya Raman", T0)
    expect(heroTarget(engine.view(T0))?.id).toBe("h-a")

    const calm = makeEngine()
    add(calm, "Priya Raman", T0)
    add(calm, "Leo Marchetti", day(-90))
    expect(heroTarget(calm.view(T0))).toBeUndefined()
  })
})

describe("small helpers", () => {
  it("stateCounts counts each state", () => {
    const engine = makeEngine()
    add(engine, "Priya Raman", T0)
    add(engine, "Sam Rivera", day(-50))
    add(engine, "Teo Varga", day(-60))
    add(engine, "Leo Marchetti", day(-90))
    expect(stateCounts(engine.view(T0))).toEqual({ alive: 1, weak: 2, dead: 1 })
  })

  it("shownFreshness rounds down, so a weak 59.6 never reads as 60", () => {
    expect(shownFreshness(59.6)).toBe(59)
    expect(shownFreshness(60)).toBe(60)
    expect(shownFreshness(9.99)).toBe(9)
  })

  it("compareIds is plain code-unit order", () => {
    expect(["b", "B", "a", "a1"].sort(compareIds)).toEqual(["B", "a", "a1", "b"])
  })
})
