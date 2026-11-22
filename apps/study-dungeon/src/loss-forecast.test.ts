// The loss forecast line's counts and words (task P4, task 22.1; design "Loss
// Forecast Line", Tests; Requirement 20.2-20.6, 20.8, 20.11).
//
// A real engine with studyDungeonPolicy on InMemoryAdapter, fixed times (T0
// plus offsets), never the real clock. Every expected value is worked out by
// hand in the design from the policy (health = H × 0.5^(t / half-life); alive
// at 60 and above, dead below 10).

import { describe, expect, it } from "vitest"
import { DecayEngine, InMemoryAdapter } from "@decay-engine/engine"
import { LOSS_FORECAST_DAYS, lossForecast, type LossForecast } from "./loss-forecast"
import {
  DAY_MS,
  studyDungeonPolicy,
  type FactPayload,
  type FactPolicyData,
  type Knowledge,
  type ReviewEvent,
} from "./policy"
import { loadSampleData } from "./sample-data"
import { timelineEvents } from "./timeline"
import { heroText } from "./wording"
import { T0 } from "./test/fixtures"

type Engine = DecayEngine<FactPayload, FactPolicyData, ReviewEvent>

const WEEK_MS = LOSS_FORECAST_DAYS * DAY_MS

/** A real engine with ids f1, f2, … in addItem order. */
function makeEngine(): Engine {
  let n = 0
  return new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(studyDungeonPolicy, new InMemoryAdapter(), () => `f${++n}`)
}

function addFact(engine: Engine, knowledge: Knowledge, at: number, question = `Question ${knowledge}`): string {
  return engine.addItem({ payload: { question, answer: "Answer", why: "", knowledge }, importance: 2, costMinutes: 2 }, at)
}

/** The line's counts as the hero works them out, at `realNow`. */
function lossAt(engine: Engine, realNow: number): LossForecast | null {
  return lossForecast(engine.view(realNow), engine.forecast(realNow, WEEK_MS), realNow)
}

/** A solid fact (half-life 10) dies at T0 + 10 × DAY_MS × log2(10) = T0 + 2 870 145 873.98 ms. */
const SOLID_DIES_AFTER_MS = 2_870_145_874
/** The first whole millisecond at which that fact is dead. */
const D = T0 + SOLID_DIES_AFTER_MS

