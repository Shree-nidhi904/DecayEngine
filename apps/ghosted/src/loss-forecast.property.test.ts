// Property 14: the loss line matches the engine's states (task P4, task 9.1;
// design section 12.6 and Correctness Properties; Req 35.2, 35.3, 35.4).
//
// One person built by the existing scenario generator (a real engine with
// ghostedPolicy, fixed times only), whose coverage check
// (generator-coverage.test.ts) already proves it reaches lit, flickering and
// boarded-up people. The counts are checked against what engine.view shows
// at realNow, at realNow + 7 days and one minute after that, so this test
// never repeats the policy's formula.

import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { LOSS_FORECAST_DAYS, lossForecast } from "./loss-forecast"
import { ghostedPolicy } from "./policy"
import { DAY_MS, MINUTE_MS, personAt, scenario } from "./test/generators"

const WEEK_MS = LOSS_FORECAST_DAYS * DAY_MS

describe("loss forecast", () => {
  // Feature: ghosted, Property 14: Loss line matches the engine's states
  it("counts a person exactly as the engine's states at realNow and realNow + 7 days say", () => {
    fc.assert(
      fc.property(scenario(), (s) => {
        const { person, now: r, engine } = personAt(s)
        const stateAt = (t: number) => engine.view(t).find((p) => p.id === person.id)!.state
        const loss = lossForecast(engine.view(r), engine.forecast(r, WEEK_MS), r)

        // Nobody lit or flickering: the line is hidden (Req 35.8).
        if (loss === null) {
          expect(person.state).toBe("dead")
          return
        }
        expect(person.state).not.toBe("dead")

        // Each person is counted at most once (Req 35.4).
        expect(loss.fade + loss.dark).toBeLessThanOrEqual(1)

        // Going dark exactly when not dark at r and dark at r + 7 days (Req 35.2).
        const darkInAWeek = stateAt(r + WEEK_MS) === "dead"
        expect(loss.dark === 1).toBe(darkInAWeek)

        // Starting to flicker: lit at r, not dark at r + 7 days, no longer lit a minute later (Req 35.3).
        if (loss.fade === 1) {
          expect(person.state).toBe("alive")
          expect(stateAt(r + WEEK_MS)).not.toBe("dead")
          expect(stateAt(r + WEEK_MS + MINUTE_MS)).not.toBe("alive")
        }

        // A lit person not counted is still lit at r + 7 days. The one exception is
        // open point 12.7.3 (proposed, accepted as the dock does): a person at
        // exactly 60 at r, whose nextDueAt is r itself, gets no day-0 marker.
        if (person.state === "alive" && loss.fade === 0 && loss.dark === 0) {
          if (ghostedPolicy.nextDueAt(person, r) !== r) {
            expect(stateAt(r + WEEK_MS)).toBe("alive")
          }
        }
      }),
      { numRuns: 100 }
    )
  })
})
