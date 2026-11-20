// Tests for the Ghosted policy (task 3.3, design section 7.4, Requirements 1-5).
// Each scaffold it.todo is replaced by a real test with the same name.
// Expected numbers are worked out from the rules in the spec, not copied from
// the policy's output. Real DecayEngine on InMemoryAdapter, fixed timestamps,
// never the real clock.
//
// Rules the numbers come from (requirements.md 1-4, design section 2.2):
//   T = 3 × rhythmDays days; L = policyData.lastContactAt
//   health(t) = max(0, 100 × (T − max(0, t − L)) / T)
//   text: health min(100, h + 40), L = now − (100 − health) / 100 × T
//   call, meet-up: health 100, L = now
//   nextDueAt: L + 2T/5 while h ≥ 60, now while 10 ≤ h < 60, null when dead or h < 10
//   resurrect: always { ok: true, policyData: { lastContactAt: now } }
//   weak below 60, dead below 10
// For a 30-day rhythm T is 90 days: health on day d is 100 × (90 − d) / 90.

import { describe, expect, it } from "vitest"
import { checkPolicy } from "@decay-engine/engine"
import { ghostedPolicy as policy, type ContactEvent, type Person, type PersonPayload } from "./policy"
import { DAY_MS, MINUTE_MS, T0, day, makeEngine } from "./test/fixtures"
import type { GhostedEngine } from "./engine-instance"

const TEXT: ContactEvent = { kind: "text" }
const CALL: ContactEvent = { kind: "call" }
const MEETUP: ContactEvent = { kind: "meetup" }
const KINDS = [TEXT, CALL, MEETUP] as const

function payload(rhythmDays = 30, lastContactAt = T0): PersonPayload {
  return { name: "Mira Castell", relationship: "College", rhythmDays, lastContactAt }
}

// A stored person for calling the policy directly: 30-day rhythm, last contact T0.
function makePerson(over: Partial<Person> = {}): Person {
  return {
    id: "p1",
    payload: payload(),
    policyData: { lastContactAt: T0 },
    health: 100,
    state: "alive",
    createdAt: T0,
    lastEventAt: T0,
    timesResurrected: 0,
    importance: 2,
    costMinutes: 10,
    ...over,
  }
}

/** A 30-day-rhythm person added at T0 with last contact T0, through the engine. */
function addPerson(engine: GhostedEngine): string {
  return engine.addItem({ payload: payload(30, T0), importance: 2, costMinutes: 10 }, T0)
}

function itemAt(engine: GhostedEngine, id: string, now: number): Person {
  const found = engine.view(now).find((p) => p.id === id)
  if (found === undefined) throw new Error(`test setup: person ${id} is missing from view(${now})`)
  return found
}

/** Asserts `actual` is within `tolerance` of `expected`, naming both on failure. */
function expectWithin(actual: number | null | undefined, expected: number, tolerance: number) {
  if (actual === null || actual === undefined) throw new Error(`expected a number near ${expected}, got ${actual}`)
  expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance)
}

describe("ghostedPolicy: contract", () => {
  it("has thresholds weak 60 and dead 10 (Req 1.1)", () => {
    expect(policy.thresholds).toEqual({ weak: 60, dead: 10 })
  })
})

