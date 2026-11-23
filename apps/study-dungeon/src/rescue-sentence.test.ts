// Rescue Point (task R1, task 24.3; Requirement 22, design "Rescue Point").
// Real engines on InMemoryAdapter with studyDungeonPolicy, fixed times
// (test/fixtures: T0 = 1 Oct 2026 00:00 UTC plus day offsets), time zone
// "UTC". Never the real clock.
//
// Expected values are worked from the policy rules (Requirements 1-4):
// health = H × 0.5^(days / half-life); a right answer gives 100 and doubles
// the half-life, a wrong one gives 45 and halves it (1-180 days); weak below
// 60, dead below 10. From 100 a fact weakens after log2(100/60) = 0.737 and
// dies after log2(10) = 3.32 half-lives; from 60 it dies after log2(6) = 2.58;
// from 45 after log2(4.5) = 2.17. The engine dates a crossing up to a minute late.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { DecayEngine, InMemoryAdapter, type AutopsyReport, type HistoryEntry } from "@decay-engine/engine"
import { DEATH_TIME_PRECISION_MS as P, whatIf } from "@decay-engine/insight"
import { generateCauseSentences } from "./autopsy-sentences"
import {
  DAY_MS,
  studyDungeonPolicy,
  type Fact,
  type FactPayload,
  type FactPolicyData,
  type ReviewEvent,
} from "./policy"
import {
  RESCUE_EVENT,
  generateRescueSentence,
  rescueDateFormatter,
  rescuePoint,
  rescueSentence,
  withRescue,
} from "./rescue-sentence"
import { SAMPLE_FACTS, loadSampleData } from "./sample-data"
import { T0, day, makeEngine, type TestEngine } from "./test/fixtures"

const UTC = { timeZone: "UTC" }
const right: ReviewEvent = { kind: "review", correct: true }
const wrong: ReviewEvent = { kind: "review", correct: false }

/** The dead fact at `at`, its history and its autopsy report. */
function partsAt(engine: TestEngine, id: string, at: number) {
  const fact = engine.view(at).find((f) => f.id === id) as Fact
  expect(fact.state).toBe("dead")
  return { fact, history: engine.history(id), report: engine.autopsy(id, at) }
}

/** The whatIf the module makes, called again here. */
function whatIfAt(fact: Fact, history: readonly HistoryEntry[], at: number) {
  return whatIf(studyDungeonPolicy, fact, history, { at, event: right })
}

/** d1: new (half-life 2), added day 0, never reviewed; looked at on day 10. Weak at 1.474 d, dead at 6.644 d. */
function neverReviewed() {
  const { engine, add } = makeEngine()
  add("d1", "new", day(0))
  return { engine, ...partsAt(engine, "d1", day(10)) }
}

describe("rescueSentence: the words (Req 22.1, 22.6)", () => {
  it("has the exact words, with the year on both dates", () => {
    const point = { at: Date.UTC(2026, 9, 23, 12), until: Date.UTC(2026, 10, 6, 12), extraDays: 8 }
    expect(rescueSentence(point, UTC)).toBe(
      "A review on 23 Oct 2026, when it went weak, would have kept it alive until 6 Nov 2026, 8 days longer."
    )
  })

  it('says "1 day longer" for one day', () => {
    const point = { at: Date.UTC(2026, 9, 23, 12), until: Date.UTC(2026, 9, 25, 12), extraDays: 1 }
    expect(rescueSentence(point, UTC)).toBe(
      "A review on 23 Oct 2026, when it went weak, would have kept it alive until 25 Oct 2026, 1 day longer."
    )
  })

  it("formats dates exactly as the cause sentences of autopsy-sentences.ts do, in two locales", () => {
    const { fact, report } = neverReviewed()
    expect(report.wentWeakAt).not.toBeNull()
    for (const options of [UTC, { timeZone: "UTC", locale: "en-US" }]) {
      const causes = generateCauseSentences(report, fact.payload, { ...options, halfLifeAtDeath: 2 })
      const weak = causes.map((s) => /^Went weak on (.+)\.$/.exec(s)?.[1]).find((d) => d !== undefined)
      const died = causes.map((s) => /^Died on (.+)\.$/.exec(s)?.[1]).find((d) => d !== undefined)
      const date = rescueDateFormatter(options)
      expect(weak, JSON.stringify(options)).toBe(date(report.wentWeakAt!))
      expect(died, JSON.stringify(options)).toBe(date(report.diedAt))
    }
  })
})

