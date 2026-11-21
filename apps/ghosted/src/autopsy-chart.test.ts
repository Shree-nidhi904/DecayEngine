// buildAutopsyChart (task 4.11; Req 19.2, 19.6, 28). Reports and histories
// come from a real engine on InMemoryAdapter at fixed times; every expected
// freshness is worked out by hand from Requirement 1 (straight line to 0 at
// 3 × rhythm days) and Requirement 2 (a text adds 40, a call or meet-up
// lights fully).

import { describe, expect, it } from "vitest"
import { AUTOPSY_SAMPLES, buildAutopsyChart, startedDark } from "./autopsy-chart"
import type { GhostedEngine } from "./engine-instance"
import type { PersonPayload } from "./policy"
import { DAY_MS, MINUTE_MS, T0, day, makeEngine } from "./test/fixtures"

/** Mira: 30-day rhythm (T = 90 days), last contact at T0. */
const MIRA: PersonPayload = { name: "Mira Castell", relationship: "Work", rhythmDays: 30, lastContactAt: T0 }

/** Added at T0; a text on day 20, a call on day 40, a meet-up on day 60; dark just after day 141. */
function contactedLife() {
  const engine: GhostedEngine = makeEngine()
  const id = engine.addItem({ payload: MIRA, importance: 2, costMinutes: 10 }, T0)
  engine.tend(id, { kind: "text" }, day(20))
  engine.tend(id, { kind: "call" }, day(40))
  engine.tend(id, { kind: "meetup" }, day(60))
  const at = day(150)
  const report = engine.autopsy(id, at)
  return { engine, id, report, history: engine.history(id) }
}

const freshness = (ageDays: number, rhythmDays = 30) => Math.max(0, 100 * (1 - ageDays / (3 * rhythmDays)))

describe("buildAutopsyChart: a life with contacts", () => {
  it("runs from the start of this life to going dark, in time order", () => {
    const { report, history } = contactedLife()
    const { points } = buildAutopsyChart(history, MIRA, report)
    expect(points[0]).toEqual({ at: T0, health: 100 })
    expect(points[points.length - 1]!.at).toBe(report.diedAt)
    // Dark once below 10: the death is dated up to one minute after day 141.
    expect(report.diedAt - day(141)).toBeGreaterThan(0)
    expect(report.diedAt - day(141)).toBeLessThanOrEqual(MINUTE_MS)
    expect(points[points.length - 1]!.health).toBeLessThan(10)
    for (let i = 1; i < points.length; i++) expect(points[i]!.at).toBeGreaterThanOrEqual(points[i - 1]!.at)
  })

  it(`has ${AUTOPSY_SAMPLES} even steps plus a point just before and just after each contact`, () => {
    const { report, history } = contactedLife()
    const { points } = buildAutopsyChart(history, MIRA, report)
    expect(points).toHaveLength(AUTOPSY_SAMPLES + 1 + 2 * 3)

    const at = (t: number) => points.filter((p) => p.at === t).map((p) => p.health)
    // Day 20: 20 days into 90, freshness 77.78; the text adds 40, capped at 100.
    expect(at(day(20))[0]).toBeCloseTo(freshness(20), 9)
    expect(at(day(20))[1]).toBe(100)
    // Day 40: 20 days after the text lit it fully; the call lights it again.
    expect(at(day(40))[0]).toBeCloseTo(freshness(20), 9)
    expect(at(day(40))[1]).toBe(100)
    expect(at(day(60))[0]).toBeCloseTo(freshness(20), 9)
    expect(at(day(60))[1]).toBe(100)
  })

  it("every sample after the last contact follows the straight line from it", () => {
    const { report, history } = contactedLife()
    const { points } = buildAutopsyChart(history, MIRA, report)
    const after = points.filter((p) => p.at > day(60))
    expect(after.length).toBeGreaterThan(10)
    for (const p of after) expect(p.health).toBeCloseTo(freshness((p.at - day(60)) / DAY_MS), 9)
  })

  it("has one marker per contact, with its kind and label", () => {
    const { report, history } = contactedLife()
    const { markers } = buildAutopsyChart(history, MIRA, report)
    expect(markers).toEqual([
      { at: day(20), kind: "text", label: "Message" },
      { at: day(40), kind: "call", label: "Call" },
      { at: day(60), kind: "meetup", label: "Meet-up" },
    ])
  })

  it("is not a started-dark life", () => {
    expect(startedDark(contactedLife().report)).toBe(false)
  })
})

describe("buildAutopsyChart: a life after a reconnect", () => {
  it("starts at the reconnect, fully lit, and replays only the contacts of this life", () => {
    const engine = makeEngine()
    // Dark when added (100 days > 2.7 × 30), reconnected by a call on day 10, then a text on day 30.
    const id = engine.addItem({ payload: { ...MIRA, lastContactAt: day(-100) }, importance: 2, costMinutes: 10 }, T0)
    expect(engine.resurrect(id, { kind: "call" }, day(10)).ok).toBe(true)
    engine.tend(id, { kind: "text" }, day(30))
    const report = engine.autopsy(id, day(200))
    const { points, markers } = buildAutopsyChart(engine.history(id), { ...MIRA, lastContactAt: day(-100) }, report)

    expect(report.lifeStartedAt).toBe(day(10))
    expect(points[0]).toEqual({ at: day(10), health: 100 })
    const atText = points.filter((p) => p.at === day(30)).map((p) => p.health)
    expect(atText[0]).toBeCloseTo(freshness(20), 9)
    expect(atText[1]).toBe(100)
    expect(markers).toEqual([{ at: day(30), kind: "text", label: "Message" }])
    expect(points[points.length - 1]!.at).toBe(report.diedAt)
  })
})

describe("buildAutopsyChart: a person who started dark (Req 19.6)", () => {
  function startedDarkLife() {
    const engine = makeEngine()
    // Last contact 100 days before T0, rhythm 30: dark from the moment they are added.
    const payload: PersonPayload = { ...MIRA, name: "Tomas Novak", lastContactAt: day(-100) }
    const id = engine.addItem({ payload, importance: 1, costMinutes: 20 }, T0)
    const report = engine.autopsy(id, T0)
    return { payload, report, history: engine.history(id) }
  }

  it("is recognised: the life starts and ends at the same moment, with no contact", () => {
    const { report } = startedDarkLife()
    expect(report.lifeStartedAt).toBe(report.diedAt)
    expect(startedDark(report)).toBe(true)
  })

  it("draws a line from the last contact given to the time the window went dark, never a single point", () => {
    const { payload, report, history } = startedDarkLife()
    const { points, markers } = buildAutopsyChart(history, payload, report)
    expect(points).toHaveLength(AUTOPSY_SAMPLES + 1)
    expect(points[0]).toEqual({ at: day(-100), health: 100 })
    expect(points[points.length - 1]).toEqual({ at: T0, health: 0 })
    expect(new Set(points.map((p) => p.at)).size).toBe(points.length)
    // Halfway along (50 days), the straight line is at 100 × (1 − 50 / 90).
    const middle = points[AUTOPSY_SAMPLES / 2]!
    expect(middle.at).toBe(day(-50))
    expect(middle.health).toBeCloseTo(freshness(50), 9)
    expect(markers).toEqual([])
  })
})
