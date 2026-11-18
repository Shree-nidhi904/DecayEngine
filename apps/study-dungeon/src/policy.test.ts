// Tests for the Study Dungeon policy (tasks 2.2 and 2.3).
// Expected numbers are worked out from the rules in the spec, not copied from
// the policy's output. Real DecayEngine on InMemoryAdapter, fixed timestamps,
// never the real clock.
//
// Rules the numbers come from (requirements.md 1-4):
//   health(t) = stored health × 0.5^(elapsed / half-life)
//   right answer: health 100, half-life × 2 (max 180)
//   wrong answer: health 45,  half-life ÷ 2 (min 1)
//   weak below 60, dead below 10
//   first half-life: new 2, shaky 5, solid 10

import { describe, expect, it } from "vitest"
import { DecayEngine, InMemoryAdapter, checkPolicy } from "@decay-engine/engine"
import {
  studyDungeonPolicy as policy,
  type Fact,
  type FactPayload,
  type FactPolicyData,
  type Knowledge,
  type ReviewEvent,
} from "./policy"

const T0 = Date.UTC(2026, 9, 1) // 1 Oct 2026, fixed
const DAY = 86_400_000
const MINUTE = 60_000

const RIGHT: ReviewEvent = { kind: "review", correct: true }
const WRONG: ReviewEvent = { kind: "review", correct: false }
const WRONG_REASON = "You got it wrong. The fact stays dead."

function payload(knowledge: Knowledge): FactPayload {
  return { question: "Capital of Peru?", answer: "Lima", why: "Trip planned", knowledge }
}

function makeEngine() {
  let n = 0
  return new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(
    policy,
    new InMemoryAdapter(),
    () => `fact-${++n}`
  )
}
type Engine = ReturnType<typeof makeEngine>

// engine.addItem returns the new id, not the item.
function addFact(engine: Engine, knowledge: Knowledge, at = T0, importance = 2, costMinutes = 2): string {
  return engine.addItem({ payload: payload(knowledge), importance, costMinutes }, at)
}

function itemAt(engine: Engine, id: string, now: number): Fact {
  const found = engine.view(now).find((i) => i.id === id)
  if (found === undefined) throw new Error(`test setup: item ${id} is missing from view(${now})`)
  return found
}

// A stored item for calling the policy directly.
function makeItem(over: Partial<Fact> = {}): Fact {
  return {
    id: "item-1",
    payload: payload("solid"),
    policyData: { halfLifeDays: 10 },
    health: 100,
    state: "alive",
    createdAt: T0,
    lastEventAt: T0,
    timesResurrected: 0,
    importance: 2,
    costMinutes: 2,
    ...over,
  }
}

describe("studyDungeonPolicy: contract (task 2.2)", () => {
  it("passes checkPolicy with all three knowledge levels and both review events", () => {
    const result = checkPolicy(
      policy,
      [payload("new"), payload("shaky"), payload("solid")],
      [RIGHT, WRONG],
      T0
    )
    expect(result).toEqual({ passed: true, failures: [] })
  })

  it("has thresholds weak 60 and dead 10", () => {
    expect(policy.thresholds).toEqual({ weak: 60, dead: 10 })
  })
})

describe("studyDungeonPolicy.init", () => {
  it.each([
    ["new", 2],
    ["shaky", 5],
    ["solid", 10],
  ] as const)("knowledge %s starts with a half-life of %d days", (knowledge, days) => {
    expect(policy.init(payload(knowledge), T0)).toEqual({ halfLifeDays: days })
  })

  it("gives the same answer for the same input (pure)", () => {
    expect(policy.init(payload("shaky"), T0)).toEqual(policy.init(payload("shaky"), T0 + 99 * DAY))
  })
})

