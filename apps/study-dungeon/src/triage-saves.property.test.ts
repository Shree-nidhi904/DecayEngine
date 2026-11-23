// The Triage saves line never over-claims (task P5, task 23.2; design "What
// This Session Saves", Property; Requirement 21.2, 21.3, 21.4, 21.13).
//
// Facts come from test/fact-generators.ts (a real engine with
// studyDungeonPolicy, fixed times only), whose own coverage check
// (fact-generators.coverage.test.ts) proves it reaches alive, weak and dead
// facts.
//
// The claim is checked through the real engine, never through the policy's
// formula: a counted pick is dead at now + 7 days if left alone, and after
// engine.tend with a right answer at `now` it is not dead at now + 7 days
// (so, as health never rises between events, at no time in the window).
// Every at-risk pick left out is still dead then, even after a right answer.

import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { LOSS_FORECAST_DAYS } from "./loss-forecast"
import { SAVE_EVENT, savedPicks } from "./triage-saves"
import { DAY_MS, buildFacts, factAt, factsScenario, type FactsScenario } from "./test/fact-generators"

const WEEK_MS = LOSS_FORECAST_DAYS * DAY_MS

/** Facts, `now` and a budget. */
const run = fc.record({
  scenario: factsScenario(),
  budget: fc.integer({ min: 1, max: 1440 }),
})

/** Builds the facts, runs triage at `now`, and returns what the line counts and which picks are at risk. */
function triageOf(s: FactsScenario, budget: number) {
  const { engine, now } = buildFacts(s)
  const end = now + WEEK_MS
  const { picks } = engine.triage(budget, now)
  const counted = savedPicks(picks, now)
  const atRisk = picks.filter((p) => p.diesAt !== null && p.diesAt <= end).map((p) => p.item.id)
  return { engine, now, end, picks, counted, atRisk }
}

function check(s: FactsScenario, budget: number): void {
  const { engine, now, end, picks, counted, atRisk } = triageOf(s, budget)
  const pickIds = picks.map((p) => p.item.id)

  // Never more than the picks, and only picks (Req 21.2, 21.3).
  expect(counted.length).toBeLessThanOrEqual(picks.length)
  expect(new Set(counted).size).toBe(counted.length)
  for (const id of counted) expect(pickIds).toContain(id)
  // Every pick is weak at now: Crypt and Graveyard facts are never candidates.
  for (const p of picks) expect(p.item.state).toBe("weak")

  // Before any write: left alone, every counted pick really is dead at now + 7 days.
  for (const id of counted) {
    expect(atRisk).toContain(id)
    expect(factAt(engine, id, end).state, `counted ${id}, left alone`).toBe("dead")
  }

  // A right answer, through the real engine, at now, for every counted pick.
  for (const id of counted) engine.tend(id, SAVE_EVENT, now)
  const diesWithinTheWeek = new Set(engine.forecast(now, WEEK_MS).map((f) => f.item.id))
  for (const id of counted) {
    expect(factAt(engine, id, end).state, `counted ${id}, after a right answer`).not.toBe("dead")
    expect(diesWithinTheWeek.has(id), `counted ${id} is in the 7-day forecast`).toBe(false)
  }

  // Every at-risk pick left out is dead at now + 7 days even after a right
  // answer (Req 21.4), checked on the scenario built again.
  const leftOut = atRisk.filter((id) => !counted.includes(id))
  if (leftOut.length > 0) {
    const again = buildFacts(s)
    for (const id of leftOut) again.engine.tend(id, SAVE_EVENT, now)
    for (const id of leftOut) {
      expect(factAt(again.engine, id, end).state, `left out ${id}, after a right answer`).toBe("dead")
    }
  }
}

describe("the Triage saves line", () => {
  // Feature: study-dungeon, Requirement 21.13: the saves line never over-claims
  it("every counted pick stays alive for the next 7 days after a right answer; every at-risk pick left out does not", () => {
    fc.assert(
      fc.property(run, ({ scenario, budget }) => {
        check(scenario, budget)
      }),
      { numRuns: 100 }
    )
  })

  it("coverage at a fixed seed: counted, at risk but not saved, and not at risk each make up at least 5% of picks", () => {
    const tally = { counted: 0, leftOut: 0, notAtRisk: 0, picks: 0 }
    for (const { scenario, budget } of fc.sample(run, { numRuns: 200, seed: 21 })) {
      const { picks, counted, atRisk } = triageOf(scenario, budget)
      for (const p of picks) {
        tally.picks++
        const id = p.item.id
        if (counted.includes(id)) tally.counted++
        else if (atRisk.includes(id)) tally.leftOut++
        else tally.notAtRisk++
      }
    }
    expect(tally.picks).toBeGreaterThanOrEqual(40)
    expect(tally.counted / tally.picks, JSON.stringify(tally)).toBeGreaterThanOrEqual(0.05)
    expect(tally.leftOut / tally.picks, JSON.stringify(tally)).toBeGreaterThanOrEqual(0.05)
    expect(tally.notAtRisk / tally.picks, JSON.stringify(tally)).toBeGreaterThanOrEqual(0.05)
  })
})
