// The sample street (task 4.13; design sections 6.3 and 7.5; Req 20.3-20.5,
// 20.8, 16.2, 10.2). The sample is replayed through a real engine on
// InMemoryAdapter at NOW = T0, and every expectation comes from design
// section 6.3. Timestamps are compared within one minute and lists by order,
// never by rounded day labels: the engine dates a crossing up to one minute
// after it happens, so a crossing at day d is expected in (d, d + 1 min].

import { beforeEach, describe, expect, it } from "vitest"
import type { GhostedEngine } from "./engine-instance"
import { heroTarget, shownState, sortEmpty, sortFading, sortStillLit } from "./lists"
import { ghostedPolicy, type ContactEvent, type Person } from "./policy"
import { SAMPLE_PEOPLE, loadSampleData } from "./sample-data"
import { DAY_MS, MINUTE_MS, T0, makeEngine } from "./test/fixtures"

const NOW = T0

let engine: GhostedEngine
let ids: string[]
let people: Person[]

beforeEach(() => {
  engine = makeEngine()
  ids = loadSampleData(engine, NOW)
  people = engine.view(NOW)
})

const byName = (name: string): Person => {
  const found = people.filter((p) => p.payload.name === name)
  expect(found, name).toHaveLength(1)
  return found[0]!
}
const names = (list: readonly Person[]) => list.map((p) => p.payload.name)

/** A crossing worked out at `expected` is dated in (expected, expected + 1 min]. */
function expectWithinMinuteAfter(actual: number | null | undefined, expected: number, label: string) {
  expect(actual, label).toBeTypeOf("number")
  expect(actual! - expected, `${label}: dated before the crossing`).toBeGreaterThan(0)
  expect(actual! - expected, `${label}: dated more than a minute after the crossing`).toBeLessThanOrEqual(MINUTE_MS)
}

/** Fractional days written as whole minutes, so no float rounding sits in an expected time. */
const minutes = (n: number) => n * MINUTE_MS

describe("loadSampleData", () => {
  it("replays without throwing and returns the 12 ids in SAMPLE_PEOPLE order", () => {
    expect(ids).toHaveLength(12)
    expect(new Set(ids).size).toBe(12)
    const nameOf = new Map(people.map((p) => [p.id, p.payload.name] as const))
    expect(ids.map((id) => nameOf.get(id))).toEqual(SAMPLE_PEOPLE.map((p) => p.name))
  })

  it("adds each person with the row's payload, importance and minutes", () => {
    for (const row of SAMPLE_PEOPLE) {
      const p = byName(row.name)
      expect(p.payload, row.name).toEqual({
        name: row.name,
        relationship: row.relationship,
        rhythmDays: row.rhythmDays,
        lastContactAt: NOW - row.lastContactDaysAgo * DAY_MS,
      })
      expect(p.importance, row.name).toBe(row.importance)
      expect(p.costMinutes, row.name).toBe(row.costMinutes)
      expect(p.createdAt, row.name).toBe(NOW - row.addedDaysAgo * DAY_MS)
    }
  })

  it("each row's expected, litAgain and startsDark match engine.view(NOW)", () => {
    for (const row of SAMPLE_PEOPLE) {
      const p = byName(row.name)
      expect(p.state, row.name).toBe(row.expected)
      expect(shownState(p) === "litAgain", `${row.name} lit again`).toBe(row.litAgain === true)
      const history = engine.history(p.id)
      const startedDark =
        history[0]?.type === "created" && history[1]?.type === "died" && history[0].timestamp === history[1].timestamp
      expect(startedDark, `${row.name} started dark`).toBe(row.startsDark === true)
    }
  })
})

