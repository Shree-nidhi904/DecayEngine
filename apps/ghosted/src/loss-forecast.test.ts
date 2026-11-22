// The loss forecast line's counts and words (task P4, task 9.1; design
// sections 12.2, 12.3, 12.5 and 12.6; Req 35.2-35.6, 35.8, 35.11).
//
// A real engine with ghostedPolicy on InMemoryAdapter, fixed times (T0 plus
// offsets), never the real clock. Every expected value is worked out by hand
// from the policy's straight line (T = 3 × rhythm days; a lit person starts
// to flicker at L + 2T/5 and goes dark once more than 9T/10 has passed).

import { describe, expect, it } from "vitest"
import type { GhostedEngine } from "./engine-instance"
import { LOSS_FORECAST_DAYS, lossForecast, type LossForecast } from "./loss-forecast"
import { ghostedPolicy, type PersonPayload } from "./policy"
import { loadSampleData } from "./sample-data"
import { dockMarkers } from "./timeline"
import { heroText } from "./wording"
import { DAY_MS, T0, day, makeEngine } from "./test/fixtures"

const WEEK_MS = LOSS_FORECAST_DAYS * DAY_MS

function addPerson(engine: GhostedEngine, name: string, rhythmDays: number, lastContactAt: number): string {
  const payload: PersonPayload = { name, relationship: "", rhythmDays, lastContactAt }
  return engine.addItem({ payload, importance: 2, costMinutes: 10 }, T0)
}

/** The line's counts as the App works them out, at `realNow`. */
function lossAt(engine: GhostedEngine, realNow: number): LossForecast | null {
  return lossForecast(engine.view(realNow), engine.forecast(realNow, WEEK_MS), realNow)
}

