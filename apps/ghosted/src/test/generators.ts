// fast-check generators for the Ghosted policy tests (task 3.1, design
// section 7.1). Modelled on packages/engine/tests/generators.ts, which cannot
// be imported (the engine package exports only "." and those generators drive
// a fake policy).
//
// People are built by replaying real engine operations on a real DecayEngine
// with ghostedPolicy, never by generating item fields. Every time is T0 plus a
// whole number of minutes, and times never decrease. A step on a person who is
// dead at that moment is a reconnect (engine.resurrect); otherwise it is a
// contact (engine.tend). Fixed times only, never the real clock.
//
// Fractions are generated as whole thousandths, so no NaN or infinity can
// appear. generator-coverage.test.ts proves that lit, flickering and
// boarded-up people, every contact kind and reconnects all occur often.

import fc from "fast-check"
import type { GhostedEngine } from "../engine-instance"
import type { ContactEvent, Person, PersonPayload } from "../policy"
import { DAY_MS, MINUTE_MS, T0, makeEngine } from "./fixtures"

export { DAY_MS, MINUTE_MS, T0 }
export const HOUR_MS = 3_600_000

/** T: the span over which freshness falls from 100 to 0 (3 × rhythm days). */
export const spanMs = (rhythmDays: number) => 3 * rhythmDays * DAY_MS

/** Common rhythms plus any whole number of days from 1 to 365. */
export function rhythmDays(): fc.Arbitrary<number> {
  return fc.oneof(fc.constantFrom(1, 7, 14, 30, 90, 365), fc.integer({ min: 1, max: 365 }))
}

/** One of the three contact kinds. */
export function contactEvent(): fc.Arbitrary<ContactEvent> {
  return fc.constantFrom<ContactEvent>({ kind: "text" }, { kind: "call" }, { kind: "meetup" })
}

/** A person's add: payload, importance 1-3, minutes 1-600, and how old the last contact is at add time. */
export type AddSpec = {
  name: string
  relationship: string
  rhythmDays: number
  importance: 1 | 2 | 3
  costMinutes: number
  /** Age of the last contact at add time, as a fraction of T; −0.2..1.2. Below 0 means it is in the future. */
  ageFraction: number
}

/** A contact `afterFraction × T` (0..0.6, rounded to whole minutes) after the previous step or the add. */
export type Step = { afterFraction: number; event: ContactEvent }

/** An add, 0 to 6 steps, and a view time 0..1.2 × T after the last step. */
export type Scenario = { add: AddSpec; steps: Step[]; viewFraction: number }

/** Whole thousandths from min/1000 to max/1000. */
const thousandths = (min: number, max: number) => fc.integer({ min, max }).map((n) => n / 1000)

/** Fictional names only (steering ghosted.md section 4). */
const name = fc.constantFrom("Mira Castell", "Ola Brandt", "Teo Varga", "Ines Moreau")
const relationship = fc.constantFrom("", "College", "Family", "Work")

function addSpec(): fc.Arbitrary<AddSpec> {
  return fc.record({
    name,
    relationship,
    rhythmDays: rhythmDays(),
    importance: fc.constantFrom<1 | 2 | 3>(1, 2, 3),
    costMinutes: fc.integer({ min: 1, max: 600 }),
    ageFraction: thousandths(-200, 1200),
  })
}

function step(): fc.Arbitrary<Step> {
  return fc.record({ afterFraction: thousandths(0, 600), event: contactEvent() })
}

export function scenario(): fc.Arbitrary<Scenario> {
  return fc.record({
    add: addSpec(),
    steps: fc.array(step(), { minLength: 0, maxLength: 6 }),
    viewFraction: thousandths(0, 1200),
  })
}

/** `ms` rounded to a whole number of minutes. */
const wholeMinutes = (ms: number) => Math.round(ms / MINUTE_MS) * MINUTE_MS

/**
 * Every time buildScenario uses: the add (always T0), the last contact given
 * at the add, each step's time and the view time. All are T0 plus whole
 * minutes; addAt ≤ each step ≤ viewAt, in order.
 */