describe("rescuePoint: a line is shown", () => {
  it("never reviewed: a review on 2 Oct would have kept it alive until 15 Oct, 8 days longer", () => {
    // Weak at 2 × 0.737 = 1.474 d (2 Oct, 11:22); with a right review then, half-life 4,
    // it dies 4 × 3.32 = 13.29 d later (15 Oct, 18:17) instead of 2 × 2.58 = 5.17 d later: 8.12 d.
    const { fact, history, report } = neverReviewed()
    expect(generateRescueSentence(fact, history, report, UTC)).toBe(
      "A review on 2 Oct 2026, when it went weak, would have kept it alive until 15 Oct 2026, 8 days longer."
    )
  })

  it("uses whatIf's own numbers: at, diesAt as the end, and floor((diesAt − baselineDiesAt + P) / DAY_MS)", () => {
    const { fact, history, report } = neverReviewed()
    const w = whatIfAt(fact, history, report.wentWeakAt!)
    expect(w.ok).toBe(true)
    if (!w.ok) return
    expect(w.at).toBe(report.wentWeakAt)
    expect(rescuePoint(fact, history, report)).toEqual({
      at: w.at,
      until: w.diesAt,
      extraDays: Math.floor((w.diesAt! - w.baselineDiesAt! + P) / DAY_MS),
    })
  })

  it("weak by a wrong answer: the review is at that moment, 44 days longer", () => {
    // solid 10; right on day 2 (87, alive) → 100, half-life 20; wrong on day 4 (93, alive) → 45, half-life 10.
    // Real: dies 10 × 2.17 = 21.70 d later. What-if: right after the wrong one → 100, half-life 20,
    // dies 20 × 3.32 = 66.44 d later. Gain 44.74 d.
    const { engine, add } = makeEngine()
    add("f", "solid", day(0))
    engine.tend("f", right, day(2))
    engine.tend("f", wrong, day(4))
    const { fact, history, report } = partsAt(engine, "f", day(30))
    expect(report.wentWeakAt).toBe(day(4))
    expect(rescuePoint(fact, history, report)!.extraDays).toBe(44)
  })

  it("a wrong answer after it went weak: the what-if still dies later", () => {
    // new 2: weak at 1.474 d; wrong on day 2 (50) → 45, half-life 1: dies 2.17 d later (4.17 d).
    // What-if: right at 1.474 → 100, half-life 4; wrong on day 2 (91) → 45, half-life 2: dies 4.34 d later (6.34 d).
    const { engine, add } = makeEngine()
    add("f", "new", day(0))
    engine.tend("f", wrong, day(2))
    const { fact, history, report } = partsAt(engine, "f", day(10))
    expect(report.wentWeakAt).toBeLessThan(day(2))
    const w = whatIfAt(fact, history, report.wentWeakAt!)
    expect(w.ok).toBe(true)
    if (!w.ok) return
    expect(w.diesAt!).toBeGreaterThan(report.diedAt)
    expect(rescuePoint(fact, history, report)!.extraDays).toBe(2)
  })

  it("resurrected: the line names the weak time of the current life", () => {
    // new 2: dead at 6.64 d; a right challenge on day 10 brings it back at 100, half-life 2;
    // weak again 1.474 d later, dead 6.64 d later (day 16.64).
    const { engine, add } = makeEngine()
    add("f", "new", day(0))
    expect(engine.resurrect("f", right, day(10))).toEqual({ ok: true })
    const { fact, history, report } = partsAt(engine, "f", day(20))
    expect(report.timesResurrected).toBe(1)
    const weakAgain = day(10) + 2 * Math.log2(100 / 60) * DAY_MS
    const point = rescuePoint(fact, history, report)!
    expect(point.at).toBeGreaterThan(weakAgain)
    expect(point.at).toBeLessThanOrEqual(weakAgain + P)
    expect(point.extraDays).toBe(8)
  })

  it("a death seen only in a preview: the line shows and nothing is stored", () => {
    // solid 10, added day 10: weak at 17.37, dead at 43.22. What-if half-life 20: gain 66.44 − 25.85 = 40.59 d.
    const { engine, add } = makeEngine()
    add("p1", "solid", day(10))
    const { fact, history, report } = partsAt(engine, "p1", day(44))
    expect(rescuePoint(fact, history, report)!.extraDays).toBe(40)
    expect(engine.history("p1").map((e) => e.type)).toEqual(["created"])
  })
})

