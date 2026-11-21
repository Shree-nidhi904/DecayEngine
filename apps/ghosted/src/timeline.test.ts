// The dock's markers (task 5.1; Req 12.4, design sections 4.4 MoonDock and
// 6.3). A real engine on InMemoryAdapter with the sample street replayed at
// T0, and hand-made people for the edges. Fixed times only, never the clock.
//
// The engine dates a death up to one minute after the moment health crosses
// 10 (it bisects at 1-minute precision, and exactly 10 is still weak), so
// dark markers are checked as "within one minute after" the worked-out day,
// and orders are checked exactly. Day labels are never compared after
// rounding; `day` is only checked against its own definition.

import { describe, expect, it } from "vitest"
import { MAX_FORECAST_HORIZON_MS } from "@decay-engine/engine"
import type { GhostedEngine } from "./engine-instance"
import type { PersonPayload } from "./policy"
import { loadSampleData } from "./sample-data"
import { DOCK_DAYS, dockMarkers, makeDayFormatter, markerLabel, type DockMarker } from "./timeline"
import { DAY_MS, MINUTE_MS, T0, day, makeEngine } from "./test/fixtures"

function sample() {
  const engine = makeEngine()
  loadSampleData(engine, T0)
  const people = engine.view(T0)
  const markers = dockMarkers(people, engine.forecast(T0, DOCK_DAYS * DAY_MS), T0)
  return { engine, people, markers }
}

function addPerson(engine: GhostedEngine, name: string, rhythmDays: number, lastContactAt: number): string {
  const payload: PersonPayload = { name, relationship: "", rhythmDays, lastContactAt }
  return engine.addItem({ payload, importance: 2, costMinutes: 10 }, T0)
}

/** How far `at` is past T0 + `days` days, in ms. */
const pastDay = (at: number, days: number) => at - (T0 + days * DAY_MS)

describe("dockMarkers on the sample street (design section 6.3)", () => {
  it("gives every start-fading and go-dark moment within the year, in time order", () => {
    const { markers } = sample()
    expect(markers.map((m) => [m.name, m.type])).toEqual([
      ["Sunita Rao", "fades"],
      ["Sam Rivera", "fades"],
      ["Sunita Rao", "dark"],
      ["Meera Joshi", "dark"],
      ["Priya Raman", "fades"],
      ["Dan Okafor", "dark"],
      ["Grace Liu", "dark"],
      ["Sam Rivera", "dark"],
      ["Nia Bello", "fades"],
      ["Priya Raman", "dark"],
      ["Nia Bello", "dark"],
      ["Joel Kim", "dark"],
    ])
  })

  it("fade markers sit within one minute of the policy's nextDueAt days", () => {
    const { markers } = sample()
    const fades = new Map(markers.filter((m) => m.type === "fades").map((m) => [m.name, m.at]))
    const expected: [string, number][] = [
      ["Sunita Rao", 2.4],
      ["Sam Rivera", 11.8],
      ["Priya Raman", 24],
      ["Nia Bello", 34],
    ]
    for (const [name, days] of expected) {
      expect(Math.abs(pastDay(fades.get(name)!, days)), name).toBeLessThanOrEqual(MINUTE_MS)
    }
  })

  it("dark markers fall within one minute after the moment freshness crosses 10", () => {
    const { markers } = sample()
    const dark = new Map(markers.filter((m) => m.type === "dark").map((m) => [m.name, m.at]))
    const expected: [string, number][] = [
      ["Sunita Rao", 12.9],
      ["Meera Joshi", 21.7],
      ["Dan Okafor", 25.5],
      ["Grace Liu", 30],
      ["Sam Rivera", 32.8],
      ["Priya Raman", 69],
      ["Nia Bello", 101.5],
      ["Joel Kim", 103],
    ]
    for (const [name, days] of expected) {
      const past = pastDay(dark.get(name)!, days)
      // 1 ms of slack for the fractional days written as decimals.
      expect(past, name).toBeGreaterThan(-1)
      expect(past, name).toBeLessThanOrEqual(MINUTE_MS + 1)
    }
  })

  it("the dark markers are exactly the engine's forecast, and nobody dark today has a marker", () => {
    const { engine, people, markers } = sample()
    const forecast = engine.forecast(T0, DOCK_DAYS * DAY_MS)
    expect(markers.filter((m) => m.type === "dark").map((m) => [m.id, m.at])).toEqual(
      forecast.map((e) => [e.item.id, e.diesAt])
    )
    const darkToday = people.filter((p) => p.state === "dead").map((p) => p.id)
    expect(darkToday).toHaveLength(4)
    expect(markers.filter((m) => darkToday.includes(m.id))).toEqual([])
    // A flickering person has already started fading: only their dark marker.
    const fadingToday = people.filter((p) => p.state === "weak").map((p) => p.id)
    expect(markers.filter((m) => fadingToday.includes(m.id)).every((m) => m.type === "dark")).toBe(true)
  })

  it("every marker's day is ceil((at − today) / DAY_MS), from 1 to 365", () => {
    const { markers } = sample()
    for (const m of markers) {
      expect(m.day).toBe(Math.ceil((m.at - T0) / DAY_MS))
      expect(m.day).toBeGreaterThanOrEqual(1)
      expect(m.day).toBeLessThanOrEqual(DOCK_DAYS)
    }
  })
})