export function scenarioTimes(s: Scenario): {
  addAt: number
  lastContactAt: number
  stepTimes: number[]
  viewAt: number
} {
  const T = spanMs(s.add.rhythmDays)
  const addAt = T0
  const lastContactAt = T0 - wholeMinutes(s.add.ageFraction * T)
  let at = addAt
  const stepTimes = s.steps.map((st) => (at += wholeMinutes(st.afterFraction * T)))
  const viewAt = at + wholeMinutes(s.viewFraction * T)
  return { addAt, lastContactAt, stepTimes, viewAt }
}

/** The payload the scenario's add uses. */
export function scenarioPayload(s: Scenario): PersonPayload {
  return {
    name: s.add.name,
    relationship: s.add.relationship,
    rhythmDays: s.add.rhythmDays,
    lastContactAt: scenarioTimes(s).lastContactAt,
  }
}

/**
 * Replays a scenario on a fresh engine: addItem at T0, then for each step at
 * its time, engine.resurrect if the person is dead then (engine.view(t)),
 * otherwise engine.tend. Returns the engine, the id and `now` (the view time).
 */
export function buildScenario(s: Scenario): { engine: GhostedEngine; id: string; now: number } {
  const { addAt, stepTimes, viewAt } = scenarioTimes(s)
  const engine = makeEngine()
  const id = engine.addItem(
    { payload: scenarioPayload(s), importance: s.add.importance, costMinutes: s.add.costMinutes },
    addAt
  )
  s.steps.forEach((st, i) => {
    const at = stepTimes[i]!
    if (findPerson(engine, id, at).state === "dead") engine.resurrect(id, st.event, at)
    else engine.tend(id, st.event, at)
  })
  return { engine, id, now: viewAt }
}

function findPerson(engine: GhostedEngine, id: string, at: number): Person {
  const found = engine.view(at).find((p) => p.id === id)
  if (found === undefined) throw new Error(`generator setup: person ${id} is missing from view(${at})`)
  return found
}

/** The person as the engine shows it at `now`: engine.view(now) for the scenario's id. */
export function personAt(s: Scenario): { person: Person; now: number; engine: GhostedEngine } {
  const { engine, id, now } = buildScenario(s)
  return { person: findPerson(engine, id, now), now, engine }
}

/** A person who is lit or flickering at `now`. */
export function livingPerson(): fc.Arbitrary<{ person: Person; now: number; engine: GhostedEngine }> {
  return scenario()
    .map(personAt)
    .filter(({ person }) => person.state !== "dead")
}

/** A person who is boarded up at `now`. */
export function deadPerson(): fc.Arbitrary<{ person: Person; now: number; engine: GhostedEngine }> {
  return scenario()
    .map(personAt)
    .filter(({ person }) => person.state === "dead")
}

/**
 * Started dark: the last contact is more than 9T/10 before the add (more than
 * 2.7 × rhythm days), in whole days plus under 12 hours, so floor and round of
 * the gap in days agree (design open issue 3.3). `addAt` is T0 plus whole
 * minutes, up to a year later.
 */
export function startedDark(): fc.Arbitrary<{ rhythmDays: number; gapMs: number; addAt: number }> {
  return rhythmDays()
    .chain((r) => {
      // floor(2.7 × r) in integer arithmetic, so no rounding can land on exactly 9T/10
      const minGapDays = Math.floor((27 * r) / 10) + 1
      return fc.record({
        rhythmDays: fc.constant(r),
        gapDays: fc.integer({ min: minGapDays, max: minGapDays + 3 * r }),
        extraMs: fc.integer({ min: 0, max: 12 * HOUR_MS - 1 }),
        addMinutes: fc.integer({ min: 0, max: 365 * 24 * 60 }),
      })
    })
    .map(({ rhythmDays, gapDays, extraMs, addMinutes }) => ({
      rhythmDays,
      gapMs: gapDays * DAY_MS + extraMs,
      addAt: T0 + addMinutes * MINUTE_MS,
    }))
}
