// The rescue line is a real gain (task R1, task 24.4; Requirement 22.13,
// design "Rescue Point", Property).
//
// Real engines with studyDungeonPolicy, built by test/fact-generators.ts
// (unchanged), plus two shapes built here so the rarer branches occur often:
// a wrong answer after the fact went weak, and a fact brought back and dead
// again. Fixed times only, never the real clock.
//
// Expected (design, "Why the what-if death is later"): a right review at
// wentWeakAt is never worse than none, and with no review after it, the
// what-if death is at least 4.05 days later (half-life 1: 6.64 − 2.58).

import fc from "fast-check"
import { describe, expect, it } from "vitest"
import type { AutopsyReport } from "@decay-engine/engine"
import { DEATH_TIME_PRECISION_MS as P, whatIf } from "@decay-engine/insight"
import { DAY_MS, studyDungeonPolicy, type Knowledge, type ReviewEvent } from "./policy"
import { generateRescueSentence } from "./rescue-sentence"
import {
  MINUTE_MS,
  buildFacts,
  factAt,
  factsScenario,
  type FactsScenario,
} from "./test/fact-generators"

const UTC = { timeZone: "UTC" }
const DAY_MINUTES = DAY_MS / MINUTE_MS
const FIRST_HALF_LIFE: Record<Knowledge, number> = { new: 2, shaky: 5, solid: 10 }
const knowledge = fc.constantFrom<Knowledge>("new", "shaky", "solid")

/**
 * One fact, weak by decay (first review 0.8 to 3 half-lives after the add, a
 * wrong one), then 0 to 2 more wrong reviews under a day apart, and `now` 15
 * to 20 days later, when it is dead (45 at half-life 5 or less dies within
 * 10.9 days).
 */
function wrongAfterWeak(): fc.Arbitrary<FactsScenario> {
  return fc
    .record({
      k: knowledge,
      firstAt: fc.integer({ min: 800, max: 3000 }),
      more: fc.array(fc.integer({ min: 1, max: DAY_MINUTES - 1 }), { maxLength: 2 }),
      nowDays: fc.integer({ min: 15, max: 20 }),
    })
    .map(({ k, firstAt, more, nowDays }) => ({
      facts: [
        {
          knowledge: k,
          importance: 2 as const,
          costMinutes: 2 as const,
          steps: [
            { gapMinutes: Math.round((firstAt / 1000) * FIRST_HALF_LIFE[k] * DAY_MINUTES), correct: false },
            ...more.map((gapMinutes) => ({ gapMinutes, correct: false })),
          ],
        },
      ],
      nowGapMinutes: nowDays * DAY_MINUTES,
    }))
}

/** One fact, dead after 3.5 half-lives, brought back by a right challenge, and dead again 3.5 to 5 half-lives later. */
function deadAgain(): fc.Arbitrary<FactsScenario> {
  return fc.record({ k: knowledge, again: fc.integer({ min: 3500, max: 5000 }) }).map(({ k, again }) => {
    const h = FIRST_HALF_LIFE[k] * DAY_MINUTES
    return {
      facts: [
        {
          knowledge: k,
          importance: 2 as const,
          costMinutes: 2 as const,
          steps: [{ gapMinutes: Math.round(3.5 * h), correct: true }],
        },
      ],
      nowGapMinutes: Math.round((again / 1000) * h),
    }
  })
}

/** A third of the scenarios from each source. */
const scenarios = () => fc.oneof(factsScenario(), wrongAfterWeak(), deadAgain())

type DeadFact = {
  fact: ReturnType<typeof factAt>
  history: ReturnType<ReturnType<typeof buildFacts>["engine"]["history"]>
  report: AutopsyReport<ReviewEvent>
  line: string | null
}

/** Every fact of the scenario that is dead at its `now`, with its autopsy and its rescue line. */
function deadFacts(s: FactsScenario): DeadFact[] {
  const { engine, ids, now } = buildFacts(s)
  return ids
    .map((id) => factAt(engine, id, now))
    .filter((fact) => fact.state === "dead")
    .map((fact) => {
      const history = engine.history(fact.id)
      const report = engine.autopsy(fact.id, now)
      return { fact, history, report, line: generateRescueSentence(fact, history, report, UTC) }
    })
}

const N_OF = /, (\d+) days? longer\.$/

describe("the rescue line is a real gain (Req 22.13)", () => {
  it("never earlier; more than a day later with no review after it went weak; the line's N follows the rule", () => {
    fc.assert(
      fc.property(scenarios(), (s) => {
        for (const { fact, history, report, line } of deadFacts(s)) {
          if (report.wentWeakAt === null) continue
          // Weak at the moment it was created (a wrong first answer at gap 0): a what-if at the creation time is
          // rejected (insight decision: "at-not-after-creation"), so there is no line. Found by a failing seed.
          if (report.wentWeakAt <= fact.createdAt) {
            expect(line).toBeNull()
            continue
          }
          const w = whatIf(studyDungeonPolicy, fact, history, { at: report.wentWeakAt, event: { kind: "review", correct: true } })
          expect(w.ok).toBe(true)
          if (!w.ok) continue
          expect(w.stoppedAt).toBeNull()
          expect(w.diesAt).not.toBeNull()
          expect(w.baselineDiesAt).not.toBeNull()
          const diesAt = w.diesAt!
          const base = w.baselineDiesAt!
          expect(Math.abs(base - report.diedAt)).toBeLessThanOrEqual(P)
          // Never earlier than the real death, beyond the engine's precision.
          expect(diesAt).toBeGreaterThan(report.diedAt - P)
          const reviewAfter = report.tends.some((t) => t.at > report.wentWeakAt!)
          if (!reviewAfter) {
            expect(diesAt - report.diedAt).toBeGreaterThan(DAY_MS)
            expect(line).not.toBeNull()
          }
          if (line !== null) {
            // A shown line is a later death, with N from this independent whatIf call.
            expect(diesAt).toBeGreaterThan(report.diedAt)
            const n = Number(N_OF.exec(line)?.[1])
            expect(n).toBe(Math.floor((diesAt - base + P) / DAY_MS))
            expect(n).toBeGreaterThanOrEqual(1)
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it("without a weak time in this life, no line", () => {
    fc.assert(
      fc.property(scenarios(), (s) => {
        for (const { report, line } of deadFacts(s)) {
          if (report.wentWeakAt === null) expect(line).toBeNull()
        }
      }),
      { numRuns: 100 }
    )
  })
})

describe("the generated dead facts reach every branch", () => {
  it("lines, a wrong answer after the weak time, and resurrected facts each occur often (fixed seed)", () => {
    const dead = fc.sample(scenarios(), { numRuns: 300, seed: 42 }).flatMap(deadFacts)
    let withLine = 0
    let wrongAfter = 0
    let resurrected = 0
    for (const { report, line } of dead) {
      if (line !== null) withLine++
      if (report.wentWeakAt !== null && report.tends.some((t) => t.at > report.wentWeakAt! && !t.event.correct)) wrongAfter++
      if (report.timesResurrected > 0 && report.wentWeakAt !== null) resurrected++
    }
    const share = (n: number) => n / dead.length
    const counts = JSON.stringify({ withLine, wrongAfter, resurrected, total: dead.length })
    expect(dead.length, counts).toBeGreaterThan(100)
    expect(share(withLine), counts).toBeGreaterThanOrEqual(0.3)
    expect(share(wrongAfter), counts).toBeGreaterThanOrEqual(0.05)
    expect(share(resurrected), counts).toBeGreaterThanOrEqual(0.05)
  })
})