describe("studyDungeonPolicy.healthAt", () => {
  // Health 100, half-life 10 days. health = 100 × 0.5^(day / 10).
  // 0.5^0.5 = 0.70711; 0.5^0.7 = 0.61557; 0.5^0.8 = 0.57435;
  // 0.5^3.3 = 0.125 × 0.5^0.3 = 0.125 × 0.81225 = 0.10153; 0.5^3.4 = 0.125 × 0.75786 = 0.09473
  it.each([
    [0, 100],
    [5, 70.7107],
    [10, 50],
    [20, 25],
    [7, 61.557],
    [8, 57.435],
    [33, 10.153],
    [34, 9.473],
  ])("half-life 10: on day %d health is about %d", (day, expected) => {
    const item = makeItem()
    expect(policy.healthAt(item, T0 + day * DAY)).toBeCloseTo(expected, 2)
  })

  it("decays from the stored health, not from 100 (health 45, half-life 5)", () => {
    // 45 → 22.5 after one half-life (5 days) → 11.25 after two.
    const item = makeItem({ health: 45, policyData: { halfLifeDays: 5 } })
    expect(policy.healthAt(item, T0)).toBeCloseTo(45, 10)
    expect(policy.healthAt(item, T0 + 5 * DAY)).toBeCloseTo(22.5, 10)
    expect(policy.healthAt(item, T0 + 10 * DAY)).toBeCloseTo(11.25, 10)
  })

  it("measures from lastEventAt, not from createdAt", () => {
    // Created on T0, last event 10 days later: one half-life later is 50.
    const item = makeItem({ createdAt: T0, lastEventAt: T0 + 10 * DAY })
    expect(policy.healthAt(item, T0 + 20 * DAY)).toBeCloseTo(50, 10)
  })

  it.each([
    [100, 1],
    [100, 10],
    [100, 180],
    [45, 1],
    [45, 5],
  ])("never rises with time (stored health %d, half-life %d)", (health, halfLifeDays) => {
    const item = makeItem({ health, policyData: { halfLifeDays } })
    const times = [0, 1, 1_000, MINUTE, 3_600_000, DAY, 7 * DAY, 34 * DAY, 400 * DAY, 3650 * DAY]
    let previous = Infinity
    for (const offset of times) {
      const value = policy.healthAt(item, T0 + offset)
      expect(value).toBeLessThanOrEqual(previous)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(health)
      previous = value
    }
    // And it really does fall: after 3650 days nothing is left of a ≤180-day half-life.
    expect(previous).toBeLessThan(health)
  })

  it("does not rise above the stored health when asked about a time before lastEventAt", () => {
    const item = makeItem({ health: 45 })
    expect(policy.healthAt(item, T0 - DAY)).toBe(45)
  })

  it("is pure: same input, same output, and the item is not changed", () => {
    const item = makeItem({ health: 80, policyData: { halfLifeDays: 3 } })
    const before = structuredClone(item)
    const first = policy.healthAt(item, T0 + 2 * DAY)
    const second = policy.healthAt(item, T0 + 2 * DAY)
    expect(second).toBe(first)
    expect(item).toEqual(before)
  })
})