describe("lossForecast: the counts (design, Loss Forecast Line, Tests)", () => {
  it("the horizon is 7 days", () => {
    expect(LOSS_FORECAST_DAYS).toBe(7)
  })

  it("the sample at T0: binary search weakens (+6.74 d), helicase dies (+5.29 d)", () => {
    const engine = makeEngine()
    loadSampleData(engine, T0)
    expect(lossAt(engine, T0)).toEqual({ weaken: 1, die: 1 })

    // Cross-check with the engine's own states 7 days later (the worked example).
    const stateOf = (question: string, at: number) => engine.view(at).find((f) => f.payload.question === question)!.state
    const later = T0 + WEEK_MS
    expect(stateOf("Time cost of binary search?", T0)).toBe("alive")
    expect(stateOf("Time cost of binary search?", later)).toBe("weak")
    expect(stateOf("Enzyme that unwinds DNA?", T0)).toBe("weak")
    expect(stateOf("Enzyme that unwinds DNA?", later)).toBe("dead")
    for (const question of ["Capital of Australia?", "Unit of electrical resistance?", "TCP handshake, in order?"]) {
      expect(stateOf(question, T0), question).toBe("alive")
      expect(stateOf(question, later), question).toBe("alive")
    }
    // The forecast lists exactly helicase.
    const deaths = engine.forecast(T0, WEEK_MS)
    expect(deaths.map((d) => d.item.payload.question)).toEqual(["Enzyme that unwinds DNA?"])
  })

  it("zero, with facts: a solid fact that weakens at +7.37 days gives zero and zero, not null", () => {
    const engine = makeEngine()
    addFact(engine, "solid", T0)
    expect(lossAt(engine, T0)).toEqual({ weaken: 0, die: 0 })
  })

  it("counted once: a new fact that weakens (+1.47 d) and dies (+6.64 d) inside the 7 days counts only as dying", () => {
    const engine = makeEngine()
    const id = addFact(engine, "new", T0)
    // Both of the dock's events for this fact fall within the 7 days...
    const events = timelineEvents(engine.view(T0), engine.forecast(T0, WEEK_MS), T0, LOSS_FORECAST_DAYS).filter(
      (e) => e.id === id
    )
    expect(events.map((e) => [e.kind, e.day])).toEqual([
      ["weak", 2],
      ["dead", 7],
    ])
    // ...but the line counts it once.
    expect(lossAt(engine, T0)).toEqual({ weaken: 0, die: 1 })
  })

  it("die boundary, in: the window ends exactly at the first dead millisecond", () => {
    expect(Math.ceil(10 * DAY_MS * Math.log2(10))).toBe(SOLID_DIES_AFTER_MS)
    const engine = makeEngine()
    addFact(engine, "solid", T0)
    const realNow = D - WEEK_MS // T0 + 26.22 d: weak
    expect(engine.view(realNow)[0]!.state).toBe("weak")
    expect(engine.view(D)[0]!.state).toBe("dead")
    expect(lossAt(engine, realNow)).toEqual({ weaken: 0, die: 1 })
  })

  it("die boundary, out: 1 ms earlier, health at the window's end is just above 10", () => {
    const engine = makeEngine()
    addFact(engine, "solid", T0)
    const realNow = D - WEEK_MS - 1
    expect(engine.view(D - 1)[0]!.state).toBe("weak")
    expect(lossAt(engine, realNow)).toEqual({ weaken: 0, die: 0 })
  })

  it("weaken boundary, in: the weak crossing is 7 days − 0.64 ms away (day 7)", () => {
    const engine = makeEngine()
    addFact(engine, "solid", T0) // weakens at T0 + 636 738 273.36 ms
    const realNow = T0 + 31_938_274
    const fact = engine.view(realNow)[0]!
    expect(fact.state).toBe("alive")
    const weakAt = studyDungeonPolicy.nextDueAt(fact, realNow)!
    expect(weakAt - realNow).toBeLessThan(WEEK_MS)
    expect(weakAt - realNow).toBeGreaterThan(WEEK_MS - 1)
    expect(lossAt(engine, realNow)).toEqual({ weaken: 1, die: 0 })
  })

  it("weaken boundary, out: 1 ms earlier, the crossing is 7 days + 0.36 ms away (day 8)", () => {
    const engine = makeEngine()
    addFact(engine, "solid", T0)
    const realNow = T0 + 31_938_273
    const weakAt = studyDungeonPolicy.nextDueAt(engine.view(realNow)[0]!, realNow)!
    expect(weakAt - realNow).toBeGreaterThan(WEEK_MS)
    expect(weakAt - realNow).toBeLessThan(WEEK_MS + 1)
    expect(lossAt(engine, realNow)).toEqual({ weaken: 0, die: 0 })
  })

  it("only dead facts: null, so the line is hidden (Req 20.8)", () => {
    const engine = makeEngine()
    addFact(engine, "new", T0 - 10 * DAY_MS) // died at +6.64 d after it was added
    expect(engine.view(T0)[0]!.state).toBe("dead")
    expect(lossAt(engine, T0)).toBeNull()
  })

  it("no facts: null (Req 20.8)", () => {
    expect(lossAt(makeEngine(), T0)).toBeNull()
  })
})

describe("heroText.lossForecast: the exact words (design, Wording; Req 20.6, 20.11)", () => {
  const TABLE: readonly [number, number, string][] = [
    [0, 0, "Nothing will weaken or die in the next 7 days."],
    [1, 0, "If you do nothing, in the next 7 days 1 fact weakens."],
    [3, 0, "If you do nothing, in the next 7 days 3 facts weaken."],
    [0, 1, "If you do nothing, in the next 7 days 1 fact dies."],
    [0, 2, "If you do nothing, in the next 7 days 2 facts die."],
    [1, 1, "If you do nothing, in the next 7 days 1 fact weakens and 1 dies."],
    [2, 0, "If you do nothing, in the next 7 days 2 facts weaken."],
    [3, 2, "If you do nothing, in the next 7 days 3 facts weaken and 2 die."],
    // Not a row of the design's table; from its rule (the verb after "and" agrees with the second count).
    [2, 1, "If you do nothing, in the next 7 days 2 facts weaken and 1 dies."],
  ]

  it.each(TABLE)("weaken %i, die %i", (weaken, die, text) => {
    expect(heroText.lossForecast(weaken, die)).toBe(text)
  })

  it('says "in the next 7 days", never "this week"', () => {
    for (const [weaken, die] of TABLE) {
      const text = heroText.lossForecast(weaken, die)
      expect(text).toContain("in the next 7 days")
      expect(text).not.toMatch(/\bthis week\b/i)
    }
  })
})
