// What this session saves: the count under the Triage picks (task P5, task
// 23.1; design "What This Session Saves", Tests; Requirement 21.2-21.6).
//
// A real engine with studyDungeonPolicy on InMemoryAdapter, fixed times (T0
// plus offsets), never the real clock. Every expected value is worked out by
// hand in the design from the policy (health = H × 0.5^(t / half-life); a
// right answer gives 100 and doubles the half-life, a wrong one gives 45 and
// halves it; alive at 60 and above, dead below 10).

import { describe, expect, it } from "vitest"
import { DecayEngine, InMemoryAdapter, type TriageCandidate } from "@decay-engine/engine"
import { LOSS_FORECAST_DAYS } from "./loss-forecast"
import { DAY_MS, studyDungeonPolicy, type FactPayload, type FactPolicyData, type ReviewEvent } from "./policy"
import { loadSampleData } from "./sample-data"
import { SAVE_EVENT, savedPicks, triageSaves } from "./triage-saves"
import { T0, makeEngine } from "./test/fixtures"

type Pick = TriageCandidate<FactPayload, FactPolicyData>

const HOUR_MS = 3_600_000
const WEEK_MS = LOSS_FORECAST_DAYS * DAY_MS
const BUDGET = 1440

// The design's fixture facts, all at now = T0:
//   f1, f2  new (half-life 2) added T0 − 2 d: 50, weak; dies T0 + 2 × log2(5) = 4.64 d.
//           Right answer at T0: half-life 4, health 100 × 0.5^(7/4) = 29.7 at T0 + 7 d. At risk, saved.
//   f3      new added T0 − 1 d, wrong at T0 − 1 h (100 × 0.5^(23/48) = 71.7 then, alive):
//           45, half-life 1; at T0, 45 × 0.5^(1/24) = 43.71, weak; dies T0 + log2(4.371) = 2.13 d.
//           Right answer at T0: half-life 2, health 100 × 0.5^3.5 = 8.84 at T0 + 7 d. At risk, not saved.
//   f4      shaky (half-life 5) added T0 − 4 d: 57.43, weak; dies T0 + 5 × log2(5.743) = 12.61 d. Not at risk.
//   f5      solid added at T0: 100, alive. Never a candidate.
type FixtureId = "f1" | "f2" | "f3" | "f4" | "f5"

function fixture(ids: readonly FixtureId[], cost: Partial<Record<FixtureId, number>> = {}) {
  const kit = makeEngine()
  const extra = (id: FixtureId) => ({ costMinutes: cost[id] ?? 2 })
  for (const id of ids) {
    if (id === "f1" || id === "f2") kit.add(id, "new", T0 - 2 * DAY_MS, extra(id))
    if (id === "f3") {
      kit.add(id, "new", T0 - DAY_MS, extra(id))
      kit.engine.tend(id, { kind: "review", correct: false }, T0 - HOUR_MS)
    }
    if (id === "f4") kit.add(id, "shaky", T0 - 4 * DAY_MS, extra(id))
    if (id === "f5") kit.add(id, "solid", T0, extra(id))
  }
  return kit
}

/** f1's real pick at T0, alone in its engine. */
function f1Pick(): Pick {
  const { engine } = fixture(["f1"])
  const pick = engine.triage(BUDGET, T0).picks[0]
  if (pick === undefined) throw new Error("test bug: f1 is not a pick")
  return pick
}

describe("the fixture facts are what the design says", () => {
  it("f1, f3 and f4 are weak at T0 with the hand-worked health and death times; f5 is alive", () => {
    const { viewOf } = fixture(["f1", "f3", "f4", "f5"])
    expect(viewOf("f1", T0)).toMatchObject({ state: "weak", health: 50 })
    expect(viewOf("f3", T0).state).toBe("weak")
    // 45 × 0.5^(1/24) = 43.7189…
    expect(viewOf("f3", T0).health).toBeCloseTo(43.719, 3)
    expect(viewOf("f3", T0).policyData.halfLifeDays).toBe(1)
    expect(viewOf("f4", T0).state).toBe("weak")
    // 100 × 0.5^(4/5) = 57.4349…
    expect(viewOf("f4", T0).health).toBeCloseTo(57.435, 3)
    expect(viewOf("f5", T0)).toMatchObject({ state: "alive", health: 100 })

    const { engine } = fixture(["f1", "f3", "f4"])
    const diesAt = Object.fromEntries(engine.triage(BUDGET, T0).picks.map((p) => [p.item.id, p.diesAt!]))
    // The engine dates a death to 1 minute, at a time the fact is already
    // dead: from the real crossing to 1 minute after it.
    const expectDiesAfterDays = (id: string, days: number) => {
      const crossing = T0 + days * DAY_MS
      expect(diesAt[id]!, id).toBeGreaterThanOrEqual(crossing - 1)
      expect(diesAt[id]!, id).toBeLessThanOrEqual(crossing + 60_000 + 1)
    }
    expectDiesAfterDays("f1", 2 * Math.log2(5)) // 4.64 d
    expectDiesAfterDays("f3", Math.log2(4.5) - 1 / 24) // 45 at T0 − 1 h, half-life 1: 2.13 d
    expectDiesAfterDays("f4", 5 * Math.log2(10) - 4) // 100 at T0 − 4 d, half-life 5: 12.61 d
  })
})