describe("the sample street at NOW (design section 6.3)", () => {
  it("has 4 lit, 4 flickering and 4 boarded up, with 12 unique full names", () => {
    const counts = { alive: 0, weak: 0, dead: 0 }
    for (const p of people) counts[p.state]++
    expect(counts).toEqual({ alive: 4, weak: 4, dead: 4 })
    const all = people.map((p) => p.payload.name)
    expect(new Set(all).size).toBe(12)
    for (const name of all) expect(name, name).toMatch(/^\S+( \S+)+$/)
  })

  it("has the freshness of section 7.5, within 1e-9, and the four dark windows at 0", () => {
    const expected: [string, number][] = [
      ["Priya Raman", 100 * (1 - 12 / 90)],
      ["Sam Rivera", 100 * (1 - 5 / 42)],
      ["Sunita Rao", 100 * (1 - 6 / 21)],
      ["Nia Bello", 100 * (1 - 20 / 135)],
      ["Dan Okafor", 100 * (1 - 96 / 135)],
      ["Grace Liu", 100 * (1 - 51 / 90)],
      ["Meera Joshi", 100 * (1 - 35 / 63)],
      ["Joel Kim", 100 * (1 - 140 / 270)],
    ]
    for (const [name, health] of expected) expect(Math.abs(byName(name).health - health), name).toBeLessThanOrEqual(1e-9)
    for (const name of ["Leo Marchetti", "Tomas Novak", "Ayesha Khan", "Harun Aziz"]) expect(byName(name).health, name).toBe(0)
  })

  it("the hero's person is Dan Okafor, the lowest freshness", () => {
    expect(heroTarget(people)?.payload.name).toBe("Dan Okafor")
  })

  it("orders Fading, Empty windows and Still lit as section 6.3", () => {
    expect(names(sortFading(people))).toEqual(["Dan Okafor", "Grace Liu", "Meera Joshi", "Joel Kim"])
    expect(names(sortEmpty(people))).toEqual(["Tomas Novak", "Ayesha Khan", "Leo Marchetti", "Harun Aziz"])
    expect(sortStillLit(people, NOW).map((r) => r.person.payload.name)).toEqual([
      "Sunita Rao",
      "Sam Rivera",
      "Priya Raman",
      "Nia Bello",
    ])
  })

  it("Empty windows matches the engine's own graveyard order", () => {
    expect(names(engine.graveyard())).toEqual(names(sortEmpty(people)))
  })

  it("dates each death as section 6.3", () => {
    const tomas = byName("Tomas Novak")
    expect(tomas.diedAt).toBe(NOW - 30 * DAY_MS)
    expect(tomas.diedAt).toBe(tomas.createdAt)
    expectWithinMinuteAfter(byName("Ayesha Khan").diedAt, NOW - minutes(46_368), "Ayesha Khan (−32.2 days)")
    expectWithinMinuteAfter(byName("Leo Marchetti").diedAt, NOW - 96 * DAY_MS, "Leo Marchetti (−96 days)")
    expectWithinMinuteAfter(byName("Harun Aziz").diedAt, NOW - minutes(141_264), "Harun Aziz (−98.1 days)")
  })

  it("Nia Bello was reconnected once and shows as lit again", () => {
    const nia = byName("Nia Bello")
    expect(nia.timesResurrected).toBe(1)
    expect(shownState(nia)).toBe("litAgain")
    const history = engine.history(nia.id)
    // She went dark at −58.5 days, before the reconnect at −20.
    const died = history.find((e) => e.type === "died")
    expectWithinMinuteAfter(died?.timestamp, NOW - minutes(84_240), "Nia Bello went dark (−58.5 days)")
    const back = history.find((e) => e.type === "resurrected")
    expect(back?.timestamp).toBe(NOW - 20 * DAY_MS)
    expect(back?.type === "resurrected" && back.event).toEqual({ kind: "meetup" })
    for (const p of people) if (p.payload.name !== "Nia Bello") expect(shownState(p), p.payload.name).not.toBe("litAgain")
  })

  it('Tomas Novak started dark: "created" and "died" at the same time, and his autopsy life starts at his death', () => {
    const tomas = byName("Tomas Novak")
    const history = engine.history(tomas.id)
    expect(history.slice(0, 2).map((e) => e.type)).toEqual(["created", "died"])
    expect(history[0]!.timestamp).toBe(NOW - 30 * DAY_MS)
    expect(history[1]!.timestamp).toBe(history[0]!.timestamp)
    const report = engine.autopsy(tomas.id, NOW)
    expect(report.lifeStartedAt).toBe(report.diedAt)
    expect(report.tends).toEqual([])
    // The gap the sentences describe: 370 days, more than 2.7 × 120 = 324.
    expect((report.diedAt - tomas.payload.lastContactAt) / DAY_MS).toBe(370)
  })

  it("Sam Rivera's logged contacts include a text, a call and a meet-up", () => {
    const sam = byName("Sam Rivera")
    const kinds = engine
      .history(sam.id)
      .filter((e) => e.type === "tended")
      .map((e) => (e.type === "tended" ? (e.event as ContactEvent).kind : null))
    expect(kinds).toEqual(["meetup", "text", "call"])
  })

  it("uses at least 4 rhythms between 7 and 120 days, and all three importance levels", () => {
    const rhythms = new Set(people.map((p) => p.payload.rhythmDays))
    expect([...rhythms].filter((r) => r >= 7 && r <= 120).length).toBeGreaterThanOrEqual(4)
    expect(new Set(people.map((p) => p.importance))).toEqual(new Set([1, 2, 3]))
  })

  it("Tomas Novak is the one person without a relationship (the Others house)", () => {
    expect(people.filter((p) => p.payload.relationship.trim() === "").map((p) => p.payload.name)).toEqual(["Tomas Novak"])
  })
})

