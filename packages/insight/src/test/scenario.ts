// Scenario generator: drives a real DecayEngine with a generated list of
// steps, so the property tests get real histories (design section 7.2).
//
// The generator reads view(t) to choose between tend and resurrect, so it
// never needs to catch an engine error.

import fc from "fast-check"
import { DecayEngine, InMemoryAdapter } from "@decay-engine/engine"
import type { DecayPolicy, HistoryEntry, Item } from "@decay-engine/engine"
import { DAY, ITEM_ID, T0 } from "./fixtures"
import { expPolicy, linearPolicy } from "./policies"
import type { CountData, TestEvent, TestPayload } from "./policies"

export type PolicyName = "exp" | "linear"
export type Op = "good" | "bad" | "tick" | "view" | "edit"
export type Step = { gapMs: number; op: Op }
export type Scenario = {
  policy: PolicyName
  importance: number
  costMinutes: number
  steps: Step[]
  tailMs: number
}

export type TestPolicy = DecayPolicy<TestPayload, CountData, TestEvent>

export const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  policy: fc.constantFrom<PolicyName>("exp", "linear"),
  importance: fc.integer({ min: 1, max: 3 }),
  costMinutes: fc.integer({ min: 1, max: 600 }),
  steps: fc.array(
    fc.record({
      gapMs: fc.integer({ min: 1, max: 6 * DAY }),
      op: fc.constantFrom<Op>("good", "bad", "tick", "view", "edit"),
    }),
    { maxLength: 25 }
  ),
  tailMs: fc.integer({ min: 0, max: 20 * DAY }),
})

export function policyOf(name: PolicyName): TestPolicy {
  return name === "exp" ? expPolicy : linearPolicy
}

export type ScenarioRun = {
  policy: TestPolicy
  engine: DecayEngine<TestPayload, CountData, TestEvent>
  /** The item as the original engine shows it at `end`. */
  item: Item<TestPayload, CountData>
  history: HistoryEntry[]
  end: number
  /** How many tick steps changed the item's health (re-based the stored item). */
  tickChanges: number
}

export function runScenario(s: Scenario): ScenarioRun {
  const policy = policyOf(s.policy)
  const engine = new DecayEngine(policy, new InMemoryAdapter(), () => ITEM_ID)
  engine.addItem({ payload: { label: "scenario" }, importance: s.importance, costMinutes: s.costMinutes }, T0)

  let t = T0
  let importance = s.importance
  let costMinutes = s.costMinutes
  let tickChanges = 0
  for (const step of s.steps) {
    t += step.gapMs
    switch (step.op) {
      case "good":
      case "bad": {
        const current = engine.view(t)[0]!
        if (current.state === "dead") engine.resurrect(ITEM_ID, step.op, t)
        else engine.tend(ITEM_ID, step.op, t)
        break
      }
      case "tick":
        tickChanges += engine.tick(t)
        break
      case "view":
        engine.view(t)
        break
      case "edit":
        importance = (importance % 3) + 1
        costMinutes = (costMinutes % 600) + 1
        engine.edit(ITEM_ID, { importance, costMinutes }, t)
        break
    }
  }

  const end = t + s.tailMs
  engine.tick(end)
  return {
    policy,
    engine,
    item: engine.view(end)[0]!,
    history: engine.history(ITEM_ID),
    end,
    tickChanges,
  }
}

/** One life of an item, read from a history (a replay's history in the tests). */
export type Life = {
  /** Creation or resurrection time. */
  start: number
  /** Tend times in this life, oldest first. */
  tends: number[]
  /** The life's died entry, or the replay's diesAt for a last life that has not died yet; null if none. */
  death: number | null
  /** The next resurrection's time, or null for the last life. */
  nextStart: number | null
}

export function livesOf(history: readonly HistoryEntry[], lastLifeDiesAt: number | null): Life[] {
  const lives: Life[] = []
  let current: Life | null = null
  for (const entry of history) {
    if (entry.type === "created" || entry.type === "resurrected") {
      if (current !== null) {
        current.nextStart = entry.timestamp
        lives.push(current)
      }
      current = { start: entry.timestamp, tends: [], death: null, nextStart: null }
    } else if (entry.type === "tended" && current !== null) {
      current.tends.push(entry.timestamp)
    } else if (entry.type === "died" && current !== null) {
      current.death = entry.timestamp
    }
  }
  if (current !== null) {
    if (current.death === null) current.death = lastLifeDiesAt
    lives.push(current)
  }
  return lives
}

/** Picks an integer in [lo, hi] from a fraction u in [0, 1_000_000]. */
export function pick(lo: number, hi: number, u: number): number {
  return lo + Math.floor(((hi - lo) * u) / 1_000_000)
}