describe("triageSaves and savedPicks (design, What This Session Saves, Tests)", () => {
  it("the horizon: SAVE_EVENT is a right answer and the window is LOSS_FORECAST_DAYS (7) days", () => {
    expect(SAVE_EVENT).toEqual({ kind: "review", correct: true })
    expect(LOSS_FORECAST_DAYS).toBe(7)
  })

  it("no picks: 0", () => {
    const { engine } = makeEngine()
    const { picks } = engine.triage(BUDGET, T0)
    expect(picks).toEqual([])
    expect(triageSaves(picks, T0)).toBe(0)
    expect(savedPicks(picks, T0)).toEqual([])
  })

  it("zero, not at risk: f4 dies after the window", () => {
    const { engine } = fixture(["f4"])
    const { picks } = engine.triage(BUDGET, T0)
    expect(picks.map((p) => p.item.id)).toEqual(["f4"])
    expect(picks[0]!.diesAt!).toBeGreaterThan(T0 + WEEK_MS)
    expect(triageSaves(picks, T0)).toBe(0)
  })

  it("zero, at risk but not saved: f3 dies inside the window even after a right answer", () => {
    const { engine } = fixture(["f3"])
    const { picks } = engine.triage(BUDGET, T0)
    expect(picks.map((p) => p.item.id)).toEqual(["f3"])
    expect(picks[0]!.diesAt!).toBeLessThanOrEqual(T0 + WEEK_MS)
    expect(triageSaves(picks, T0)).toBe(0)
    expect(savedPicks(picks, T0)).toEqual([])

    // The real engine agrees: after a right answer at T0, f3 (half-life 2) is at 8.84 at T0 + 7 d, dead.
    engine.tend("f3", SAVE_EVENT, T0)
    const after = engine.view(T0 + WEEK_MS).find((f) => f.id === "f3")!
    expect(after.state).toBe("dead")
  })

  it("one: f1 is at risk and a right answer saves it", () => {
    const { engine } = fixture(["f1"])
    const { picks } = engine.triage(BUDGET, T0)
    expect(triageSaves(picks, T0)).toBe(1)
    expect(savedPicks(picks, T0)).toEqual(["f1"])

    // The real engine agrees: half-life 4, 100 × 0.5^(7/4) = 29.7 at T0 + 7 d, weak, not dead.
    engine.tend("f1", SAVE_EVENT, T0)
    const after = engine.view(T0 + WEEK_MS).find((f) => f.id === "f1")!
    expect(after.state).toBe("weak")
    expect(after.health).toBeCloseTo(29.73, 2)
  })

  it("many: f1 to f5 picks f1 to f4 (f5 is alive, not a candidate) and counts f1 and f2", () => {
    const { engine } = fixture(["f1", "f2", "f3", "f4", "f5"])
    const { picks } = engine.triage(BUDGET, T0)
    expect(picks.map((p) => p.item.id).sort()).toEqual(["f1", "f2", "f3", "f4"])
    expect(triageSaves(picks, T0)).toBe(2)
    expect([...savedPicks(picks, T0)].sort()).toEqual(["f1", "f2"])
    // In the order of the picks.
    expect(savedPicks(picks, T0)).toEqual(picks.map((p) => p.item.id).filter((id) => id === "f1" || id === "f2"))
  })

  it("boundary in: diesAt exactly now + 7 days is counted", () => {
    const pick = { ...f1Pick(), diesAt: T0 + LOSS_FORECAST_DAYS * DAY_MS }
    expect(triageSaves([pick], T0)).toBe(1)
  })

  it("boundary out: diesAt 1 ms after now + 7 days is not counted", () => {
    const pick = { ...f1Pick(), diesAt: T0 + LOSS_FORECAST_DAYS * DAY_MS + 1 }
    expect(triageSaves([pick], T0)).toBe(0)
  })

  it("missing diesAt: a pick not dying within 10 years is not counted", () => {
    const pick = { ...f1Pick(), diesAt: null }
    expect(triageSaves([pick], T0)).toBe(0)
  })

  it("counted once: the same pick twice counts 1", () => {
    const pick = f1Pick()
    expect(triageSaves([pick, pick], T0)).toBe(1)
    expect(savedPicks([pick, pick], T0)).toEqual(["f1"])
  })

  it("budget: f1 (3 min) and f4 (2 min); 2 minutes picks only f4 (0), 5 minutes picks both (1)", () => {
    const { engine } = fixture(["f1", "f4"], { f1: 3, f4: 2 })
    const two = engine.triage(2, T0).picks
    expect(two.map((p) => p.item.id)).toEqual(["f4"])
    expect(triageSaves(two, T0)).toBe(0)

    const five = engine.triage(5, T0).picks
    expect(five.map((p) => p.item.id).sort()).toEqual(["f1", "f4"])
    expect(triageSaves(five, T0)).toBe(1)
  })

  it("reads nothing but the picks: the engine is not changed", () => {
    const { engine } = fixture(["f1", "f2", "f3", "f4"])
    const before = engine.view(T0)
    const historyBefore = ["f1", "f2", "f3", "f4"].map((id) => engine.history(id))
    const { picks } = engine.triage(BUDGET, T0)
    savedPicks(picks, T0)
    expect(engine.view(T0)).toEqual(before)
    expect(["f1", "f2", "f3", "f4"].map((id) => engine.history(id))).toEqual(historyBefore)
  })
})