describe("triage, markers and forecast on the sample street (design section 6.3)", () => {
  // (100 − h)² / 100 × importance, with h from the exact ages of section 7.5.
  // Section 7.5 prints these to three decimals (101.136, 92.593, 32.111, 80.658).
  const worth = (age: number, span: number, importance: number) => {
    const h = 100 * (1 - age / span)
    return ((100 - h) * (100 - h) * importance) / 100
  }
  const expectedValue: Record<string, [exact: number, printed: number]> = {
    "Dan Okafor": [worth(96, 135, 2), 101.136],
    "Meera Joshi": [worth(35, 63, 3), 92.593],
    "Grace Liu": [worth(51, 90, 1), 32.111],
    "Joel Kim": [worth(140, 270, 3), 80.658],
  }

  it("triage at 30 minutes picks Dan then Meera, and leaves Grace then Joel", () => {
    const result = engine.triage(30, NOW)
    expect(result.picks.map((c) => c.item.payload.name)).toEqual(["Dan Okafor", "Meera Joshi"])
    expect(result.others.map((c) => c.item.payload.name)).toEqual(["Grace Liu", "Joel Kim"])
    for (const c of [...result.picks, ...result.others]) {
      const [exact, printed] = expectedValue[c.item.payload.name]!
      expect(Math.abs(c.value - exact), c.item.payload.name).toBeLessThanOrEqual(1e-6)
      expect(Math.abs(c.value - printed), `${c.item.payload.name} against the printed value`).toBeLessThan(5e-4)
    }
    expect(result.picks.reduce((sum, c) => sum + c.item.costMinutes, 0)).toBe(30)
  })

  it("today's 5-minute action is Dan Okafor: the only fading person at 5 minutes or less", () => {
    const { picks, others } = engine.triage(1440, NOW)
    const quick = [...picks, ...others]
      .filter((c) => c.item.costMinutes <= 5)
      .sort((a, b) => b.valuePerMinute - a.valuePerMinute || (a.item.id < b.item.id ? -1 : 1))
    expect(quick.map((c) => c.item.payload.name)).toEqual(["Dan Okafor"])
  })

  it("the lit people start fading exactly when section 6.3 says", () => {
    const fades: [string, number][] = [
      ["Sunita Rao", NOW + minutes(3_456)], // + 2.4 days
      ["Sam Rivera", NOW + minutes(16_992)], // + 11.8 days
      ["Priya Raman", NOW + 24 * DAY_MS],
      ["Nia Bello", NOW + 34 * DAY_MS],
    ]
    for (const [name, at] of fades) expect(ghostedPolicy.nextDueAt(byName(name), NOW), name).toBe(at)
    // At that moment the light is exactly 60 (still lit), and below 60 a minute later.
    for (const [name, at] of fades) {
      const p = byName(name)
      expect(Math.abs(ghostedPolicy.healthAt(p, at) - 60), name).toBeLessThanOrEqual(1e-9)
      expect(ghostedPolicy.healthAt(p, at + MINUTE_MS), name).toBeLessThan(60)
    }
  })

  it("forecast over 365 days: who goes dark, soonest first, each within a minute after the worked-out day", () => {
    const entries = engine.forecast(NOW, 365 * DAY_MS)
    const expected: [string, number][] = [
      ["Sunita Rao", minutes(18_576)], // 12.9 days
      ["Meera Joshi", minutes(31_248)], // 21.7 days
      ["Dan Okafor", minutes(36_720)], // 25.5 days
      ["Grace Liu", 30 * DAY_MS],
      ["Sam Rivera", minutes(47_232)], // 32.8 days
      ["Priya Raman", 69 * DAY_MS],
      ["Nia Bello", minutes(146_160)], // 101.5 days
      ["Joel Kim", 103 * DAY_MS],
    ]
    expect(entries.map((e) => e.item.payload.name)).toEqual(expected.map(([name]) => name))
    entries.forEach((e, i) => expectWithinMinuteAfter(e.diesAt, NOW + expected[i]![1], e.item.payload.name))
  })

  it("forecast over 30 days: Sunita, Meera and Dan; Grace goes dark just after day 30", () => {
    expect(engine.forecast(NOW, 30 * DAY_MS).map((e) => e.item.payload.name)).toEqual([
      "Sunita Rao",
      "Meera Joshi",
      "Dan Okafor",
    ])
    // Exactly 10 at day 30 is still flickering.
    expect(ghostedPolicy.healthAt(byName("Grace Liu"), NOW + 30 * DAY_MS)).toBe(10)
  })

  it("forecast over 7 days: nobody", () => {
    expect(engine.forecast(NOW, 7 * DAY_MS)).toEqual([])
  })
})
