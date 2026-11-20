// time.ts: day starts in fixed time zones and whole-day gaps. Fixed
// timestamps only; never the real clock.

import { describe, expect, it } from "vitest"
import { DAY_MS, dayStartOf, wholeDaysBetween } from "./time"

const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000
const T0 = 1_700_000_000_000

describe("DAY_MS", () => {
  it("is 86 400 000", () => {
    expect(DAY_MS).toBe(86_400_000)
  })
})

describe("dayStartOf", () => {
  it("is UTC midnight with timeZone UTC", () => {
    expect(dayStartOf("2026-10-01", "UTC")).toBe(Date.UTC(2026, 9, 1))
    expect(dayStartOf("2028-02-29", "UTC")).toBe(Date.UTC(2028, 1, 29))
    expect(dayStartOf("1970-01-01", "UTC")).toBe(0)
  })

  it("moves by exactly one day between consecutive dates in UTC", () => {
    expect(dayStartOf("2026-12-31", "UTC") + DAY_MS).toBe(dayStartOf("2027-01-01", "UTC"))
  })

  it("is local midnight in a zone with a half-hour offset (Asia/Kolkata, UTC+5:30)", () => {
    expect(dayStartOf("2026-10-01", "Asia/Kolkata")).toBe(Date.UTC(2026, 9, 1) - 5.5 * HOUR_MS)
  })

  it("follows New York across the spring clock change (EST −5 before, EDT −4 after)", () => {
    // Clocks go forward at 02:00 on 8 March 2026; midnight that day is still EST.
    expect(dayStartOf("2026-03-08", "America/New_York")).toBe(Date.UTC(2026, 2, 8, 5))
    expect(dayStartOf("2026-03-09", "America/New_York")).toBe(Date.UTC(2026, 2, 9, 4))
    // That day is only 23 hours long.
    expect(dayStartOf("2026-03-09", "America/New_York") - dayStartOf("2026-03-08", "America/New_York")).toBe(
      23 * HOUR_MS
    )
  })

  it("follows New York across the autumn clock change (EDT −4 before, EST −5 after)", () => {
    expect(dayStartOf("2026-11-01", "America/New_York")).toBe(Date.UTC(2026, 10, 1, 4))
    expect(dayStartOf("2026-11-02", "America/New_York")).toBe(Date.UTC(2026, 10, 2, 5))
  })

  it("rejects text that is not a real YYYY-MM-DD date", () => {
    for (const bad of ["2027-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "26-10-01", "2026-10-1", "", "2026/10/01"]) {
      expect(() => dayStartOf(bad, "UTC"), bad).toThrow(RangeError)
    }
  })
})

describe("wholeDaysBetween", () => {
  it("rounds down to whole days", () => {
    expect(wholeDaysBetween(T0, T0)).toBe(0)
    expect(wholeDaysBetween(T0, T0 + DAY_MS - MINUTE_MS)).toBe(0)
    expect(wholeDaysBetween(T0, T0 + DAY_MS)).toBe(1)
    expect(wholeDaysBetween(T0, T0 + 23.5 * DAY_MS)).toBe(23)
    expect(wholeDaysBetween(T0, T0 + 365 * DAY_MS)).toBe(365)
  })

  it("is negative when the second time is earlier", () => {
    expect(wholeDaysBetween(T0, T0 - 1)).toBe(-1)
    expect(wholeDaysBetween(T0, T0 - 2 * DAY_MS)).toBe(-2)
  })

  it("counts the days between two day starts", () => {
    expect(wholeDaysBetween(dayStartOf("2026-10-01", "UTC"), dayStartOf("2026-10-24", "UTC"))).toBe(23)
  })
})