describe("studyDungeonPolicy.applyEvent", () => {
  it.each([
    // [half-life before, half-life after]
    [2, 4],
    [5, 10],
    [10, 20],
    [90, 180], // exactly at the cap
    [100, 180], // 200 would pass the cap: clamped to 180
    [180, 180], // already at the cap
  ])("a right answer on half-life %d gives health 100 and half-life %d", (before, after) => {
    const item = makeItem({ health: 62, policyData: { halfLifeDays: before } })
    expect(policy.applyEvent(item, RIGHT, T0 + DAY)).toEqual({
      health: 100,
      policyData: { halfLifeDays: after },
    })
  })

  it.each([
    [180, 90],
    [10, 5],
    [5, 2.5],
    [2, 1], // exactly at the floor
    [1, 1], // 0.5 would pass the floor: clamped to 1
    [1.5, 1], // 0.75 would pass the floor: clamped to 1
  ])("a wrong answer on half-life %d gives health 45 and half-life %d", (before, after) => {
    const item = makeItem({ health: 80, policyData: { halfLifeDays: before } })
    expect(policy.applyEvent(item, WRONG, T0 + DAY)).toEqual({
      health: 45,
      policyData: { halfLifeDays: after },
    })
  })

  it("sets health to 100 or 45 whatever the health was before", () => {
    const weak = makeItem({ health: 30, state: "weak" })
    expect(policy.applyEvent(weak, RIGHT, T0).health).toBe(100)
    const strong = makeItem({ health: 99 })
    expect(policy.applyEvent(strong, WRONG, T0).health).toBe(45)
  })

  it("does not change the item it is given", () => {
    const item = makeItem()
    const before = structuredClone(item)
    policy.applyEvent(item, RIGHT, T0)
    policy.applyEvent(item, WRONG, T0)
    expect(item).toEqual(before)
  })

  it("through the engine: doubling stops at 180 (10 → 20 → 40 → 80 → 160 → 180 → 180)", () => {
    const engine = makeEngine()
    const id = addFact(engine, "solid")
    const expected = [20, 40, 80, 160, 180, 180]
    expected.forEach((halfLife, i) => {
      const at = T0 + (i + 1) * DAY
      engine.tend(id, RIGHT, at)
      const item = itemAt(engine, id, at)
      expect(item.policyData).toEqual({ halfLifeDays: halfLife })
      expect(item.health).toBe(100)
    })
  })

  it("through the engine: halving stops at 1 (2 → 1 → 1 → 1)", () => {
    const engine = makeEngine()
    const id = addFact(engine, "new")
    // Day 1: 100 × 0.5^(1/2) = 70.7 alive. Later gaps of 1 day from 45 (half-life 1) give 22.5: weak, still tendable.
    for (let day = 1; day <= 3; day++) {
      const at = T0 + day * DAY
      engine.tend(id, WRONG, at)
      const item = itemAt(engine, id, at)
      expect(item.policyData).toEqual({ halfLifeDays: 1 })
      expect(item.health).toBe(45)
    }
  })

  it("through the engine: decay continues from 45 after a wrong answer", () => {
    const engine = makeEngine()
    const id = addFact(engine, "solid")
    const wrongAt = T0 + 5 * DAY // health 70.7 alive; wrong → health 45, half-life 5
    engine.tend(id, WRONG, wrongAt)

    expect(itemAt(engine, id, wrongAt).health).toBe(45)
    expect(itemAt(engine, id, wrongAt).state).toBe("weak")
    // One half-life (5 days) later: 45 × 0.5 = 22.5, not 100 × 0.5 = 50.
    const later = itemAt(engine, id, wrongAt + 5 * DAY)
    expect(later.health).toBeCloseTo(22.5, 10)
    expect(later.state).toBe("weak")
    // 10 days later: 45 × 0.25 = 11.25, still weak (≥ 10).
    expect(itemAt(engine, id, wrongAt + 10 * DAY).health).toBeCloseTo(11.25, 10)
    expect(itemAt(engine, id, wrongAt + 10 * DAY).state).toBe("weak")
    // 11 days later: 45 × 0.5^2.2 = 45 × 0.21764 = 9.79, below 10: dead.
    expect(itemAt(engine, id, wrongAt + 11 * DAY).state).toBe("dead")
  })
})

describe("studyDungeonPolicy.nextDueAt", () => {
  it("alive: returns the future time health reaches 60 (health 100, half-life 10)", () => {
    // 10 days × log2(100 / 60) = 10 × 0.736966 = 7.36966 days after T0
    const item = makeItem()
    const due = policy.nextDueAt(item, T0)
    if (due === null) throw new Error("expected a time, got null")
    expect(due).toBeGreaterThan(T0)
    expect(Math.abs(due - (T0 + 7.369656 * DAY))).toBeLessThan(MINUTE)
    // Cross-check against healthAt: at that time health is 60.
    expect(policy.healthAt(item, due)).toBeCloseTo(60, 6)
  })

  it("alive: uses the half-life and health of the item (health 80, half-life 5)", () => {
    // 5 days × log2(80 / 60) = 5 × 0.415037 = 2.0751875 days after lastEventAt
    const item = makeItem({ health: 80, policyData: { halfLifeDays: 5 }, lastEventAt: T0 + 3 * DAY })
    const due = policy.nextDueAt(item, T0 + 3 * DAY)
    if (due === null) throw new Error("expected a time, got null")
    expect(Math.abs(due - (T0 + 3 * DAY + 2.0751875 * DAY))).toBeLessThan(MINUTE)
  })

  it("alive: the answer does not depend on how late `now` is, while health is still at least 60", () => {
    const item = makeItem()
    expect(policy.nextDueAt(item, T0 + 3 * DAY)).toBe(policy.nextDueAt(item, T0))
  })

  it("weak: returns now (health 57.4 on day 8)", () => {
    const item = makeItem({ state: "weak" })
    const now = T0 + 8 * DAY
    expect(policy.nextDueAt(item, now)).toBe(now)
  })

  it("weak: returns now for a fact stored at 45 after a wrong answer", () => {
    const item = makeItem({ health: 45, state: "weak", policyData: { halfLifeDays: 5 } })
    expect(policy.nextDueAt(item, T0)).toBe(T0)
  })

  it("dead: returns null", () => {
    const item = makeItem({ state: "dead", health: 0, diedAt: T0 + 34 * DAY })
    expect(policy.nextDueAt(item, T0 + 40 * DAY)).toBeNull()
  })

  it("through the engine: due() lists the fact once 60 is passed (day 7.37), and not a dead one", () => {
    const engine = makeEngine()
    const id = addFact(engine, "solid")
    expect(engine.due(T0 + 7 * DAY)).toEqual([]) // day 7: health 61.6, due on day 7.37
    expect(engine.due(T0 + 7.4 * DAY).map((i) => i.id)).toEqual([id]) // health 59.9
    expect(engine.due(T0 + 34 * DAY)).toEqual([]) // dead: never due
  })
})