describe("dockMarkers at the edges of the year", () => {
  it("keeps day 365 and leaves out day 366, even when the forecast reaches further", () => {
    const engine = makeEngine()
    // A last contact after today keeps freshness at 100 until then, so the fade
    // (60) comes 2T/5 after it: 360 days for a 300-day rhythm.
    const in365 = addPerson(engine, "Mira Castell", 300, day(5))
    const in366 = addPerson(engine, "Ana Ruiz", 300, day(6))
    const markers = dockMarkers(engine.view(T0), engine.forecast(T0, MAX_FORECAST_HORIZON_MS), T0)
    expect(markers.map((m) => [m.id, m.type, m.day])).toEqual([[in365, "fades", 365]])
    expect(markers[0]!.at).toBe(day(365))
    expect(markers.some((m) => m.id === in366)).toBe(false)
  })

  it("a person exactly at 60 today is fading now (day 0): no fade marker, only the dark one", () => {
    const engine = makeEngine()
    // 30-day rhythm, last contact 36 days ago: freshness exactly 60, still lit.
    const id = addPerson(engine, "Mira Castell", 30, day(-36))
    expect(engine.view(T0)[0]!.state).toBe("alive")
    const markers = dockMarkers(engine.view(T0), engine.forecast(T0, DOCK_DAYS * DAY_MS), T0)
    expect(markers.map((m) => [m.id, m.type])).toEqual([[id, "dark"]])
    // Dark 45 days later (81 days after the contact), within one minute after.
    const past = pastDay(markers[0]!.at, 45)
    expect(past).toBeGreaterThan(0)
    expect(past).toBeLessThanOrEqual(MINUTE_MS)
  })

  it("people further out than a year get no marker at all", () => {
    const engine = makeEngine()
    addPerson(engine, "Mira Castell", 365, T0) // fades on day 438
    expect(dockMarkers(engine.view(T0), engine.forecast(T0, MAX_FORECAST_HORIZON_MS), T0)).toEqual([])
  })

  it("ties in time are ordered by id", () => {
    const engine = makeEngine()
    const a = addPerson(engine, "Mira Castell", 30, T0)
    const b = addPerson(engine, "Ana Ruiz", 30, T0)
    const markers = dockMarkers(engine.view(T0), engine.forecast(T0, DOCK_DAYS * DAY_MS), T0)
    expect(markers.map((m) => [m.id, m.type])).toEqual([
      [a, "fades"],
      [b, "fades"],
      [a, "dark"],
      [b, "dark"],
    ])
  })
})

describe("markerLabel (Req 12.4)", () => {
  it('names the person, what happens and the date, as in "Mira Castell goes dark on 3 March"', () => {
    const engine = makeEngine()
    // T0 is 14 November 2023, 22:13:20 UTC. A 30-day rhythm contacted then
    // starts fading 36 days later (20 December, exactly) and goes dark just
    // after 81 days (3 February, 22:13:20 plus under a minute).
    addPerson(engine, "Mira Castell", 30, T0)
    const markers = dockMarkers(engine.view(T0), engine.forecast(T0, DOCK_DAYS * DAY_MS), T0)
    const formatDay = makeDayFormatter("UTC")
    expect(markers.map((m) => markerLabel(m, formatDay))).toEqual([
      "Mira Castell starts fading on 20 December",
      "Mira Castell goes dark on 3 February",
    ])
  })

  it("uses the marker's own name and type", () => {
    const marker: DockMarker = { id: "p1", name: "Ana Ruiz", type: "dark", at: Date.UTC(2024, 2, 3, 12), day: 110 }
    expect(markerLabel(marker, makeDayFormatter("UTC"))).toBe("Ana Ruiz goes dark on 3 March")
    expect(markerLabel({ ...marker, type: "fades" }, makeDayFormatter("UTC"))).toBe("Ana Ruiz starts fading on 3 March")
  })
})
