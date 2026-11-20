// Tests for the hero stats (task 12.1, Requirement 12.4-12.5).
// Real engine on InMemoryAdapter for the history; fixed times only.
// Written by - Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import { describe, expect, it } from "vitest"
import { DecayEngine, InMemoryAdapter, type HistoryEntry } from "@decay-engine/engine"
import { DAY_MS, studyDungeonPolicy, type FactPayload, type FactPolicyData, type ReviewEvent } from "./policy"
import { allHistory, countSoulsBanished, currentStreak, previousDay } from "./stats"

const HOUR = 3_600_000
const D0 = Date.UTC(2026, 10, 1) // 1 Nov 2026 00:00 UTC
const at = (day: number, hour = 12) => D0 + day * DAY_MS + hour * HOUR

function engineWith(steps: Array<[day: number, hour: number, correct: boolean]>, knowledge: FactPayload["knowledge"] = "solid") {
  let n = 0
  const engine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(
    studyDungeonPolicy,
    new InMemoryAdapter(),
    () => `f${++n}`
  )
  const id = engine.addItem(
    { payload: { question: "q", answer: "a", why: "", knowledge }, importance: 1, costMinutes: 1 },
    at(0, 0)
  )
  for (const [day, hour, correct] of steps) engine.tend(id, { kind: "review", correct }, at(day, hour))
  return { engine, id }
}

/** Tended entries at the given (day, hour) pairs, without an engine. */
function reviewsAt(times: Array<[number, number]>): HistoryEntry[] {
  return times.map(([day, hour]) => ({
    type: "tended",
    itemId: "x",
    timestamp: at(day, hour),
    health: 100,
    event: { kind: "review", correct: true },
  }))
}

describe("countSoulsBanished", () => {
  it("counts only right answers in tended entries", () => {
    // 3 right, 2 wrong, on a solid fact (each step well before it could die).
    const { engine } = engineWith([
      [1, 12, true],
      [2, 12, false],
      [3, 12, true],
      [4, 12, false],
      [5, 12, true],
    ])
    expect(countSoulsBanished(allHistory(engine, at(6)))).toBe(3)
  })

  it("does not count resurrections, failed challenges or other entries", () => {
    // new 2: dies 2 × log2(10) ≈ 6.6 days after day 0.
    let n = 0
    const engine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(
      studyDungeonPolicy,
      new InMemoryAdapter(),
      () => `f${++n}`
    )
    const id = engine.addItem(
      { payload: { question: "q", answer: "a", why: "", knowledge: "new" }, importance: 1, costMinutes: 1 },
      at(0, 0)
    )
    engine.tend(id, { kind: "review", correct: true }, at(1)) // 1 soul; half-life 4, dies ≈ 13.3 days later
    engine.resurrect(id, { kind: "review", correct: false }, at(20)) // failed challenge
    engine.resurrect(id, { kind: "review", correct: true }, at(21)) // resurrected
    const entries = allHistory(engine, at(22))
    expect(entries.map((e) => e.type)).toEqual(
      expect.arrayContaining(["created", "tended", "died", "resurrect-failed", "resurrected"])
    )
    expect(countSoulsBanished(entries)).toBe(1)
  })

  it("is 0 with no history", () => {
    expect(countSoulsBanished([])).toBe(0)
  })
})

describe("currentStreak", () => {
  const utc = { timeZone: "UTC" }

  it("counts consecutive days ending today", () => {
    expect(currentStreak(reviewsAt([[3, 9], [4, 9], [5, 9]]), at(5, 20), utc)).toBe(3)
  })

  it("still counts a run that ended yesterday", () => {
    expect(currentStreak(reviewsAt([[3, 9], [4, 9]]), at(5, 20), utc)).toBe(2)
  })

  it("is 0 when the last review was the day before yesterday", () => {
    expect(currentStreak(reviewsAt([[2, 9], [3, 9]]), at(5, 20), utc)).toBe(0)
  })

  it("stops at the first day without a review", () => {
    // Days 1, 2, (gap 3), 4, 5: the streak ending on day 5 is 2.
    expect(currentStreak(reviewsAt([[1, 9], [2, 9], [4, 9], [5, 9]]), at(5, 20), utc)).toBe(2)
  })

  it("counts several reviews on one day once", () => {
    expect(currentStreak(reviewsAt([[5, 1], [5, 9], [5, 23]]), at(5, 23.5), utc)).toBe(1)
  })

  it("uses calendar days, not 24-hour gaps", () => {
    // 23:30 on day 4 and 00:30 on day 5 are one hour apart but two calendar days.
    expect(currentStreak(reviewsAt([[4, 23.5], [5, 0.5]]), at(5, 1), utc)).toBe(2)
    // 00:30 on day 3 and 23:30 on day 4 are 47 hours apart and still consecutive days.
    expect(currentStreak(reviewsAt([[3, 0.5], [4, 23.5]]), at(5, 1), utc)).toBe(2)
  })

  it("reads calendar days in the given time zone", () => {
    // 20:00 UTC on day 4 is 01:30 on day 5 in Kolkata (UTC+5:30); 06:00 UTC on day 5 is day 5 there too.
    const entries = reviewsAt([[4, 20], [5, 6]])
    expect(currentStreak(entries, at(5, 7), { timeZone: "UTC" })).toBe(2)
    expect(currentStreak(entries, at(5, 7), { timeZone: "Asia/Kolkata" })).toBe(1)
  })

  it("does not lose or double a day across a daylight-saving change", () => {
    // New York leaves daylight saving on 1 Nov 2026 at 02:00 local (a 25-hour day).
    // Reviews at noon local on 31 Oct, 1 Nov and 2 Nov: three consecutive days.
    const ny = (y: number, m: number, d: number, utcHour: number) => Date.UTC(y, m, d, utcHour)
    const entries: HistoryEntry[] = [ny(2026, 9, 31, 16), ny(2026, 10, 1, 17), ny(2026, 10, 2, 17)].map((t) => ({
      type: "tended",
      itemId: "x",
      timestamp: t,
      health: 100,
      event: { kind: "review", correct: true },
    }))
    expect(currentStreak(entries, ny(2026, 10, 2, 20), { timeZone: "America/New_York" })).toBe(3)
  })

  it("ignores reviews after now and entries that are not reviews", () => {
    const entries: HistoryEntry[] = [
      ...reviewsAt([[4, 9], [6, 9]]),
      { type: "created", itemId: "y", timestamp: at(5, 9), health: 100 },
    ]
    // Day 5 has only a "created" entry, day 6 is after now: the streak is day 4 alone (yesterday).
    expect(currentStreak(entries, at(5, 20), utc)).toBe(1)
    // A review later today (21:00, after now at 20:00) must not count either.
    expect(currentStreak([...entries, ...reviewsAt([[5, 21]])], at(5, 20), utc)).toBe(1)
  })

  it("counts reviews from the engine's real history", () => {
    // Reviews on days 1, 2 and 3 (right, wrong, right); now is day 3 evening.
    const { engine } = engineWith([
      [1, 10, true],
      [2, 10, false],
      [3, 10, true],
    ])
    expect(currentStreak(allHistory(engine, at(3, 20)), at(3, 20), utc)).toBe(3)
  })
})

describe("previousDay", () => {
  it("steps back across month and year ends and leap days", () => {
    expect(previousDay("2026-11-01")).toBe("2026-10-31")
    expect(previousDay("2027-01-01")).toBe("2026-12-31")
    expect(previousDay("2028-03-01")).toBe("2028-02-29")
    expect(previousDay("2027-03-01")).toBe("2027-02-28")
  })
})
