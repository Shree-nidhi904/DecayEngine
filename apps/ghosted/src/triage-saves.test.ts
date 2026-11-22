// What this session saves: the pure count and its words (task P5, task 10.2;
// design sections 13.3 to 13.5, 13.7 and 13.8; Req 36.2-36.6).
//
// A real engine with ghostedPolicy on InMemoryAdapter, fixed times (T0 plus
// offsets), never the real clock. Every expected value is worked out by hand
// from the policy's straight line: T = 3 × rhythm days, freshness
// 100 × (1 − a / T) for a days since the last contact, dark once a > 0.9 T
// (2.7 × rhythm days). A call sets a to 0, so it keeps a window from going
// dark for 2.7 × rhythm days: past the 7 days only for a rhythm of 3 days or more.

import { describe, expect, it } from "vitest"
import type { TriageCandidate } from "@decay-engine/engine"
import type { GhostedEngine } from "./engine-instance"
import { LOSS_FORECAST_DAYS } from "./loss-forecast"
import { ghostedPolicy, type PersonPayload, type PersonPolicyData } from "./policy"
import { loadSampleData } from "./sample-data"
import { SAVE_EVENT, savedPicks, triageSaves } from "./triage-saves"
import { triageText } from "./wording"
import { DAY_MS, MINUTE_MS, T0, day, makeEngine } from "./test/fixtures"

type Candidate = TriageCandidate<PersonPayload, PersonPolicyData>

const END = T0 + LOSS_FORECAST_DAYS * DAY_MS

function addPerson(
  engine: GhostedEngine,
  name: string,
  rhythmDays: number,
  lastContactAt: number,
  costMinutes = 10,
  importance: 1 | 2 | 3 = 2
): string {
  const payload: PersonPayload = { name, relationship: "", rhythmDays, lastContactAt }
  return engine.addItem({ payload, importance, costMinutes }, T0)
}

/** The fixture people of design section 13.8, all added at T0. */
const PEOPLE = {
  // r 10 (T 30 d), a 22: 26.67, flickering. Dark at T0 + 5 d. A call: 76.67 at T0 + 7 d. At risk, kept.
  ada: (e: GhostedEngine, cost = 10) => addPerson(e, "Ada Fenn", 10, day(-22), cost),
  eli: (e: GhostedEngine) => addPerson(e, "Eli Park", 10, day(-22)),
  // r 2 (T 6 d), a 3: 50, flickering. Dark at T0 + 2.4 d. A call: dark after 5.4 d. At risk, not kept.
  bo: (e: GhostedEngine) => addPerson(e, "Bo Lark", 2, day(-3)),
  // r 3 (T 9 d), a 6: 33.33, flickering. Dark at T0 + 2.1 d. A call: 22.22 at T0 + 7 d; a text: 0.
  di: (e: GhostedEngine) => addPerson(e, "Di Vance", 3, day(-6)),
  // r 30 (T 90 d), a 50: 44.44, flickering. Dark at T0 + 31 d. Not at risk.
  cy: (e: GhostedEngine, cost = 10) => addPerson(e, "Cy Moss", 30, day(-50), cost),
  // r 30, a 0: lit. Never a candidate.
  fay: (e: GhostedEngine) => addPerson(e, "Fay Ruiz", 30, T0),
  // r 1 (T 3 d), a 10: dark. Never a candidate.
  gil: (e: GhostedEngine) => addPerson(e, "Gil Ortega", 1, day(-10)),
}

const picksAt = (engine: GhostedEngine, budget = 1440, now = T0) => engine.triage(budget, now).picks
const names = (engine: GhostedEngine, ids: readonly string[], now = T0) =>
  ids.map((id) => engine.view(now).find((p) => p.id === id)!.payload.name)

