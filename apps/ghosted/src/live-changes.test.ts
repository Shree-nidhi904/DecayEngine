// The live-change message (task L3, Req 38.3, design sections 15.3 and 15.4):
// the exact sentences for one, two and many windows, for each kind of change,
// and the order that picks the person named. People come from a real engine
// (fixed T0); the changes are written out, as a tick's diffStates gives them.

import { describe, expect, it } from "vitest"
import { liveKind, liveNotice } from "./live-changes"
import type { Person, PersonPayload } from "./policy"
import type { StateChange } from "./state-changes"
import { T0, makeEngine } from "./test/fixtures"

/** People p1, p2, … at T0, all lit (the message only reads names and importance). */
function people(...list: [name: string, importance: number][]): Person[] {
  const engine = makeEngine()
  for (const [name, importance] of list) {
    const payload: PersonPayload = { name, relationship: "", rhythmDays: 30, lastContactAt: T0 }
    engine.addItem({ payload, importance, costMinutes: 10 }, T0)
  }
  return engine.view(T0)
}

const flicker = (id: string): StateChange => ({ id, from: "alive", to: "weak" })
const dark = (id: string): StateChange => ({ id, from: "weak", to: "dead" })
const litToDark = (id: string): StateChange => ({ id, from: "alive", to: "dead" })

describe("liveKind", () => {
  it("names the three changes time can cause, and nothing else", () => {
    expect(liveKind(flicker("p1"))).toBe("flicker")
    expect(liveKind(dark("p1"))).toBe("dark")
    expect(liveKind(litToDark("p1"))).toBe("darkFromLit")
    expect(liveKind({ id: "p1", from: "weak", to: "alive" })).toBeNull()
    expect(liveKind({ id: "p1", from: "dead", to: "alive" })).toBeNull()
    expect(liveKind({ id: "p1", from: "dead", to: "weak" })).toBeNull()
  })
})

describe("one window", () => {
  const one = people(["Mira Castell", 2])

  it("lit → flickering", () => {
    expect(liveNotice([flicker("p1")], one)!.text).toBe("Mira Castell's window started to flicker.")
  })
  it("flickering → dark", () => {
    expect(liveNotice([dark("p1")], one)!.text).toBe("Mira Castell's window went dark.")
  })
  it("lit → dark in one step", () => {
    expect(liveNotice([litToDark("p1")], one)!.text).toBe("Mira Castell's window went from lit to dark.")
  })
  it("the badge kind: weak for a flicker, dead for going dark", () => {
    expect(liveNotice([flicker("p1")], one)!.worst).toBe("weak")
    expect(liveNotice([dark("p1")], one)!.worst).toBe("dead")
    expect(liveNotice([litToDark("p1")], one)!.worst).toBe("dead")
  })
})

describe("two windows, the more important first", () => {
  // Dan has importance 3, Mira 2.
  const two = people(["Mira Castell", 2], ["Dan Okafor", 3])

  it("both started to flicker", () => {
    expect(liveNotice([flicker("p1"), flicker("p2")], two)!.text).toBe(
      "Dan Okafor's and Mira Castell's windows started to flicker."
    )
  })
  it("both went dark, one of them straight from lit", () => {
    expect(liveNotice([dark("p1"), litToDark("p2")], two)!.text).toBe("Dan Okafor's and Mira Castell's windows went dark.")
  })
  it("both went from lit to dark", () => {
    expect(liveNotice([litToDark("p1"), litToDark("p2")], two)!.text).toBe(
      "Dan Okafor's and Mira Castell's windows went dark."
    )
  })
  it("one of each", () => {
    expect(liveNotice([dark("p1"), flicker("p2")], two)!.text).toBe(
      "Dan Okafor's window started to flicker and Mira Castell's went dark."
    )
    expect(liveNotice([flicker("p1"), litToDark("p2")], two)!.text).toBe(
      "Dan Okafor's window went from lit to dark and Mira Castell's started to flicker."
    )
  })
})

describe("three or more windows, naming the most important", () => {
  const four = people(["Mira Castell", 2], ["Dan Okafor", 1], ["Ana Ruiz", 3], ["Leo Marchetti", 2])

  it("all started to flicker", () => {
    expect(liveNotice([flicker("p1"), flicker("p2"), flicker("p3")], four)!.text).toBe(
      "3 windows started to flicker, Ana Ruiz's among them."
    )
  })
  it("all went dark (from flickering and from lit)", () => {
    expect(liveNotice([dark("p1"), litToDark("p2"), dark("p4")], four)!.text).toBe(
      "3 windows went dark, Leo Marchetti's among them."
    )
  })
  it("some of each", () => {
    expect(liveNotice([flicker("p1"), dark("p2"), flicker("p3"), litToDark("p4")], four)!.text).toBe(
      "2 windows started to flicker and 2 went dark, Ana Ruiz's among them."
    )
    expect(liveNotice([dark("p1"), flicker("p2"), dark("p4")], four)!.text).toBe(
      "1 window started to flicker and 2 went dark, Leo Marchetti's among them."
    )
  })
})

describe("the order that picks who is named", () => {
  it("importance first, then going dark before flickering, then name, then id", () => {
    const list = people(["Mira Castell", 2], ["Dan Okafor", 2], ["Dan Okafor", 2], ["Ana Ruiz", 1])
    // Same importance 2: Mira went dark, so she comes before the two Dans who flicker.
    const notice = liveNotice([flicker("p2"), dark("p1"), flicker("p3"), litToDark("p4")], list)!
    expect(notice.changes.map((c) => c.id)).toEqual(["p1", "p2", "p3", "p4"])
    expect(notice.text).toBe("2 windows started to flicker and 2 went dark, Mira Castell's among them.")
  })

  it("keeps only the changes time can cause, and people it knows", () => {
    const list = people(["Mira Castell", 2], ["Dan Okafor", 3])
    expect(liveNotice([{ id: "p2", from: "weak", to: "alive" }, flicker("p1"), flicker("p9")], list)!.text).toBe(
      "Mira Castell's window started to flicker."
    )
    expect(liveNotice([{ id: "p2", from: "dead", to: "alive" }], list)).toBeNull()
    expect(liveNotice([], list)).toBeNull()
  })
})

describe("wording rules (steering ghosted.md section 1)", () => {
  it('no sentence says "die" or "dead" for a person, or blames anyone', () => {
    const four = people(["Mira Castell", 2], ["Dan Okafor", 1], ["Ana Ruiz", 3], ["Leo Marchetti", 2])
    const texts = [
      liveNotice([flicker("p1")], four)!.text,
      liveNotice([dark("p1")], four)!.text,
      liveNotice([litToDark("p1")], four)!.text,
      liveNotice([flicker("p1"), dark("p2")], four)!.text,
      liveNotice([dark("p1"), dark("p2")], four)!.text,
      liveNotice([flicker("p1"), dark("p2"), litToDark("p3")], four)!.text,
    ]
    for (const text of texts) {
      expect(text).not.toMatch(/\b(die|dies|died|dying|dead)\b/i)
      expect(text).not.toMatch(/\b(should|forgot|neglect|ignored|failed|fault)\b/i)
    }
  })
})