describe("the sample facts (design, What This Session Saves, Worked example)", () => {
  function sampleEngine() {
    let n = 0
    const engine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(
      studyDungeonPolicy,
      new InMemoryAdapter(),
      () => `s${n++}`
    )
    loadSampleData(engine, T0)
    const questionOf = (picks: readonly Pick[], ids: readonly string[]) =>
      ids.map((id) => picks.find((p) => p.item.id === id)!.item.payload.question)
    return { engine, questionOf }
  }

  it("20 minutes: all four weak facts fit, only helicase is at risk, and it is saved (1)", () => {
    const { engine, questionOf } = sampleEngine()
    const { picks } = engine.triage(20, T0)
    expect(picks.map((p) => p.item.payload.question).sort()).toEqual([
      "Derivative of ln x?",
      "Enzyme that unwinds DNA?",
      "Treaty that ended the Thirty Years' War?",
      "What does the mitochondrion do?",
    ])
    expect(triageSaves(picks, T0)).toBe(1)
    expect(questionOf(picks, savedPicks(picks, T0))).toEqual(["Enzyme that unwinds DNA?"])
  })

  it("10 minutes (the default): derivative, mitochondrion and treaty; none at risk (0)", () => {
    const { engine } = sampleEngine()
    const { picks } = engine.triage(10, T0)
    expect(picks.map((p) => p.item.payload.question).sort()).toEqual([
      "Derivative of ln x?",
      "Treaty that ended the Thirty Years' War?",
      "What does the mitochondrion do?",
    ])
    expect(triageSaves(picks, T0)).toBe(0)
  })

  it("5 minutes: derivative and treaty (0)", () => {
    const { engine } = sampleEngine()
    const { picks } = engine.triage(5, T0)
    expect(picks.map((p) => p.item.payload.question).sort()).toEqual([
      "Derivative of ln x?",
      "Treaty that ended the Thirty Years' War?",
    ])
    expect(triageSaves(picks, T0)).toBe(0)
  })

  it("at now = T0 + 7 days, 10 minutes: the mitochondrion is at risk and saved (1); 5 minutes: 0", () => {
    const { engine, questionOf } = sampleEngine()
    const now = T0 + 7 * DAY_MS
    const ten = engine.triage(10, now).picks
    expect(ten.map((p) => p.item.payload.question).sort()).toEqual([
      "Derivative of ln x?",
      "Treaty that ended the Thirty Years' War?",
      "What does the mitochondrion do?",
    ])
    expect(triageSaves(ten, now)).toBe(1)
    expect(questionOf(ten, savedPicks(ten, now))).toEqual(["What does the mitochondrion do?"])

    const five = engine.triage(5, now).picks
    expect(five.map((p) => p.item.payload.question).sort()).toEqual([
      "Derivative of ln x?",
      "Treaty that ended the Thirty Years' War?",
    ])
    expect(triageSaves(five, now)).toBe(0)
  })
})
