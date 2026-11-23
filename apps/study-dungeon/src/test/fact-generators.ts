// fast-check generators for Study Dungeon's app property test (task P5,
// task 23.2; design "What This Session Saves", Tests). Modelled on Ghosted's
// test/generators.ts.
//
// Facts are built by replaying real engine operations on a real DecayEngine
// with studyDungeonPolicy, never by generating item fields. 1 to 5 facts go
// into one engine, each added at T0 with a knowledge level, then 0 to 5
// reviews each at increasing whole-minute times (0 to 10 days apart, right or
// wrong). A step on a fact that is dead at that moment is a challenge
// (engine.resurrect); otherwise it is a review (engine.tend). `now` is 0 to
// 20 days after the latest step of any fact. Fixed times only, never the real
// clock.
//
// Bias, so the property test's branches all occur often (its coverage
// check): half of the gaps, and half of the `now` offsets, are under a day,
// so a fact is often looked at soon after its last answer; and "new" is drawn
// twice as often as "shaky" or "solid", so half-lives of 1 day (a new fact
// answered wrong) are common. Every value still stays inside the ranges
// above. fact-generators.coverage.test.ts proves alive, weak and dead facts
// each make up at least 10% of generated facts.

import fc from "fast-check"
import { DecayEngine, InMemoryAdapter } from "@decay-engine/engine"
import {
  DAY_MS,
  studyDungeonPolicy,
  type Fact,
  type FactPayload,
  type FactPolicyData,
  type Knowledge,
  type ReviewEvent,
} from "../policy"
import { T0 } from "./fixtures"

export { DAY_MS, T0 }
export const MINUTE_MS = 60_000

type Engine = DecayEngine<FactPayload, FactPolicyData, ReviewEvent>

/** One review of a fact: `gapMinutes` after its previous step (or its add). */
export type FactStep = { gapMinutes: number; correct: boolean }

/** One fact: how it is added and what happens to it afterwards. */
export type FactSpec = {
  knowledge: Knowledge
  importance: 1 | 2 | 3
  costMinutes: 1 | 2 | 3 | 5
  steps: FactStep[]
}

/** 1 to 5 facts and the gap from the latest step of any fact to `now`. */
export type FactsScenario = { facts: FactSpec[]; nowGapMinutes: number }

const DAY_MINUTES = DAY_MS / MINUTE_MS

/** Whole minutes from 0 to maxDays days, half of the time under a day. */
function minutesUpTo(maxDays: number): fc.Arbitrary<number> {
  return fc.oneof(
    fc.integer({ min: 0, max: DAY_MINUTES - 1 }),
    fc.integer({ min: 0, max: maxDays * DAY_MINUTES })
  )
}

function factStep(): fc.Arbitrary<FactStep> {
  return fc.record({ gapMinutes: minutesUpTo(10), correct: fc.boolean() })
}

function factSpec(): fc.Arbitrary<FactSpec> {
  return fc.record({
    knowledge: fc.constantFrom<Knowledge>("new", "new", "shaky", "solid"),
    importance: fc.constantFrom<1 | 2 | 3>(1, 2, 3),
    costMinutes: fc.constantFrom<1 | 2 | 3 | 5>(1, 2, 3, 5),
    steps: fc.array(factStep(), { minLength: 0, maxLength: 5 }),
  })
}

export function factsScenario(): fc.Arbitrary<FactsScenario> {
  return fc.record({
    facts: fc.array(factSpec(), { minLength: 1, maxLength: 5 }),
    nowGapMinutes: minutesUpTo(20),
  })
}

/** Each fact's step times (T0 plus whole minutes, increasing), and `now`. */
export function scenarioTimes(s: FactsScenario): { stepTimes: number[][]; now: number } {
  let latest = T0
  const stepTimes = s.facts.map((f) => {
    let at = T0
    return f.steps.map((st) => {
      at += st.gapMinutes * MINUTE_MS
      latest = Math.max(latest, at)
      return at
    })
  })
  return { stepTimes, now: latest + s.nowGapMinutes * MINUTE_MS }
}

/**
 * Replays a scenario on a fresh engine: each fact is added at T0 (ids f0,
 * f1, …), then for each of its steps, engine.resurrect if it is dead then
 * (engine.view(t)), otherwise engine.tend. Returns the engine, the ids and `now`.
 */
export function buildFacts(s: FactsScenario): { engine: Engine; ids: string[]; now: number } {
  let n = 0
  const engine: Engine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(
    studyDungeonPolicy,
    new InMemoryAdapter(),
    () => `f${n++}`
  )
  const { stepTimes, now } = scenarioTimes(s)
  const ids = s.facts.map((f, i) =>
    engine.addItem(
      {
        payload: { question: `Question ${i}`, answer: `Answer ${i}`, why: "", knowledge: f.knowledge },
        importance: f.importance,
        costMinutes: f.costMinutes,
      },
      T0
    )
  )
  s.facts.forEach((f, i) => {
    const id = ids[i]!
    f.steps.forEach((st, j) => {
      const at = stepTimes[i]![j]!
      const event: ReviewEvent = { kind: "review", correct: st.correct }
      if (factAt(engine, id, at).state === "dead") engine.resurrect(id, event, at)
      else engine.tend(id, event, at)
    })
  })
  return { engine, ids, now }
}

/** The fact as engine.view(at) shows it; throws if it is missing (a test bug). */
export function factAt(engine: Engine, id: string, at: number): Fact {
  const found = engine.view(at).find((f) => f.id === id)
  if (found === undefined) throw new Error(`generator setup: fact ${id} is missing from view(${at})`)
  return found
}
