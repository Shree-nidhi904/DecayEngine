// Properties 1 to 9 of the Ghosted policy (task 3.4, design section 7.3).
// One fc.assert per property, with the generator and numRuns of its row.
// People are built by replaying real engine operations (test/generators.ts);
// every time is T0 plus whole minutes, never the real clock.

import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { ghostedPolicy as policy, type Person } from "./policy"
import {
  DAY_MS,
  MINUTE_MS,
  T0,
  contactEvent,
  deadPerson,
  livingPerson,
  personAt,
  scenario,
  spanMs,
} from "./test/generators"

const YEAR_MS = 365 * DAY_MS

/** A scenario with T (from its rhythm) known before any engine is built. */
const withSpan = <A>(extra: (T: number) => fc.Arbitrary<A>) =>
  scenario().chain((s) => fc.tuple(fc.constant(s), extra(spanMs(s.add.rhythmDays))))

describe("ghostedPolicy properties", () => {
  // Feature: ghosted, Property 1: Health bounds
  it("Property 1: healthAt is finite and within 0-100 at any time, from ten years before to ten years after", () => {
    fc.assert(
      fc.property(scenario(), fc.integer({ min: -10 * 365, max: 10 * 365 }), (s, days) => {
        const { person, now } = personAt(s)
        const t = now + days * DAY_MS
        const h = policy.healthAt(person, t)
        expect(Number.isFinite(h)).toBe(true)
        expect(h).toBeGreaterThanOrEqual(0)
        expect(h).toBeLessThanOrEqual(100)
      }),
      { numRuns: 200 }
    )
  })

  // Feature: ghosted, Property 2: Purity
  it("Property 2: equal inputs give equal results, and the person is not changed", () => {
    fc.assert(
      fc.property(scenario(), contactEvent(), (s, event) => {
        const { person, now } = personAt(s)
        const before = structuredClone(person)
        const a = () => structuredClone(person)
        const e = () => structuredClone(event)

        expect(policy.healthAt(a(), now)).toEqual(policy.healthAt(a(), now))
        expect(policy.nextDueAt(a(), now)).toEqual(policy.nextDueAt(a(), now))
        expect(policy.applyEvent(a(), e(), now)).toEqual(policy.applyEvent(a(), e(), now))
        expect(policy.resurrect(a(), e(), now)).toEqual(policy.resurrect(a(), e(), now))

        // Called on the person itself, nothing it was given changes.
        policy.healthAt(person, now)
        policy.nextDueAt(person, now)
        policy.applyEvent(person, event, now)
        policy.resurrect(person, event, now)
        expect(person).toEqual(before)
      }),
      { numRuns: 100 }
    )
  })

  // Feature: ghosted, Property 3: Never brighter with time
  it("Property 3: with no contact between them, healthAt(t2) ≤ healthAt(t1) for now ≤ t1 ≤ t2", () => {
    const gaps = withSpan((T) => fc.tuple(fc.integer({ min: 0, max: 2 * T }), fc.integer({ min: 0, max: 2 * T })))
    fc.assert(
      fc.property(gaps, ([s, [first, second]]) => {
        const { person, now } = personAt(s)
        const t1 = now + first
        const t2 = t1 + second
        expect(policy.healthAt(person, t2)).toBeLessThanOrEqual(policy.healthAt(person, t1))
      }),
      { numRuns: 200 }
    )
  })

  // Feature: ghosted, Property 4: Future last contact
  it("Property 4: a last contact later than now gives exactly 100", () => {
    fc.assert(
      fc.property(scenario(), fc.integer({ min: 1, max: 10 * YEAR_MS }), (s, ahead) => {
        const { person, now } = personAt(s)
        const copy: Person = { ...person, policyData: { lastContactAt: now + ahead } }
        expect(policy.healthAt(copy, now)).toBe(100)
      }),
      { numRuns: 100 }
    )
  })

  // Feature: ghosted, Property 5: Settle-safe
  it("Property 5: changing lastEventAt or health never changes healthAt", () => {
    const tenYearsInMinutes = (10 * YEAR_MS) / MINUTE_MS
    fc.assert(
      fc.property(
        scenario(),
        fc.integer({ min: -tenYearsInMinutes, max: tenYearsInMinutes }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (s, minutes, health) => {
          const { person, now } = personAt(s)
          const changed: Person = { ...person, lastEventAt: T0 + minutes * MINUTE_MS, health }
          expect(Object.is(policy.healthAt(changed, now), policy.healthAt(person, now))).toBe(true)
        }
      ),
      { numRuns: 200 }
    )
  })

  // Feature: ghosted, Property 6: Text adds 40 up to 100
  it("Property 6: a text on a living person gives min(100, h + 40), in the policy and through the engine", () => {
    fc.assert(
      fc.property(livingPerson(), ({ person, now, engine }) => {
        const h = policy.healthAt(person, now)
        const result = policy.applyEvent(person, { kind: "text" }, now)
        expect(result.health).toBe(Math.min(100, h + 40))
        const updated: Person = { ...person, policyData: result.policyData }
        expect(Math.abs(policy.healthAt(updated, now) - result.health)).toBeLessThanOrEqual(1e-9)

        engine.tend(person.id, { kind: "text" }, now)
        const viewed = engine.view(now).find((p) => p.id === person.id)!
        expect(Math.abs(viewed.health - result.health)).toBeLessThanOrEqual(1e-9)
      }),
      { numRuns: 200 }
    )
  })

  // Feature: ghosted, Property 7: Call and meet-up light fully
  it("Property 7: a call or meet-up on a living person gives 100 and moves the last contact to now", () => {
    fc.assert(
      fc.property(livingPerson(), fc.constantFrom("call" as const, "meetup" as const), ({ person, now, engine }, kind) => {
        const result = policy.applyEvent(person, { kind }, now)
        expect(result.health).toBe(100)
        expect(result.policyData.lastContactAt).toBe(now)

        engine.tend(person.id, { kind }, now)
        expect(engine.view(now).find((p) => p.id === person.id)!.health).toBe(100)
      }),
      { numRuns: 100 }
    )
  })

  // Feature: ghosted, Property 8: Next due
  it("Property 8: alive is due at L + 2T/5 (health 60 then), weak is due now, dead is never due", () => {
    fc.assert(
      fc.property(scenario(), (s) => {
        const { person, now } = personAt(s)
        const L = person.policyData.lastContactAt
        const T = spanMs(person.payload.rhythmDays)
        const due = policy.nextDueAt(person, now)

        if (person.state === "alive") {
          expect(due).toBe(L + (2 * T) / 5)
          expect(Number.isInteger(due! - L)).toBe(true)
          expect(Math.abs(policy.healthAt(person, due!) - 60)).toBeLessThanOrEqual(1e-9)
          expect(policy.healthAt(person, due! + MINUTE_MS)).toBeLessThan(60)
        } else if (person.state === "weak") {
          expect(due).toBe(now)
        } else {
          expect(due).toBeNull()
          // Req 3.3: health below 10 gives null even when the state says alive.
          const raw: Person = { ...person, state: "alive" }
          expect(policy.healthAt(raw, now)).toBeLessThan(10)
          expect(policy.nextDueAt(raw, now)).toBeNull()
        }
      }),
      { numRuns: 300 }
    )
  })

  // Feature: ghosted, Property 9: Reconnect always works
  it("Property 9: any contact brings a dead person back, alive with health 100", () => {
    fc.assert(
      fc.property(deadPerson(), contactEvent(), ({ person, now, engine }, event) => {
        expect(policy.resurrect(person, event, now)).toEqual({ ok: true, policyData: { lastContactAt: now } })

        expect(engine.resurrect(person.id, event, now)).toEqual({ ok: true })

        const back = engine.view(now).find((p) => p.id === person.id)!
        expect(back.state).toBe("alive")
        expect(back.health).toBe(100)
        expect(policy.healthAt(back, now)).toBe(100)
        expect(back.timesResurrected).toBe(person.timesResurrected + 1)
      }),
      { numRuns: 100 }
    )
  })
})
