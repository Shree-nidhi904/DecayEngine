// Tests for the three lists' grouping and sorting (task 6.1).
// Items come from a real DecayEngine on InMemoryAdapter, read through
// engine.view(now) at fixed times; never the real clock.
//
// Expected values come from the spec, not from running the code:
// - health = H × 0.5^(elapsed / half-life) (Requirement 1.1)
// - first half-life: new 2, shaky 5, solid 10 days (1.2-1.4)
// - right answer: health 100, half-life × 2; wrong: health 45, half-life ÷ 2 (2.1, 2.2)
// - alive ≥ 60, weak 10 to 60, dead < 10 (1.5)
// - wake-up = T + D × log2(H / 60) days (3.1)
// - death = T + D × log2(H / 10) days, dated at most 1 minute late by bisection

import { describe, expect, it } from "vitest"
import { DecayEngine, InMemoryAdapter } from "@decay-engine/engine"
import {
  DAY_MS,
  studyDungeonPolicy,
  type Fact,
  type FactPayload,
  type FactPolicyData,
  type Knowledge,
  type ReviewEvent,
} from "./policy"
import {
  buildLists,
  epitaphOf,
  formatHealth,
  formatWakeUp,
  groupByState,
  sortCrypt,
  sortDungeon,
  sortGraveyard,
} from "./lists"

const T0 = Date.UTC(2026, 9, 1) // 1 Oct 2026 00:00 UTC, fixed
const day = (n: number) => T0 + n * DAY_MS

/** An engine whose ids are the given names, in addItem order. */
function makeEngine() {
  const queue: string[] = []
  const engine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(
    studyDungeonPolicy,
    new InMemoryAdapter(),
    () => {
      const id = queue.shift()
      if (id === undefined) throw new Error("test bug: no id queued")
      return id
    }
  )
  const add = (id: string, knowledge: Knowledge, at: number, why = "") => {
    queue.push(id)
    return engine.addItem(
      { payload: { question: `Question ${id}`, answer: "Answer", why, knowledge }, importance: 2, costMinutes: 2 },
      at
    )
  }
  return { engine, add }
}

const ids = (facts: readonly Fact[]) => facts.map((f) => f.id)

describe("groupByState", () => {
  // At day 8:
  // - solid (D 10) from day 0: 100 × 0.5^0.8 ≈ 57.4 → weak
  // - new (D 2) from day 0: 100 × 0.5^4 = 6.25 → dead
  // - solid added on day 7: 100 × 0.5^0.1 ≈ 93.3 → alive
  // - shaky (D 5) from day 0: 100 × 0.5^1.6 ≈ 33.0 → weak
  function scenario() {
    const { engine, add } = makeEngine()
    add("solid", "solid", day(0))
    add("early-new", "new", day(0))
    add("fresh", "solid", day(7))
    add("shaky", "shaky", day(0))
    return engine.view(day(8))
  }

  it("puts every fact in exactly the list its state belongs to", () => {
    const groups = groupByState(scenario())
    expect(ids(groups.alive)).toEqual(["fresh"])
    expect(ids(groups.weak)).toEqual(["solid", "shaky"]) // input order kept
    expect(ids(groups.dead)).toEqual(["early-new"])
  })

  it("agrees with the thresholds: alive ≥ 60, weak 10 to 60, dead stored as 0", () => {
    const groups = groupByState(scenario())
    for (const f of groups.alive) expect(f.health).toBeGreaterThanOrEqual(60)
    for (const f of groups.weak) {
      expect(f.health).toBeGreaterThanOrEqual(10)
      expect(f.health).toBeLessThan(60)
    }
    for (const f of groups.dead) expect(f.health).toBe(0)
  })

  it("returns empty lists for no facts", () => {
    expect(groupByState([])).toEqual({ alive: [], weak: [], dead: [] })
  })
})