describe("rescuePoint: no line (Req 22.3)", () => {
  it("equal deaths: two wrong answers bring both lives to half-life 1, so N is 0", () => {
    // new 2; wrong on day 1 (70.7, alive) → 45, half-life 1, weak from here.
    // Wrong on day 2: real 22.5 → 45, half-life 1. What-if: right on day 1 → 100, half-life 2;
    // on day 2 (70.7) wrong → 45, half-life 1. The same from day 2 on.
    const { engine, add } = makeEngine()
    add("f", "new", day(0))
    engine.tend("f", wrong, day(1))
    engine.tend("f", wrong, day(2))
    const { fact, history, report } = partsAt(engine, "f", day(10))
    expect(report.wentWeakAt).toBe(day(1))
    const w = whatIfAt(fact, history, day(1))
    expect(w.ok).toBe(true)
    if (!w.ok) return
    expect(Math.abs(w.diesAt! - w.baselineDiesAt!)).toBeLessThanOrEqual(P)
    expect(rescuePoint(fact, history, report)).toBeNull()
    expect(generateRescueSentence(fact, history, report, UTC)).toBeNull()
  })

  it("wentWeakAt is null", () => {
    const { fact, history, report } = neverReviewed()
    const noWeak: AutopsyReport<ReviewEvent> = { ...report, wentWeakAt: null }
    expect(rescuePoint(fact, history, noWeak)).toBeNull()
    expect(generateRescueSentence(fact, history, noWeak, UTC)).toBeNull()
  })

  it("whatIf returns ok: false (a history without its created entry)", () => {
    const { fact, history, report } = neverReviewed()
    const broken = history.slice(1)
    expect(whatIfAt(fact, broken, report.wentWeakAt!).ok).toBe(false)
    expect(rescuePoint(fact, broken, report)).toBeNull()
  })

  it("stoppedAt is set (a what-if at an earlier life's weak time stops at the next resurrection)", () => {
    const { engine, add } = makeEngine()
    add("f", "new", day(0))
    engine.resurrect("f", right, day(10))
    const { fact, history, report } = partsAt(engine, "f", day(20))
    const firstWeak = history.find((e) => e.type === "state-changed" && e.from === "alive" && e.to === "weak")!
    const firstDeath = history.find((e) => e.type === "died")!
    expect(firstWeak.timestamp).toBeLessThan(day(10))
    const earlier: AutopsyReport<ReviewEvent> = { ...report, wentWeakAt: firstWeak.timestamp, diedAt: firstDeath.timestamp }
    const w = whatIfAt(fact, history, firstWeak.timestamp)
    expect(w.ok).toBe(true)
    if (!w.ok) return
    expect(w.stoppedAt?.why).toBe("next-life")
    expect(rescuePoint(fact, history, earlier)).toBeNull()
  })

  it("the replay guard: a line at exactly P from the real death, none at P + 1 ms", () => {
    const { fact, history, report } = neverReviewed()
    const w = whatIfAt(fact, history, report.wentWeakAt!)
    expect(w.ok).toBe(true)
    if (!w.ok) return
    const base = w.baselineDiesAt!
    expect(rescuePoint(fact, history, { ...report, diedAt: base + P })).not.toBeNull()
    expect(rescuePoint(fact, history, { ...report, diedAt: base - P })).not.toBeNull()
    expect(rescuePoint(fact, history, { ...report, diedAt: base + P + 1 })).toBeNull()
    expect(rescuePoint(fact, history, { ...report, diedAt: base - P - 1 })).toBeNull()
  })
})

describe("withRescue (Req 22.7)", () => {
  it("puts the rescue line second, straight after the cause", () => {
    expect(withRescue(["a", "b", "c"], "r")).toEqual(["a", "r", "b", "c"])
    expect(withRescue([], "r")).toEqual(["r"])
  })

  it("returns the cause sentences themselves when there is no line", () => {
    const causes = ["a", "b"]
    expect(withRescue(causes, null)).toBe(causes)
  })
})

describe("the module (Req 22.2, 22.10)", () => {
  it("assumes a right review", () => {
    expect(RESCUE_EVENT).toEqual({ kind: "review", correct: true })
  })

  it("never reads the clock", () => {
    const D = "Date"
    const source = readFileSync(fileURLToPath(new URL("./rescue-sentence.ts", import.meta.url)), "utf8")
    expect(new RegExp(`\\b${D}\\s*\\.\\s*now\\s*\\(`).test(source)).toBe(false)
    expect(new RegExp(`\\bnew\\s+${D}\\s*\\(\\s*\\)`).test(source)).toBe(false)
    expect(/performance\s*\.\s*now/.test(source)).toBe(false)
  })
})

describe("the sample facts (design, worked example)", () => {
  const LINE =
    /^A review on \d{1,2} \S+ \d{4}, when it went weak, would have kept it alive until \d{1,2} \S+ \d{4}, (\d+) days? longer\.$/

  it("Sistine Chapel 8, speed of light 16, gold 40 and Frankenstein 44 days", () => {
    let n = 0
    const engine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(
      studyDungeonPolicy,
      new InMemoryAdapter(),
      () => `s${n++}`
    )
    const ids = loadSampleData(engine, T0)
    const days = new Map<string, number>()
    ids.forEach((id, i) => {
      const fact = engine.view(T0).find((f) => f.id === id)!
      if (fact.state !== "dead") return
      const line = generateRescueSentence(fact, engine.history(id), engine.autopsy(id, T0), UTC)
      expect(line, SAMPLE_FACTS[i]!.question).toMatch(LINE)
      days.set(SAMPLE_FACTS[i]!.question, Number(LINE.exec(line!)![1]))
    })
    expect(Object.fromEntries(days)).toEqual({
      "Who wrote Frankenstein?": 44,
      "Who painted the Sistine Chapel ceiling?": 8,
      "Chemical symbol for gold?": 40,
      "Speed of light in a vacuum?": 16,
    })
  })
})