describe("triageSaves: the count (design section 13.8)", () => {
  it("assumes a call, and the window is LOSS_FORECAST_DAYS (7) days, the same as the hero's line", () => {
    expect(SAVE_EVENT).toEqual({ kind: "call" })
    expect(LOSS_FORECAST_DAYS).toBe(7)
  })

  it("no picks: 0", () => {
    const engine = makeEngine()
    expect(picksAt(engine)).toEqual([])
    expect(triageSaves([], T0)).toBe(0)
    expect(savedPicks(picksAt(engine), T0)).toEqual([])
  })

  it("zero, not at risk: Cy goes dark at T0 + 31 days", () => {
    const engine = makeEngine()
    PEOPLE.cy(engine)
    const picks = picksAt(engine)
    expect(names(engine, picks.map((p) => p.item.id))).toEqual(["Cy Moss"])
    expect(picks[0]!.diesAt).toBeGreaterThan(END)
    expect(triageSaves(picks, T0)).toBe(0)
  })

  it("zero, at risk but not kept: Bo (rhythm 2) goes dark within the 7 days even after a call", () => {
    const engine = makeEngine()
    PEOPLE.bo(engine)
    const picks = picksAt(engine)
    expect(picks).toHaveLength(1)
    // At risk: dark at T0 + 2.4 days (to the engine's 1-minute precision).
    expect(picks[0]!.diesAt).toBeGreaterThanOrEqual(T0 + 2.4 * DAY_MS)
    expect(picks[0]!.diesAt).toBeLessThanOrEqual(T0 + 2.4 * DAY_MS + MINUTE_MS)
    expect(savedPicks(picks, T0)).toEqual([])
    expect(triageSaves(picks, T0)).toBe(0)
  })

  it("one: Ada (rhythm 10) is at risk and a call keeps her lit", () => {
    const engine = makeEngine()
    const ada = PEOPLE.ada(engine)
    const picks = picksAt(engine)
    expect(engine.view(T0)[0]!.state).toBe("weak")
    // Dark at T0 + 5 days.
    expect(picks[0]!.diesAt).toBeGreaterThanOrEqual(day(5))
    expect(picks[0]!.diesAt).toBeLessThanOrEqual(day(5) + MINUTE_MS)
    expect(savedPicks(picks, T0)).toEqual([ada])
    expect(triageSaves(picks, T0)).toBe(1)
  })

  it("many: of the five picks, Ada, Eli and Di are counted; Bo is not kept and Cy is not at risk", () => {
    const engine = makeEngine()
    const ids = {
      ada: PEOPLE.ada(engine),
      eli: PEOPLE.eli(engine),
      bo: PEOPLE.bo(engine),
      di: PEOPLE.di(engine),
      cy: PEOPLE.cy(engine),
      fay: PEOPLE.fay(engine),
      gil: PEOPLE.gil(engine),
    }
    const view = new Map(engine.view(T0).map((p) => [p.id, p.state] as const))
    expect(view.get(ids.fay)).toBe("alive")
    expect(view.get(ids.gil)).toBe("dead")
    // Fay is lit and Gil is dark, so neither is a candidate (Req 36.3).
    const picks = picksAt(engine)
    expect(picks.map((p) => p.item.id).sort()).toEqual([ids.ada, ids.eli, ids.bo, ids.di, ids.cy].sort())
    expect(savedPicks(picks, T0).sort()).toEqual([ids.ada, ids.eli, ids.di].sort())
    expect(triageSaves(picks, T0)).toBe(3)
  })

  it("keeps the picks' order", () => {
    const engine = makeEngine()
    PEOPLE.ada(engine)
    PEOPLE.di(engine)
    const picks = picksAt(engine)
    const counted = new Set(savedPicks(picks, T0))
    expect(savedPicks(picks, T0)).toEqual(picks.map((p) => p.item.id).filter((id) => counted.has(id)))
  })

  it("a text is not enough for Di (rhythm 3), a call is: the line counts her, and names the call", () => {
    const engine = makeEngine()
    const di = PEOPLE.di(engine)
    const picks = picksAt(engine)
    expect(savedPicks(picks, T0)).toEqual([di])

    // The policy fact behind design section 13.4, through the policy's own functions.
    const person = picks[0]!.item
    const after = (kind: "text" | "call") => {
      const r = ghostedPolicy.applyEvent(person, { kind }, T0)
      return ghostedPolicy.healthAt({ ...person, health: r.health, policyData: r.policyData, lastEventAt: T0 }, END)
    }
    // A text: 33.33 + 40 = 73.33, which is a = 2.4 days; at T0 + 7 days a = 9.4 days > T = 9: 0.
    expect(after("text")).toBe(0)
    // A call: a = 0; at T0 + 7 days 100 × (1 − 7 / 9) = 22.22.
    expect(after("call")).toBeCloseTo(200 / 9, 9)
  })

  it("boundary in: a diesAt exactly at now + 7 days is counted", () => {
    const engine = makeEngine()
    const ada = PEOPLE.ada(engine)
    const pick: Candidate = { ...picksAt(engine)[0]!, diesAt: END }
    expect(savedPicks([pick], T0)).toEqual([ada])
  })

  it("boundary out: a diesAt 1 ms after now + 7 days is not", () => {
    const engine = makeEngine()
    PEOPLE.ada(engine)
    const pick: Candidate = { ...picksAt(engine)[0]!, diesAt: END + 1 }
    expect(triageSaves([pick], T0)).toBe(0)
  })

  it("a missing diesAt is not counted", () => {
    const engine = makeEngine()
    PEOPLE.ada(engine)
    const pick: Candidate = { ...picksAt(engine)[0]!, diesAt: null }
    expect(triageSaves([pick], T0)).toBe(0)
  })

  it("counted once: the same pick twice counts 1", () => {
    const engine = makeEngine()
    const ada = PEOPLE.ada(engine)
    const pick = picksAt(engine)[0]!
    expect(savedPicks([pick, pick], T0)).toEqual([ada])
    expect(triageSaves([pick, pick], T0)).toBe(1)
  })

  it("does not change the picks", () => {
    const engine = makeEngine()
    PEOPLE.ada(engine)
    const picks = picksAt(engine)
    const before = JSON.stringify(picks)
    triageSaves(picks, T0)
    expect(JSON.stringify(picks)).toBe(before)
  })

  it("follows the budget: Ada (20 min) and Cy (10 min) give 0 at 15 minutes and 1 at 30", () => {
    const engine = makeEngine()
    PEOPLE.ada(engine, 20)
    PEOPLE.cy(engine, 10)
    const at15 = picksAt(engine, 15)
    expect(names(engine, at15.map((p) => p.item.id))).toEqual(["Cy Moss"])
    expect(triageSaves(at15, T0)).toBe(0)
    const at30 = picksAt(engine, 30)
    expect(names(engine, at30.map((p) => p.item.id)).sort()).toEqual(["Ada Fenn", "Cy Moss"])
    expect(triageSaves(at30, T0)).toBe(1)
  })
})