describe("studyDungeonPolicy.resurrect", () => {
  const dead = makeItem({ state: "dead", health: 0, diedAt: T0 + 34 * DAY })

  it("a right answer returns { ok: true }", () => {
    expect(policy.resurrect(dead, RIGHT, T0 + 40 * DAY)).toEqual({ ok: true })
  })

  it("a wrong answer returns the reason and nothing else", () => {
    expect(policy.resurrect(dead, WRONG, T0 + 40 * DAY)).toEqual({ ok: false, reason: WRONG_REASON })
  })

  it("through the engine: comes back with the half-life it had at death after doubling (20)", () => {
    const engine = makeEngine()
    const id = addFact(engine, "solid")
    engine.tend(id, RIGHT, T0 + 5 * DAY) // half-life 20, health 100 on day 5

    // Dies when 100 × 0.5^(t/20) < 10: t = 20 × log2(10) = 66.4386 days after day 5.
    const crossing = T0 + 5 * DAY + 20 * Math.log2(10) * DAY
    const beforeRevival = itemAt(engine, id, T0 + 80 * DAY)
    expect(beforeRevival.state).toBe("dead")
    expect(beforeRevival.policyData).toEqual({ halfLifeDays: 20 })
    expect(beforeRevival.diedAt).toBeGreaterThanOrEqual(crossing)
    expect(beforeRevival.diedAt).toBeLessThanOrEqual(crossing + MINUTE)

    expect(engine.resurrect(id, RIGHT, T0 + 80 * DAY)).toEqual({ ok: true })

    const revived = itemAt(engine, id, T0 + 80 * DAY)
    expect(revived.state).toBe("alive")
    expect(revived.health).toBe(100)
    expect(revived.policyData).toEqual({ halfLifeDays: 20 })
    expect(revived.timesResurrected).toBe(1)
    expect(revived.diedAt).toBeUndefined()
    expect(revived.lastEventAt).toBe(T0 + 80 * DAY)
    // It decays with half-life 20 again: 20 days later health is 50.
    expect(itemAt(engine, id, T0 + 100 * DAY).health).toBeCloseTo(50, 8)
  })

  it("through the engine: comes back with the half-life it had at death after halving (5)", () => {
    const engine = makeEngine()
    const id = addFact(engine, "solid")
    engine.tend(id, WRONG, T0 + DAY) // health 93.3 alive → wrong: health 45, half-life 5

    // Dies when 45 × 0.5^(t/5) < 10: t = 5 × log2(4.5) = 10.85 days after day 1 (day 11.85).
    expect(itemAt(engine, id, T0 + 11 * DAY).state).toBe("weak") // 45 × 0.5^2 = 11.25
    expect(itemAt(engine, id, T0 + 12 * DAY).state).toBe("dead")

    expect(engine.resurrect(id, RIGHT, T0 + 20 * DAY)).toEqual({ ok: true })

    const revived = itemAt(engine, id, T0 + 20 * DAY)
    expect(revived.state).toBe("alive")
    expect(revived.health).toBe(100)
    expect(revived.policyData).toEqual({ halfLifeDays: 5 })
    // Half-life 5: 5 days later health is 50.
    expect(itemAt(engine, id, T0 + 25 * DAY).health).toBeCloseTo(50, 8)
  })

  it("through the engine: a wrong answer keeps the fact dead and records the failure", () => {
    const engine = makeEngine()
    const id = addFact(engine, "solid")
    const now = T0 + 40 * DAY

    expect(engine.resurrect(id, WRONG, now)).toEqual({ ok: false, reason: WRONG_REASON })

    const item = itemAt(engine, id, now)
    expect(item.state).toBe("dead")
    expect(item.timesResurrected).toBe(0)
    expect(item.policyData).toEqual({ halfLifeDays: 10 })
    const failure = engine.history(id).find((e) => e.type === "resurrect-failed")
    expect(failure).toMatchObject({ type: "resurrect-failed", event: WRONG, reason: WRONG_REASON })
  })
})