describe("ghostedPolicy: properties", () => {
  it("health stays within 0-100 for any person and time", () => {
    const rhythms = [1, 7, 30, 365]
    // Last contact from 400 days before T0 to 10 days after it (a future contact).
    const contacts = [-400, -90, -10, 0, 10].map(day)
    const times = [-500, -1, 0, 1, 36, 81, 90, 365, 3650].map(day)
    for (const rhythmDays of rhythms) {
      for (const lastContactAt of contacts) {
        const person = makePerson({ payload: payload(rhythmDays, lastContactAt), policyData: { lastContactAt } })
        for (const t of times) {
          const h = policy.healthAt(person, t)
          expect(Number.isFinite(h), `rhythm ${rhythmDays}, L ${lastContactAt}, t ${t}`).toBe(true)
          expect(h).toBeGreaterThanOrEqual(0)
          expect(h).toBeLessThanOrEqual(100)
        }
      }
    }
    // Past T the straight line would go negative; it stops at 0 (rhythm 1: T = 3 days).
    expect(policy.healthAt(makePerson({ payload: payload(1) }), day(10))).toBe(0)
  })

  it("same input at the same moment gives the same output (healthAt, applyEvent, nextDueAt, resurrect)", () => {
    const person = makePerson({ health: 50, state: "weak", lastEventAt: day(45) })
    const before = structuredClone(person)
    const now = day(45)

    expect(policy.healthAt(person, now)).toBe(policy.healthAt(structuredClone(person), now))
    expect(policy.nextDueAt(person, now)).toBe(policy.nextDueAt(structuredClone(person), now))
    for (const event of KINDS) {
      expect(policy.applyEvent(person, event, now)).toEqual(policy.applyEvent(structuredClone(person), { ...event }, now))
      expect(policy.resurrect(person, event, now)).toEqual(policy.resurrect(structuredClone(person), { ...event }, now))
    }
    expect(policy.init(payload(), T0)).toEqual(policy.init(payload(), day(99)))
    // Nothing it was given has changed.
    expect(person).toEqual(before)
  })

  it("healthAt never increases with time between events", () => {
    for (const rhythmDays of [1, 30, 365]) {
      for (const lastContactAt of [day(-10), T0, day(5)]) {
        const person = makePerson({ payload: payload(rhythmDays, lastContactAt), policyData: { lastContactAt } })
        const offsets = [-DAY_MS, 0, 1, MINUTE_MS, DAY_MS, 7 * DAY_MS, 36 * DAY_MS, 400 * DAY_MS, 3650 * DAY_MS]
        let previous = Infinity
        for (const offset of offsets) {
          const value = policy.healthAt(person, T0 + offset)
          expect(value, `rhythm ${rhythmDays}, offset ${offset}`).toBeLessThanOrEqual(previous)
          previous = value
        }
        // And it really falls: ten years later every rhythm up to 365 days is at 0.
        expect(previous).toBe(0)
      }
    }
  })

  it("passes checkPolicy from @decay-engine/engine", () => {
    // Rhythms 1, 30 and 365, last contact at T0 and 10 days before it, every kind (Req 5.1).
    const payloads = [1, 30, 365].flatMap((r) => [payload(r, T0), payload(r, day(-10))])
    expect(checkPolicy(policy, payloads, [...KINDS], T0)).toEqual({ passed: true, failures: [] })
  })
})

describe("ghostedPolicy.init (Req 1.2)", () => {
  it("returns the last contact given at the add", () => {
    expect(policy.init(payload(30, day(-12)), T0)).toEqual({ lastContactAt: day(-12) })
    expect(policy.init(payload(7, day(3)), T0)).toEqual({ lastContactAt: day(3) })
  })
})

describe("ghostedPolicy.healthAt (Req 1.3-1.7)", () => {
  // 30-day rhythm, T = 90 days, last contact T0.
  it.each([
    [0, 100],
    [36, 60], // 100 × 54 / 90
    [81, 10], // 100 × 9 / 90
    [90, 0],
    [100, 0], // past T: 0, not negative
  ])("on day %d health is exactly %d", (d, expected) => {
    expect(policy.healthAt(makePerson(), day(d))).toBe(expected)
  })

  it.each([
    [37, (100 * 53) / 90], // ≈ 58.89
    [82, (100 * 8) / 90], // ≈ 8.89
    [45, 50],
  ])("on day %d health is %d within 1e-9", (d, expected) => {
    expectWithin(policy.healthAt(makePerson(), day(d)), expected, 1e-9)
  })

  it("is exactly 100 when the last contact is later than now (Req 1.5)", () => {
    const person = makePerson({ policyData: { lastContactAt: day(5) } })
    expect(policy.healthAt(person, T0)).toBe(100)
    expect(policy.healthAt(person, day(5) - 1)).toBe(100)
  })

  it("decays from policyData.lastContactAt, not from the payload's or createdAt (a moved last contact)", () => {
    // Payload says T0, but a contact moved L to day 36: on day 72 that is 36 days, health 60.
    const person = makePerson({ policyData: { lastContactAt: day(36) }, createdAt: T0 })
    expect(policy.healthAt(person, day(72))).toBe(60)
  })

  it("reads neither lastEventAt nor health (Req 1.4)", () => {
    const base = makePerson()
    const changed = makePerson({ lastEventAt: day(50), health: 3, state: "weak" })
    for (const d of [0, 36, 37, 81, 90]) {
      expect(Object.is(policy.healthAt(changed, day(d)), policy.healthAt(base, day(d)))).toBe(true)
    }
  })

  it("uses the person's rhythm: a 7-day rhythm (T = 21 days) is at 60 on day 8.4", () => {
    const person = makePerson({ payload: payload(7) })
    expectWithin(policy.healthAt(person, T0 + 8.4 * DAY_MS), 60, 1e-9)
    expectWithin(policy.healthAt(person, day(14)), (100 * 7) / 21, 1e-9)
  })
})

