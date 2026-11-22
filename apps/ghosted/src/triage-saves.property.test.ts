// Property 15: the saves line never over-claims (task P5, task 10.3; design
// section 13.8 and Correctness Properties; Req 36.2, 36.3, 36.4, 36.13).
//
// People come from the existing scenario generator (a real engine with
// ghostedPolicy per person, fixed times only), whose own coverage check
// (generator-coverage.test.ts) proves it reaches lit, flickering and
// boarded-up people. Half of the scenarios get a rhythm of 1, 2 or 3 days, so
// that picks a call cannot keep lit (rhythm 1 or 2) occur often.
//
// The claim is checked through the real engine, never through the policy's
// formula: a counted pick is dark at now + 7 days if left alone, and after
// engine.tend with a call (and, in a separate build, a meet-up) it is not
// dark at now + 7 days. Every at-risk pick left out is still dark then.

import fc from "fast-check"
import { describe, expect, it } from "vitest"
import type { GhostedEngine } from "./engine-instance"
import { LOSS_FORECAST_DAYS } from "./loss-forecast"
import type { ContactEvent } from "./policy"
import { savedPicks } from "./triage-saves"
import { DAY_MS, personAt, scenario, type Scenario } from "./test/generators"

const WEEK_MS = LOSS_FORECAST_DAYS * DAY_MS

/** A scenario, half the time with its rhythm replaced by 1, 2 or 3 days. */
const mixedScenario: fc.Arbitrary<Scenario> = fc
  .tuple(scenario(), fc.constantFrom(1, 2, 3), fc.boolean())
  .map(([s, rhythmDays, short]) => (short ? { ...s, add: { ...s.add, rhythmDays } } : s))

/** 1 to 4 people, each on its own engine, and a budget. */
const run = fc.record({
  scenarios: fc.array(mixedScenario, { minLength: 1, maxLength: 4 }),
  budget: fc.integer({ min: 1, max: 1440 }),
})

const stateAt = (engine: GhostedEngine, id: string, t: number) => engine.view(t).find((p) => p.id === id)!.state

/** Builds the scenario, runs triage, and returns what the line counts and which picks are at risk. */
function triageOf(s: Scenario, budget: number) {
  const { engine, now } = personAt(s)
  const end = now + WEEK_MS
  const { picks } = engine.triage(budget, now)
  const counted = savedPicks(picks, now)
  const atRisk = picks.filter((p) => p.diesAt !== null && p.diesAt <= end).map((p) => p.item.id)
  return { engine, now, end, picks, counted, atRisk }
}

/** The checks of Property 15 for one person and one contact kind. */
function checkWith(s: Scenario, budget: number, event: ContactEvent): void {
  const { engine, now, end, picks, counted, atRisk } = triageOf(s, budget)
  const pickIds = picks.map((p) => p.item.id)

  // Never more than the picks, and only picks (Req 36.2, 36.3).
  expect(counted.length).toBeLessThanOrEqual(picks.length)
  for (const id of counted) expect(pickIds).toContain(id)
  // Every pick is flickering at now: lit and dark people are never candidates.
  for (const p of picks) expect(p.item.state).toBe("weak")

  // Left alone, every counted pick really is dark at now + 7 days.
  for (const id of counted) {
    expect(atRisk).toContain(id)
    expect(stateAt(engine, id, end)).toBe("dead")
  }

  // The contact, through the real engine, at now, for every at-risk pick.
  for (const id of atRisk) engine.tend(id, event, now)

  const darkWithinTheWeek = new Set(engine.forecast(now, WEEK_MS).map((f) => f.item.id))
  for (const id of atRisk) {
    if (counted.includes(id)) {
      // Counted: not dark at now + 7 days, so (health never rises between events) not dark at any time in the window.
      expect(stateAt(engine, id, end), `${event.kind}: counted ${id}`).not.toBe("dead")
      expect(darkWithinTheWeek.has(id)).toBe(false)
    } else {
      // Left out: even after the contact the window goes dark within the 7 days (Req 36.4).
      expect(stateAt(engine, id, end), `${event.kind}: left out ${id}`).toBe("dead")
    }
  }
}

describe("the Triage saves line", () => {
  // Feature: ghosted, Property 15: The saves line never over-claims
  it("every counted pick stays lit for the next 7 days after a call; every at-risk pick left out does not", () => {
    fc.assert(
      fc.property(run, ({ scenarios, budget }) => {
        for (const s of scenarios) checkWith(s, budget, { kind: "call" })
      }),
      { numRuns: 100 }
    )
  })

  // Feature: ghosted, Property 15 (meet-up): the line says "a call or meet-up"
  it("the same holds after a meet-up, on the same people built again", () => {
    fc.assert(
      fc.property(run, ({ scenarios, budget }) => {
        for (const s of scenarios) checkWith(s, budget, { kind: "meetup" })
      }),
      { numRuns: 100 }
    )
  })

  it("coverage at a fixed seed: counted, at risk but left out, and not at risk each make up at least 5% of picks", () => {
    const tally = { counted: 0, leftOut: 0, notAtRisk: 0, picks: 0 }
    for (const { scenarios, budget } of fc.sample(run, { numRuns: 200, seed: 15 })) {
      for (const s of scenarios) {
        const { picks, counted, atRisk } = triageOf(s, budget)
        for (const p of picks) {
          tally.picks++
          const id = p.item.id
          if (counted.includes(id)) tally.counted++
          else if (atRisk.includes(id)) tally.leftOut++
          else tally.notAtRisk++
        }
      }
    }
    expect(tally.picks).toBeGreaterThanOrEqual(40)
    expect(tally.counted / tally.picks, JSON.stringify(tally)).toBeGreaterThanOrEqual(0.05)
    expect(tally.leftOut / tally.picks, JSON.stringify(tally)).toBeGreaterThanOrEqual(0.05)
    expect(tally.notAtRisk / tally.picks, JSON.stringify(tally)).toBeGreaterThanOrEqual(0.05)
  })
})