describe("sortCrypt", () => {
  it("orders the Crypt by wake-up time, soonest first, using nextDueAt", () => {
    const { engine, add } = makeEngine()
    add("solid", "solid", day(0))
    add("new", "new", day(0))
    add("shaky", "shaky", day(0))
    add("reviewed", "new", day(0))
    // Right answer on day 1: health 100, half-life 2 × 2 = 4 days, from day 1.
    engine.tend("reviewed", { kind: "review", correct: true }, day(1))

    const now = day(1)
    const alive = groupByState(engine.view(now)).alive
    // All four are alive on day 1; new is at 100 × 0.5^0.5 ≈ 70.7.
    expect(ids(alive).sort()).toEqual(["new", "reviewed", "shaky", "solid"])

    const entries = sortCrypt(alive, now)
    const log = Math.log2(100 / 60) // ≈ 0.737 half-lives from 100 to 60
    const expected = [
      { id: "new", wakeAt: day(2 * log) }, //            ≈ day 1.474
      { id: "shaky", wakeAt: day(5 * log) }, //          ≈ day 3.685
      { id: "reviewed", wakeAt: day(1 + 4 * log) }, //   ≈ day 3.948
      { id: "solid", wakeAt: day(10 * log) }, //         ≈ day 7.370
    ]
    expect(entries.map((e) => e.fact.id)).toEqual(expected.map((e) => e.id))
    entries.forEach((entry, i) => {
      expect(entry.wakeAt).not.toBeNull()
      expect(Math.abs(entry.wakeAt! - expected[i]!.wakeAt)).toBeLessThanOrEqual(1) // within 1 ms
    })
  })

  it("breaks wake-up ties by id and leaves its input alone", () => {
    const { engine, add } = makeEngine()
    add("b-fact", "shaky", day(0))
    add("a-fact", "shaky", day(0))
    const alive = groupByState(engine.view(day(0))).alive
    expect(ids(alive)).toEqual(["b-fact", "a-fact"])

    expect(sortCrypt(alive, day(0)).map((e) => e.fact.id)).toEqual(["a-fact", "b-fact"])
    expect(ids(alive)).toEqual(["b-fact", "a-fact"])
  })
})

describe("sortDungeon", () => {
  it("orders the Dungeon by health, weakest first", () => {
    const { engine, add } = makeEngine()
    add("solid", "solid", day(0))
    add("shaky", "shaky", day(0))
    add("late-new", "new", day(5))
    add("missed", "solid", day(0))
    // Wrong answer on day 1: health 45, half-life 10 ÷ 2 = 5 days, from day 1.
    engine.tend("missed", { kind: "review", correct: false }, day(1))

    const weak = groupByState(engine.view(day(8))).weak
    const sorted = sortDungeon(weak)

    const expected = [
      { id: "missed", health: 45 * 0.5 ** (7 / 5) }, //   ≈ 17.05
      { id: "shaky", health: 100 * 0.5 ** (8 / 5) }, //   ≈ 32.99
      { id: "late-new", health: 100 * 0.5 ** (3 / 2) }, // ≈ 35.36
      { id: "solid", health: 100 * 0.5 ** (8 / 10) }, //  ≈ 57.43
    ]
    expect(ids(sorted)).toEqual(expected.map((e) => e.id))
    sorted.forEach((fact, i) => expect(fact.health).toBeCloseTo(expected[i]!.health, 6))
    // Input left alone.
    expect(ids(weak)).toEqual(["solid", "shaky", "late-new", "missed"])
  })

  it("breaks health ties by id", () => {
    const { engine, add } = makeEngine()
    add("z-fact", "new", day(0))
    add("m-fact", "new", day(0))
    const weak = groupByState(engine.view(day(2))).weak // both at 50
    expect(ids(sortDungeon(weak))).toEqual(["m-fact", "z-fact"])
  })
})