describe("ghostedPolicy.applyEvent (Req 2.1-2.4)", () => {
  it("a text on day 45 (health 50) gives 90 and moves the last contact to day 36", () => {
    const person = makePerson({ health: 50, state: "weak", lastEventAt: day(45) })
    const result = policy.applyEvent(person, TEXT, day(45))
    expect(result.health).toBe(90)
    // L = day 45 − (100 − 90) / 100 × 90 days = day 36
    expectWithin(result.policyData.lastContactAt, day(36), 1)
    // Req 2.3: healthAt of the updated person at now gives the new health
    expectWithin(policy.healthAt({ ...person, policyData: result.policyData }, day(45)), 90, 1e-9)
  })

  it("a text adds 40 to a low freshness (day 80: 100 × 10 / 90 + 40)", () => {
    const person = makePerson({ state: "weak" })
    const result = policy.applyEvent(person, TEXT, day(80))
    const expected = (100 * 10) / 90 + 40
    expectWithin(result.health, expected, 1e-9)
    expectWithin(policy.healthAt({ ...person, policyData: result.policyData }, day(80)), expected, 1e-9)
  })

  it("a text stops at 100 (day 10: 88.9 + 40) and then the last contact is now", () => {
    const result = policy.applyEvent(makePerson(), TEXT, day(10))
    expect(result).toEqual({ health: 100, policyData: { lastContactAt: day(10) } })
  })

  it.each([CALL, MEETUP])("a $kind lights fully: health 100 and the last contact is now", (event) => {
    for (const d of [10, 45, 80]) {
      expect(policy.applyEvent(makePerson(), event, day(d))).toEqual({
        health: 100,
        policyData: { lastContactAt: day(d) },
      })
    }
  })

  it("never returns less than the health before the contact (Req 2.4)", () => {
    for (const event of KINDS) {
      for (const d of [0, 20, 36, 45, 81]) {
        const person = makePerson()
        const before = policy.healthAt(person, day(d))
        const result = policy.applyEvent(person, event, day(d))
        expect(result.health, `${event.kind} on day ${d}`).toBeGreaterThanOrEqual(before)
        expectWithin(policy.healthAt({ ...person, policyData: result.policyData }, day(d)), result.health, 1e-9)
      }
    }
  })

  it("does not change the person it is given", () => {
    const person = makePerson()
    const before = structuredClone(person)
    for (const event of KINDS) policy.applyEvent(person, event, day(45))
    expect(person).toEqual(before)
  })
})

describe("ghostedPolicy.nextDueAt (Req 3.1-3.3)", () => {
  it("alive: L + 2T/5, which is day 36 for a 30-day rhythm, and the same while still lit", () => {
    const person = makePerson()
    expect(policy.nextDueAt(person, T0)).toBe(day(36))
    expect(policy.nextDueAt(person, day(20))).toBe(day(36))
    // Exactly 60 on day 36 is still lit: the answer is that moment.
    expect(policy.nextDueAt(person, day(36))).toBe(day(36))
  })

  it("alive: a 7-day rhythm is due 8.4 days (725 760 000 ms) after the last contact, a whole number of ms", () => {
    // 2T/5 = 2 × 21 × 86 400 000 / 5 = 725 760 000
    const due = policy.nextDueAt(makePerson({ payload: payload(7) }), T0)
    expect(due).toBe(T0 + 725_760_000)
  })

  it("weak: returns now, from 1 ms after day 36 to exactly 10 on day 81", () => {
    const person = makePerson({ state: "weak" })
    for (const now of [day(36) + 1, day(37), day(60), day(81)]) {
      expect(policy.nextDueAt(person, now)).toBe(now)
    }
  })

  it("dead state: null, even when the last contact would give a lit window", () => {
    expect(policy.nextDueAt(makePerson({ state: "dead", health: 0, diedAt: day(81) }), day(90))).toBeNull()
    const deadButRecent = makePerson({ state: "dead", health: 0, policyData: { lastContactAt: day(90) } })
    expect(policy.nextDueAt(deadButRecent, day(90))).toBeNull()
  })

  it("health below 10 with a state that is not dead: null (day 85)", () => {
    expect(policy.nextDueAt(makePerson({ state: "alive" }), day(85))).toBeNull()
    expect(policy.nextDueAt(makePerson({ state: "weak" }), day(82))).toBeNull()
  })
})

describe("ghostedPolicy.resurrect (Req 4.1-4.2)", () => {
  const dead = makePerson({ state: "dead", health: 0, diedAt: day(81) })

  it.each(KINDS)("a $kind always works and lights from now", (event) => {
    expect(policy.resurrect(dead, event, day(95))).toEqual({ ok: true, policyData: { lastContactAt: day(95) } })
  })

  it("afterwards healthAt at now is 100 (Req 4.3)", () => {
    const result = policy.resurrect(dead, TEXT, day(95))
    if (!result.ok || result.policyData === undefined) throw new Error("expected ok with policyData")
    expect(policy.healthAt({ ...dead, policyData: result.policyData }, day(95))).toBe(100)
  })
})

