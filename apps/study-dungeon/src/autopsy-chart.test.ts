// Chart points for the autopsy (task 10.3). A real DecayEngine on
// InMemoryAdapter at fixed times; never the clock.
//
// Expected values are worked out from the spec (Requirements 1, 2 and 4):
// - health = H × 0.5^(elapsed / half-life); new 2, shaky 5, solid 10 days
// - right answer: health 100, half-life doubled; wrong: 45, half-life halved
// - dead below 10; a resurrection gives health 100 and keeps the half-life
// Death times come from the engine's bisection, which records a death at
// most a minute after the real crossing, so values at diedAt are checked
// to within 0.005 of the threshold.

import { describe, expect, it } from "vitest"
import { buildAutopsyChart, replayStretches } from "./autopsy-chart"
import { DAY_MS } from "./policy"
import { day, makeEngine } from "./test/fixtures"

const MINUTE = 60_000

/** Checks diedAt is within a minute after the crossing (engine bisection). */
function expectDiedNear(diedAt: number, crossing: number) {
  expect(diedAt).toBeGreaterThanOrEqual(crossing)
  expect(diedAt).toBeLessThanOrEqual(crossing + MINUTE)
}

describe("buildAutopsyChart: a fact never reviewed", () => {
  // Solid (half-life 10), added on day 0. Dies when 100 × 0.5^(t/10) < 10:
  // t = 10 × log2(10) ≈ 33.219 days.
  // Samples = 2: day 0, halfway, and the death.
  //   halfway: 100 × 0.5^(log2(10) / 2) = 100 / √10 ≈ 31.62
  //   death: just under 10
  it("samples the single stretch from creation to death", () => {
    const kit = makeEngine()
    kit.add("f", "solid", day(0))
    kit.engine.tick(day(40))
    const report = kit.engine.autopsy("f", day(40))
    expectDiedNear(report.diedAt, day(0) + 10 * Math.log2(10) * DAY_MS)

    const chart = buildAutopsyChart(kit.engine.history("f"), kit.viewOf("f", day(40)).payload, report, { samples: 2 })

    expect(chart.tends).toEqual([])
    expect(chart.points.map((p) => p.at)).toEqual([day(0), (day(0) + report.diedAt) / 2, report.diedAt])
    const [start, mid, end] = chart.points.map((p) => p.health)
    expect(start).toBe(100)
    expect(mid).toBeCloseTo(31.62, 2)
    expect(end).toBeCloseTo(10, 2)
    expect(end).toBeLessThan(10)
  })

  it("uses 48 steps by default: 49 points, evenly spaced, ending at the death", () => {
    const kit = makeEngine()
    kit.add("f", "solid", day(0))
    kit.engine.tick(day(40))
    const report = kit.engine.autopsy("f", day(40))
    const { points } = buildAutopsyChart(kit.engine.history("f"), kit.viewOf("f", day(40)).payload, report)
    expect(points).toHaveLength(49)
    expect(points[0]!.at).toBe(day(0))
    expect(points[48]!.at).toBe(report.diedAt)
    // Health never rises between events.
    for (let i = 1; i < points.length; i++) expect(points[i]!.health).toBeLessThan(points[i - 1]!.health)
  })
})

describe("buildAutopsyChart: a right and a wrong answer", () => {
  // New (half-life 2), added on day 0.
  //   day 1, right: before 100 × 0.5^(1/2) ≈ 70.71; after 100, half-life 4
  //   day 3, wrong: before 100 × 0.5^(2/4) ≈ 70.71; after 45, half-life 2
  //   dies when 45 × 0.5^(t/2) < 10: t = 2 × log2(4.5) ≈ 4.3399 days after day 3, day ≈ 7.3399
  function setup() {
    const kit = makeEngine()
    kit.add("f", "new", day(0))
    kit.engine.tend("f", { kind: "review", correct: true }, day(1))
    kit.engine.tend("f", { kind: "review", correct: false }, day(3))
    kit.engine.tick(day(10))
    const report = kit.engine.autopsy("f", day(10))
    expectDiedNear(report.diedAt, day(3) + 2 * Math.log2(4.5) * DAY_MS)
    return { kit, report, payload: kit.viewOf("f", day(10)).payload }
  }

  it("replays both reviews through the policy: half-life 2 → 4 → 2", () => {
    const { kit, payload } = setup()
    expect(replayStretches(kit.engine.history("f"), payload)).toEqual([
      { kind: "created", at: day(0), health: 100, halfLifeDays: 2 },
      { kind: "tended", at: day(1), health: 100, halfLifeDays: 4, correct: true },
      { kind: "tended", at: day(3), health: 45, halfLifeDays: 2, correct: false },
    ])
  })

  it("draws the health just before and just after each review, and marks both", () => {
    const { kit, report, payload } = setup()
    const chart = buildAutopsyChart(kit.engine.history("f"), payload, report, { samples: 1 })

    expect(chart.tends).toEqual([
      { at: day(1), correct: true },
      { at: day(3), correct: false },
    ])
    expect(chart.points.map((p) => p.at)).toEqual([day(0), day(1), day(1), day(3), day(3), report.diedAt])
    const h = chart.points.map((p) => p.health)
    expect(h[0]).toBe(100)
    expect(h[1]).toBeCloseTo(70.71, 2)
    expect(h[2]).toBe(100)
    expect(h[3]).toBeCloseTo(70.71, 2)
    expect(h[4]).toBe(45)
    expect(h[5]).toBeCloseTo(10, 2)
  })

  it("samples between reviews with the half-life in force then", () => {
    // Samples = 2: the halfway point is day ≈ 3.6699, after the wrong answer:
    // 45 × 0.5^(0.6699 / 2) ≈ 45 × 0.7928 ≈ 35.68 (with half-life 4 it would be ≈ 40.1).
    const { kit, report, payload } = setup()
    const chart = buildAutopsyChart(kit.engine.history("f"), payload, report, { samples: 2 })
    const mid = chart.points.find((p) => p.at === (day(0) + report.diedAt) / 2)!
    expect(mid.at).toBeGreaterThan(day(3))
    expect(mid.health).toBeCloseTo(35.68, 1)
    expect(chart.points).toHaveLength(7)
  })
})

