// person-form.ts (Ghosted task 2.6; Requirements 17.1, 17.3, 17.7).
// Fixed timestamps only. T0 = 1_700_000_000_000 is 2023-11-14 22:13:20 UTC.

import { describe, expect, it } from "vitest"
import { startsDark, validatePerson, type PersonFormInput } from "./person-form"
import { DAY_MS } from "./time"
import { personFormRules } from "./wording"

const T0 = 1_700_000_000_000
const MINUTE_MS = 60_000

const valid: PersonFormInput = {
  name: "Mira Castell",
  relationship: "Cousin",
  rhythmDays: "30",
  lastContact: "2023-11-01",
  importance: 2,
  costMinutes: "10",
}

const check = (changes: Partial<PersonFormInput>, today = T0, timeZone = "UTC") =>
  validatePerson({ ...valid, ...changes }, today, timeZone)

describe("validatePerson", () => {
  it("accepts a valid person", () => {
    expect(check({})).toEqual([])
  })

  it("name: 1 and 60 characters pass, empty, spaces only and 61 fail", () => {
    expect(check({ name: "M" })).toEqual([])
    expect(check({ name: "m".repeat(60) })).toEqual([])
    expect(check({ name: `  ${"m".repeat(60)}  ` })).toEqual([]) // trimmed first
    for (const name of ["", "   ", "m".repeat(61)]) {
      expect(check({ name })).toEqual([{ field: "name", rule: personFormRules.name }])
    }
  })

  it("relationship: empty and 40 characters pass, 41 fails", () => {
    expect(check({ relationship: "" })).toEqual([])
    expect(check({ relationship: "r".repeat(40) })).toEqual([])
    expect(check({ relationship: "r".repeat(41) })).toEqual([
      { field: "relationship", rule: personFormRules.relationship },
    ])
  })

  it("rhythm: whole numbers 1 and 365 pass; 0, 366, fractions, exponents, signs, text and empty fail", () => {
    expect(check({ rhythmDays: "1" })).toEqual([])
    expect(check({ rhythmDays: "365" })).toEqual([])
    expect(check({ rhythmDays: " 30 " })).toEqual([])
    for (const rhythmDays of ["0", "366", "30.5", "3e1", "-2", "+3", "abc", ""]) {
      expect(check({ rhythmDays }), rhythmDays).toEqual([{ field: "rhythmDays", rule: personFormRules.rhythmDays }])
    }
  })

  it("last contact: today passes, tomorrow is later than today", () => {
    expect(check({ lastContact: "2023-11-14" })).toEqual([])
    expect(check({ lastContact: "2023-11-15" })).toEqual([
      { field: "lastContact", rule: personFormRules.lastContactFuture },
    ])
  })

  it("last contact: empty, another format and an impossible date are not a date", () => {
    for (const lastContact of ["", "14/11/2023", "2023-2-1", "2023-02-30"]) {
      expect(check({ lastContact }), lastContact).toEqual([
        { field: "lastContact", rule: personFormRules.lastContactDate },
      ])
    }
  })

  it("last contact: 'today' is the calendar day in the given time zone", () => {
    // 2024-01-01 12:00 UTC is 2024-01-02 01:00 in Auckland (UTC+13 in January).
    const today = Date.UTC(2024, 0, 1, 12)
    expect(check({ lastContact: "2024-01-02" }, today, "UTC")).toEqual([
      { field: "lastContact", rule: personFormRules.lastContactFuture },
    ])
    expect(check({ lastContact: "2024-01-02" }, today, "Pacific/Auckland")).toEqual([])
  })

  it("importance: 1, 2 and 3 pass; 0, 4 and 2.5 fail", () => {
    for (const importance of [1, 2, 3]) expect(check({ importance })).toEqual([])
    for (const importance of [0, 4, 2.5]) {
      expect(check({ importance }), String(importance)).toEqual([
        { field: "importance", rule: personFormRules.importance },
      ])
    }
  })

  it("minutes: whole numbers 1 and 600 pass; 0, 601, 1.5 and empty fail", () => {
    expect(check({ costMinutes: "1" })).toEqual([])
    expect(check({ costMinutes: "600" })).toEqual([])
    for (const costMinutes of ["0", "601", "1.5", ""]) {
      expect(check({ costMinutes }), costMinutes).toEqual([
        { field: "costMinutes", rule: personFormRules.costMinutes },
      ])
    }
  })

  it("names every broken field with its rule, in field order", () => {
    expect(
      check({ name: "", relationship: "r".repeat(41), rhythmDays: "0", lastContact: "2099-01-01", importance: 4, costMinutes: "0" })
    ).toEqual([
      { field: "name", rule: personFormRules.name },
      { field: "relationship", rule: personFormRules.relationship },
      { field: "rhythmDays", rule: personFormRules.rhythmDays },
      { field: "lastContact", rule: personFormRules.lastContactFuture },
      { field: "importance", rule: personFormRules.importance },
      { field: "costMinutes", rule: personFormRules.costMinutes },
    ])
  })

  it("never changes the input, so the form keeps what the user typed", () => {
    const input: PersonFormInput = { ...valid, name: "  ", rhythmDays: "30.5 " }
    const before = structuredClone(input)
    validatePerson(input, T0, "UTC")
    expect(input).toEqual(before)
  })
})

describe("startsDark", () => {
  // 9T/10 with T = 3 × rhythm days: exactly 2.7 × rhythm days, a whole number of ms.
  const ninetyPercentOfT = (rhythmDays: number) => (27 * rhythmDays * DAY_MS) / 10

  it.each([1, 7, 30, 365])("rhythm %i: not dark at exactly 2.7 × rhythm days, dark one minute later", (rhythm) => {
    const gap = ninetyPercentOfT(rhythm)
    expect(Number.isInteger(gap)).toBe(true)
    expect(startsDark(rhythm, T0 - gap, T0)).toBe(false)
    expect(startsDark(rhythm, T0 - gap - MINUTE_MS, T0)).toBe(true)
  })

  it("a recent or future last contact is not dark", () => {
    expect(startsDark(30, T0, T0)).toBe(false)
    expect(startsDark(30, T0 - 10 * DAY_MS, T0)).toBe(false)
    expect(startsDark(30, T0 + DAY_MS, T0)).toBe(false)
  })

  it("a last contact long ago is dark", () => {
    expect(startsDark(30, T0 - 200 * DAY_MS, T0)).toBe(true)
  })
})