describe("lossForecast: the counts (design section 12.6)", () => {
  it("the horizon is 7 days", () => {
    expect(LOSS_FORECAST_DAYS).toBe(7)
  })

  it("the sample street at T0: Sunita starts to flicker (+2.4 days), nobody goes dark (section 12.5)", () => {
    const engine = makeEngine()
    loadSampleData(engine, T0)
    // Nobody goes dark within the 7 days: the first is Sunita at +12.9 days.
    expect(engine.forecast(T0, WEEK_MS)).toEqual([])
    expect(lossAt(engine, T0)).toEqual({ fade: 1, dark: 0 })
  })

  it("nothing changing: a lit person who starts to flicker on day 36 gives zero and zero, not null", () => {
    const engine = makeEngine()
    addPerson(engine, "Mira Castell", 30, T0) // fades at T0 + 36 d
    expect(lossAt(engine, T0)).toEqual({ fade: 0, dark: 0 })
  })

  it("counted once: a person who starts to flicker and goes dark within the 7 days counts only as going dark", () => {
    const engine = makeEngine()
    const id = addPerson(engine, "Mira Castell", 1, T0) // T = 3 d: fades at +1.2 d, dark after +2.7 d
    // Both of the dock's markers for this person fall within the 7 days...
    const markers = dockMarkers(engine.view(T0), engine.forecast(T0, WEEK_MS), T0).filter((m) => m.id === id)
    expect(markers.map((m) => [m.type, m.day])).toEqual([
      ["fades", 2],
      ["dark", 3],
    ])
    // ...but the line counts the person once.
    expect(lossAt(engine, T0)).toEqual({ fade: 0, dark: 1 })
  })

  it("fade boundary, in: nextDueAt exactly at realNow + 7 days is counted (open point 12.7.2)", () => {
    const engine = makeEngine()
    addPerson(engine, "Mira Castell", 10, T0) // T = 30 d, 2T/5 = 1 036 800 000 ms: fades at T0 + 12 d
    const realNow = day(5)
    const person = engine.view(realNow)[0]!
    expect(person.state).toBe("alive")
    expect(ghostedPolicy.nextDueAt(person, realNow)).toBe(realNow + WEEK_MS)
    expect(lossAt(engine, realNow)).toEqual({ fade: 1, dark: 0 })
  })

  it("fade boundary, out: 1 ms earlier, nextDueAt is 7 days and 1 ms away", () => {
    const engine = makeEngine()
    addPerson(engine, "Mira Castell", 10, T0)
    expect(lossAt(engine, day(5) - 1)).toEqual({ fade: 0, dark: 0 })
  })

  it("dark boundary, in: freshness at realNow + 7 days is just below 10", () => {
    const engine = makeEngine()
    addPerson(engine, "Mira Castell", 10, T0)
    // Already flickering at T0 + 20 d (past 12 d), so never counted as starting to flicker.
    // The window ends at T0 + 27 d + 1 ms: 100 × (1 − (27 d + 1 ms) / 30 d) < 10.
    const realNow = day(20) + 1
    expect(engine.view(realNow)[0]!.state).toBe("weak")
    expect(engine.view(realNow + WEEK_MS)[0]!.state).toBe("dead")
    expect(lossAt(engine, realNow)).toEqual({ fade: 0, dark: 1 })
  })

  it("dark boundary, out: at realNow + 7 days freshness is exactly 10, still flickering", () => {
    const engine = makeEngine()
    addPerson(engine, "Mira Castell", 10, T0)
    const realNow = day(20)
    expect(engine.view(realNow + WEEK_MS)[0]!.state).toBe("weak")
    expect(lossAt(engine, realNow)).toEqual({ fade: 0, dark: 0 })
  })

  it("counts several people, each once", () => {
    const engine = makeEngine()
    addPerson(engine, "Mira Castell", 5, T0) // T = 15 d: fades at +6 d, dark after +13.5 d → starts to flicker
    addPerson(engine, "Ola Brandt", 1, T0) // T = 3 d: dark after +2.7 d → goes dark
    addPerson(engine, "Teo Varga", 2, T0) // T = 6 d: fades at +2.4 d, dark after +5.4 d → goes dark
    addPerson(engine, "Ines Moreau", 30, T0) // fades at +36 d → not counted
    expect(lossAt(engine, T0)).toEqual({ fade: 1, dark: 2 })
  })

  it("a person exactly at 60 at realNow is not counted, as the dock gives no marker on day 0 (open point 12.7.3)", () => {
    const engine = makeEngine()
    addPerson(engine, "Mira Castell", 30, day(-36)) // freshness exactly 60 at T0, still lit; dark at +45 d
    expect(engine.view(T0)[0]!.state).toBe("alive")
    expect(lossAt(engine, T0)).toEqual({ fade: 0, dark: 0 })
  })

  it("only dark windows: null, so the line is hidden (Req 35.8)", () => {
    const engine = makeEngine()
    addPerson(engine, "Mira Castell", 1, day(-10)) // dark at creation
    expect(engine.view(T0)[0]!.state).toBe("dead")
    expect(lossAt(engine, T0)).toBeNull()
  })

  it("nobody on the street: null (Req 35.8)", () => {
    expect(lossAt(makeEngine(), T0)).toBeNull()
  })
})

describe("heroText.lossForecast: the exact words (design section 12.3, Req 35.6, 35.11)", () => {
  const TABLE: readonly [number, number, string][] = [
    [0, 0, "No window will start to flicker or go dark in the next 7 days."],
    [1, 0, "If you do nothing, in the next 7 days 1 window starts to flicker."],
    [3, 0, "If you do nothing, in the next 7 days 3 windows start to flicker."],
    [0, 1, "If you do nothing, in the next 7 days 1 window goes dark."],
    [0, 2, "If you do nothing, in the next 7 days 2 windows go dark."],
    [1, 1, "If you do nothing, in the next 7 days 1 window starts to flicker and 1 goes dark."],
    [2, 1, "If you do nothing, in the next 7 days 2 windows start to flicker and 1 goes dark."],
    [3, 2, "If you do nothing, in the next 7 days 3 windows start to flicker and 2 go dark."],
  ]

  it.each(TABLE)("fade %i, dark %i", (fade, dark, text) => {
    expect(heroText.lossForecast(fade, dark)).toBe(text)
  })

  it('says "next 7 days", never "this week", "die" or "dead"', () => {
    for (const [fade, dark] of TABLE) {
      const text = heroText.lossForecast(fade, dark)
      expect(text).toContain("the next 7 days")
      expect(text).not.toMatch(/\bthis week\b/i)
      expect(text).not.toMatch(/\b(die|dies|died|dying|dead)\b/i)
    }
  })
})