describe("ghostedPolicy: outcomes", () => {
  // Expected values from the reference table in .kiro/specs/engine/design.md and
  // design section 7.4 (30-day rhythm, last contact day 0): alive day 36 (exactly
  // 60), weak day 37, weak day 81 (exactly 10), dead day 82, diedAt within 1
  // minute after day 81. All through the engine.

  it("day 36: alive with health exactly 60", () => {
    const engine = makeEngine()
    const id = addPerson(engine)
    const p = itemAt(engine, id, day(36))
    expect(p.state).toBe("alive")
    expect(p.health).toBe(60)
  })

  it("day 37: weak, health within 1e-9 of 100 × 53 / 90", () => {
    const engine = makeEngine()
    const id = addPerson(engine)
    const p = itemAt(engine, id, day(37))
    expect(p.state).toBe("weak")
    expectWithin(p.health, (100 * 53) / 90, 1e-9)
  })

  it("day 81: still weak with health exactly 10", () => {
    const engine = makeEngine()
    const id = addPerson(engine)
    const p = itemAt(engine, id, day(81))
    expect(p.state).toBe("weak")
    expect(p.health).toBe(10)
  })

  it("day 82: dead", () => {
    const engine = makeEngine()
    const id = addPerson(engine)
    expect(itemAt(engine, id, day(82)).state).toBe("dead")
  })

  it("30-day rhythm, never tended: dies on day 82 (diedAt just after day 81)", () => {
    const engine = makeEngine()
    const id = addPerson(engine)
    engine.tick(day(90))

    const stored = itemAt(engine, id, day(90))
    expect(stored.state).toBe("dead")
    expect(stored.diedAt).toBeGreaterThan(day(81))
    expect(stored.diedAt).toBeLessThanOrEqual(day(81) + MINUTE_MS)
    const died = engine.history(id).find((e) => e.type === "died")
    expect(died?.timestamp).toBe(stored.diedAt)
    expect(engine.graveyard().map((p) => p.id)).toEqual([id])
  })

  it("the alive-to-weak entry is just after day 36 (ticked at day 90)", () => {
    const engine = makeEngine()
    const id = addPerson(engine)
    engine.tick(day(90))
    const weak = engine.history(id).find((e) => e.type === "state-changed" && e.from === "alive" && e.to === "weak")
    expect(weak?.timestamp).toBeGreaterThan(day(36))
    expect(weak?.timestamp).toBeLessThanOrEqual(day(36) + MINUTE_MS)
  })

  it("a text on day 45 gives 90, moves the last contact to day 36 and is next due on day 72", () => {
    const engine = makeEngine()
    const id = addPerson(engine)
    expectWithin(itemAt(engine, id, day(45)).health, 50, 1e-9)

    engine.tend(id, TEXT, day(45))

    const p = itemAt(engine, id, day(45))
    expect(p.state).toBe("alive")
    expectWithin(p.health, 90, 1e-9)
    expectWithin(p.policyData.lastContactAt, day(36), 1)
    expectWithin(policy.nextDueAt(p, day(45)), day(72), 1)
  })

  it.each([CALL, MEETUP])("a $kind on day 45 gives 100, and it goes weak just after day 81", (event) => {
    const engine = makeEngine()
    const id = addPerson(engine)
    engine.tend(id, event, day(45))
    const p = itemAt(engine, id, day(45))
    expect(p.health).toBe(100)
    expect(p.state).toBe("alive")

    engine.tick(day(90))

    // The earlier crossing (day 36) is in the history too; the last one is the new life's.
    const crossings = engine
      .history(id)
      .filter((e) => e.type === "state-changed" && e.from === "alive" && e.to === "weak")
    const last = crossings[crossings.length - 1]
    expect(last?.timestamp).toBeGreaterThan(day(81))
    expect(last?.timestamp).toBeLessThanOrEqual(day(81) + MINUTE_MS)
    expect(itemAt(engine, id, day(90)).state).toBe("weak")
  })

  it("dead on day 90, a reconnect by text: alive, health 100, timesResurrected 1", () => {
    const engine = makeEngine()
    const id = addPerson(engine)
    expect(itemAt(engine, id, day(90)).state).toBe("dead")

    expect(engine.resurrect(id, TEXT, day(90))).toEqual({ ok: true })

    const p = itemAt(engine, id, day(90))
    expect(p.state).toBe("alive")
    expect(p.health).toBe(100)
    expect(p.timesResurrected).toBe(1)
    expect(p.policyData).toEqual({ lastContactAt: day(90) })
    expect(policy.healthAt(p, day(90))).toBe(100)
  })
})