describe("triageSaves on the sample street (design section 13.7)", () => {
  it("today nobody flickering goes dark within 7 days, so the count is 0 at every budget", () => {
    const engine = makeEngine()
    loadSampleData(engine, T0)
    for (const budget of [15, 30, 60, 120, 1440]) {
      expect(triageSaves(picksAt(engine, budget), T0), `${budget} min`).toBe(0)
    }
  })

  it("15 days ahead, 30 minutes: the picks are Dan and Meera, and a call keeps Meera lit (count 1)", () => {
    const engine = makeEngine()
    loadSampleData(engine, T0)
    const now = day(15)
    const picks = picksAt(engine, 30, now)
    expect(names(engine, picks.map((p) => p.item.id), now)).toEqual(["Dan Okafor", "Meera Joshi"])
    // Meera goes dark at T0 + 21.7 days, 6.7 days after now; Dan at T0 + 25.5 days.
    expect(names(engine, savedPicks(picks, now), now)).toEqual(["Meera Joshi"])
    expect(triageSaves(picks, now)).toBe(1)
  })

  it("15 days ahead, 15 minutes: the picks are Dan and Sam, neither at risk (no line)", () => {
    const engine = makeEngine()
    loadSampleData(engine, T0)
    const now = day(15)
    const picks = picksAt(engine, 15, now)
    expect(names(engine, picks.map((p) => p.item.id), now).sort()).toEqual(["Dan Okafor", "Sam Rivera"])
    expect(triageSaves(picks, now)).toBe(0)
  })
})

describe("triageText.saves: the exact words (design section 13.5, Req 36.5)", () => {
  const TABLE: readonly [number, string][] = [
    [1, "A call or meet-up with these people keeps 1 window from going dark in the next 7 days."],
    [2, "A call or meet-up with these people keeps 2 windows from going dark in the next 7 days."],
    [3, "A call or meet-up with these people keeps 3 windows from going dark in the next 7 days."],
  ]

  it.each(TABLE)("%i", (n, text) => {
    expect(triageText.saves(n)).toBe(text)
  })

  it('says "in the next 7 days", never "this week", "die", "dead" or how much anyone matters', () => {
    for (const [n] of TABLE) {
      const text = triageText.saves(n)
      expect(text).toContain("in the next 7 days")
      expect(text).not.toMatch(/\bthis week\b/i)
      expect(text).not.toMatch(/\b(die|dies|died|dying|dead)\b/i)
      expect(text).not.toMatch(/\b(matters?|cares?)\b/i)
    }
  })
})