describe("buildAutopsyChart: a resurrected fact", () => {
  // Shaky (half-life 5), added on day 0. Right on day 1: health 100, half-life 10.
  // First death: 10 × log2(10) ≈ 33.219 days later, day ≈ 34.219.
  // Challenged right on day 40: health 100, half-life still 10 (Requirement 4.1).
  // Second death: day 40 + 33.219 ≈ day 73.219.
  function setup() {
    const kit = makeEngine()
    kit.add("f", "shaky", day(0))
    kit.engine.tend("f", { kind: "review", correct: true }, day(1))
    expect(kit.engine.resurrect("f", { kind: "review", correct: true }, day(40))).toEqual({ ok: true })
    return kit
  }

  it("starts the second life from the half-life it died with, not from the knowledge level", () => {
    const kit = setup()
    // Dead only on the previewed day 80: nothing after day 40 is saved.
    expect(kit.engine.history("f").some((e) => e.type === "died" && e.timestamp > day(40))).toBe(false)
    const report = kit.engine.autopsy("f", day(80))
    expect(report.lifeStartedAt).toBe(day(40))
    expectDiedNear(report.diedAt, day(40) + 10 * Math.log2(10) * DAY_MS)
    const payload = kit.viewOf("f", day(80)).payload

    expect(replayStretches(kit.engine.history("f"), payload)).toEqual([
      { kind: "created", at: day(0), health: 100, halfLifeDays: 5 },
      { kind: "tended", at: day(1), health: 100, halfLifeDays: 10, correct: true },
      { kind: "resurrected", at: day(40), health: 100, halfLifeDays: 10 },
    ])

    // Samples = 2 over day 40 to the second death, at half-life 10:
    //   halfway 100 / √10 ≈ 31.62 (half-life 5 from "shaky" would give 10.0)
    const chart = buildAutopsyChart(kit.engine.history("f"), payload, report, { samples: 2 })
    expect(chart.points.map((p) => p.at)).toEqual([day(40), (day(40) + report.diedAt) / 2, report.diedAt])
    const [start, mid, end] = chart.points.map((p) => p.health)
    expect(start).toBe(100)
    expect(mid).toBeCloseTo(31.62, 2)
    expect(end).toBeCloseTo(10, 2)
    // The first life's review is not part of this life.
    expect(chart.tends).toEqual([])
  })

  it("marks only the reviews of the current life", () => {
    // Wrong on day 41: before 100 × 0.5^(1/10) ≈ 93.30; after 45, half-life 5.
    // Dies 5 × log2(4.5) ≈ 10.85 days later, day ≈ 51.85.
    const kit = setup()
    kit.engine.tend("f", { kind: "review", correct: false }, day(41))
    kit.engine.tick(day(60))
    const report = kit.engine.autopsy("f", day(60))
    expectDiedNear(report.diedAt, day(41) + 5 * Math.log2(4.5) * DAY_MS)

    const chart = buildAutopsyChart(kit.engine.history("f"), kit.viewOf("f", day(60)).payload, report, { samples: 1 })
    expect(chart.tends).toEqual([{ at: day(41), correct: false }])
    expect(chart.points.map((p) => p.at)).toEqual([day(40), day(41), day(41), report.diedAt])
    const h = chart.points.map((p) => p.health)
    expect(h[0]).toBe(100)
    expect(h[1]).toBeCloseTo(93.3, 2)
    expect(h[2]).toBe(45)
    expect(h[3]).toBeCloseTo(10, 2)
  })
})

describe("buildAutopsyChart: input checks", () => {
  it("rejects a sample count below 1 or not whole", () => {
    const kit = makeEngine()
    kit.add("f", "new", day(0))
    kit.engine.tick(day(10))
    const report = kit.engine.autopsy("f", day(10))
    const payload = kit.viewOf("f", day(10)).payload
    expect(() => buildAutopsyChart(kit.engine.history("f"), payload, report, { samples: 0 })).toThrow(/samples/)
    expect(() => buildAutopsyChart(kit.engine.history("f"), payload, report, { samples: 1.5 })).toThrow(/samples/)
  })
})