describe("sortGraveyard", () => {
  it("orders the Graveyard by death time, most recent first", () => {
    const { engine, add } = makeEngine()
    add("first", "new", day(0))
    add("second", "shaky", day(0))
    add("third", "new", day(1))
    add("survivor", "solid", day(0)) // 100 × 0.5^2 = 25 on day 20: weak

    const dead = groupByState(engine.view(day(20))).dead
    const sorted = sortGraveyard(dead)

    const log10 = Math.log2(10) // ≈ 3.32 half-lives from 100 to 10
    const expected = [
      { id: "second", crossing: day(5 * log10) }, //    ≈ day 16.61
      { id: "third", crossing: day(1 + 2 * log10) }, // ≈ day 7.64
      { id: "first", crossing: day(2 * log10) }, //     ≈ day 6.64
    ]
    expect(ids(sorted)).toEqual(expected.map((e) => e.id))
    sorted.forEach((fact, i) => {
      expect(fact.diedAt).toBeGreaterThanOrEqual(expected[i]!.crossing)
      expect(fact.diedAt).toBeLessThanOrEqual(expected[i]!.crossing + 60_000)
    })
    expect(ids(dead)).toEqual(["first", "second", "third"])
  })

  it("breaks death-time ties by id", () => {
    const { engine, add } = makeEngine()
    add("y-fact", "new", day(0))
    add("c-fact", "new", day(0))
    const dead = groupByState(engine.view(day(10))).dead
    expect(dead[0]!.diedAt).toBe(dead[1]!.diedAt)
    expect(ids(sortGraveyard(dead))).toEqual(["c-fact", "y-fact"])
  })
})

describe("buildLists", () => {
  it("groups engine.view(now) and sorts each list", () => {
    const { engine, add } = makeEngine()
    add("solid", "solid", day(0)) //   day 8: ≈ 57.4, weak
    add("dead-new", "new", day(0)) //  day 8: 6.25, dead
    add("fresh", "shaky", day(7)) //   day 8: ≈ 87.1, alive
    add("shaky", "shaky", day(0)) //   day 8: ≈ 33.0, weak
    add("fresher", "solid", day(8)) // day 8: 100, alive, wakes day 8 + 7.37

    const lists = buildLists(engine.view(day(8)), day(8))
    // fresh wakes at day 7 + 5 × 0.737 ≈ day 10.68; fresher at ≈ day 15.37.
    expect(lists.crypt.map((e) => e.fact.id)).toEqual(["fresh", "fresher"])
    expect(ids(lists.dungeon)).toEqual(["shaky", "solid"])
    expect(ids(lists.graveyard)).toEqual(["dead-new"])
  })
})

describe("epitaphOf", () => {
  const fact = (why: string) => ({ payload: { why } }) as Fact

  it("returns payload.why, trimmed", () => {
    expect(epitaphOf(fact("Ships sail on it"))).toBe("Ships sail on it")
    expect(epitaphOf(fact("  Ships sail on it "))).toBe("Ships sail on it")
  })

  it("returns null when there is no epitaph", () => {
    expect(epitaphOf(fact(""))).toBeNull()
    expect(epitaphOf(fact("   "))).toBeNull()
  })
})

describe("formatHealth", () => {
  it("rounds down, so a weak fact never shows 60", () => {
    expect(formatHealth(59.999)).toBe("59")
    expect(formatHealth(100 * 0.5 ** 0.8)).toBe("57") // ≈ 57.43, the solid fact on day 8
    expect(formatHealth(10)).toBe("10")
    expect(formatHealth(100)).toBe("100")
  })
})

describe("formatWakeUp", () => {
  it("shows day, month, year and 24-hour time in the given zone", () => {
    // A "new" fact added at 00:00 UTC on 1 Oct 2026 wakes after
    // 2 × log2(100/60) ≈ 1.47393 days = 35 h 22 min 27 s → 2 Oct, 11:22.
    expect(formatWakeUp(day(2 * Math.log2(100 / 60)), { timeZone: "UTC" })).toBe("2 Oct 2026, 11:22")
    expect(formatWakeUp(T0, { timeZone: "UTC" })).toBe("1 Oct 2026, 00:00")
  })

  it("follows the time zone it is given", () => {
    // 1 Oct 2026 00:00 UTC is 05:30 in India (UTC+5:30, no daylight saving).
    expect(formatWakeUp(T0, { timeZone: "Asia/Kolkata" })).toBe("1 Oct 2026, 05:30")
  })
})