describe("outcome: a fact with half-life 10, importance 2, cost 2, never reviewed (task 2.3)", () => {
  it("is stored with half-life 10, importance 2 and cost 2", () => {
    const engine = makeEngine()
    const id = addFact(engine, "solid", T0, 2, 2)
    const item = itemAt(engine, id, T0)
    expect(item.policyData).toEqual({ halfLifeDays: 10 })
    expect(item.importance).toBe(2)
    expect(item.costMinutes).toBe(2)
    expect(item.state).toBe("alive")
    expect(item.health).toBe(100)
  })

  // health = 100 × 0.5^(day / 10), via engine.view
  it.each([
    [7, "alive", 61.557], // 0.5^0.7 = 0.61557
    [8, "weak", 57.435], // 0.5^0.8 = 0.57435
    [33, "weak", 10.153], // 0.5^3.3 = 0.10153, still ≥ 10
  ] as const)("on day %d it is %s with health about %d", (day, state, health) => {
    const engine = makeEngine()
    const id = addFact(engine, "solid")
    const item = itemAt(engine, id, T0 + day * DAY)
    expect(item.state).toBe(state)
    expect(item.health).toBeCloseTo(health, 2)
  })

  it("on day 34 it is dead with stored health 0 (0.5^3.4 = 0.0947, below 10)", () => {
    const engine = makeEngine()
    const id = addFact(engine, "solid")
    const item = itemAt(engine, id, T0 + 34 * DAY)
    expect(item.state).toBe("dead")
    expect(item.health).toBe(0)
  })

  it("dies within 1 minute after the crossing at 10 × log2(10) ≈ 33.219 days", () => {
    const engine = makeEngine()
    const id = addFact(engine, "solid")

    engine.tick(T0 + 34 * DAY) // saves the death with its bisected time

    const crossing = T0 + 10 * Math.log2(10) * DAY // 33.2193 days
    const [stored] = engine.graveyard()
    expect(stored?.id).toBe(id)
    expect(stored?.diedAt).toBeGreaterThanOrEqual(crossing)
    expect(stored?.diedAt).toBeLessThanOrEqual(crossing + MINUTE)
    // Sanity on the maths: the crossing is on day 33, not day 34 and not day 32.
    expect((crossing - T0) / DAY).toBeCloseTo(33.2193, 3)
  })

  it("a right answer doubles the half-life and a wrong answer halves it", () => {
    const engine = makeEngine()
    const right = addFact(engine, "solid")
    const wrong = addFact(engine, "solid")
    const at = T0 + DAY // health 93.3: both still alive

    engine.tend(right, RIGHT, at)
    engine.tend(wrong, WRONG, at)

    expect(itemAt(engine, right, at).policyData).toEqual({ halfLifeDays: 20 })
    expect(itemAt(engine, right, at).health).toBe(100)
    expect(itemAt(engine, wrong, at).policyData).toEqual({ halfLifeDays: 5 })
    expect(itemAt(engine, wrong, at).health).toBe(45)
  })

  it("a right answer after death brings it back with half-life 10, health 100 and decay from there", () => {
    const engine = makeEngine()
    const id = addFact(engine, "solid")
    const reviveAt = T0 + 40 * DAY // died on day 33.22

    expect(itemAt(engine, id, reviveAt).state).toBe("dead")
    expect(engine.resurrect(id, RIGHT, reviveAt)).toEqual({ ok: true })

    const revived = itemAt(engine, id, reviveAt)
    expect(revived.state).toBe("alive")
    expect(revived.health).toBe(100)
    expect(revived.policyData).toEqual({ halfLifeDays: 10 })
    expect(revived.timesResurrected).toBe(1)
    // One half-life (10 days) after the revival, health is 50.
    expect(itemAt(engine, id, reviveAt + 10 * DAY).health).toBeCloseTo(50, 8)
  })
})
