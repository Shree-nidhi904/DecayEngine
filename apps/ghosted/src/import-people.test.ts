// import-people.ts (Ghosted task 2.7; Requirements 21.5, 21.6, 17.1).
// Fixed timestamps only. T0 = 1_700_000_000_000 is 2023-11-14 22:13:20 UTC,
// so the import day in UTC is 2023-11-14.

import { describe, expect, it } from "vitest"
import { DecayEngine, InMemoryAdapter } from "@decay-engine/engine"
import { IMPORT_COST_MINUTES, IMPORT_IMPORTANCE, parseImport } from "./import-people"
import { ghostedPolicy, type ContactEvent, type PersonPayload, type PersonPolicyData } from "./policy"
import { importText, personFormRules } from "./wording"

const T0 = 1_700_000_000_000
const NOV_1 = Date.UTC(2023, 10, 1)

const parse = (text: string) => parseImport(text, T0, "UTC")

describe("parseImport: line formats", () => {
  it("reads name | relationship | rhythm | date", () => {
    expect(parse("Mira Castell | Cousin | 30 | 2023-11-01")).toEqual({
      people: [{ name: "Mira Castell", relationship: "Cousin", rhythmDays: 30, lastContactAt: NOV_1 }],
      skipped: [],
    })
  })

  it("reads tab-separated rows", () => {
    expect(parse("Mira Castell\tCousin\t30\t2023-11-01").people).toEqual([
      { name: "Mira Castell", relationship: "Cousin", rhythmDays: 30, lastContactAt: NOV_1 },
    ])
  })

  it("reads CSV, with quoted fields holding commas and quotes", () => {
    const text = ['Mira Castell,Cousin,30,2023-11-01', '"Reyes, Tomas","Old ""Blue"" team",14,'].join("\n")
    expect(parse(text).people).toEqual([
      { name: "Mira Castell", relationship: "Cousin", rhythmDays: 30, lastContactAt: NOV_1 },
      { name: "Reyes, Tomas", relationship: 'Old "Blue" team', rhythmDays: 14, lastContactAt: T0 },
    ])
  })

  it("takes the date as the start of that day in the given time zone", () => {
    // Auckland is UTC+13 on 1 November 2023, so its day starts at 11:00 UTC the day before.
    expect(parseImport("Mira | | 30 | 2023-11-01", T0, "Pacific/Auckland").people[0]!.lastContactAt).toBe(
      Date.UTC(2023, 9, 31, 11)
    )
  })
})

describe("parseImport: optional fields", () => {
  it("an empty relationship is kept as empty", () => {
    expect(parse("Mira Castell | | 30 | 2023-11-01").people).toEqual([
      { name: "Mira Castell", relationship: "", rhythmDays: 30, lastContactAt: NOV_1 },
    ])
  })

  it("no date, an empty date or a closing | means the import time", () => {
    for (const line of ["Mira | Cousin | 30", "Mira | Cousin | 30 |", "Mira | Cousin | 30 | ", "Mira | | 30 | |"]) {
      expect(parse(line).people, line).toEqual([
        { name: "Mira", relationship: line.includes("Cousin") ? "Cousin" : "", rhythmDays: 30, lastContactAt: T0 },
      ])
    }
  })

  it("a missing rhythm skips the line with the expected format", () => {
    for (const line of ["Mira Castell", "Mira Castell | Cousin", "Mira Castell | Cousin |  | 2023-11-01"]) {
      expect(parse(line), line).toEqual({ people: [], skipped: [{ line: 1, reason: importText.rhythmMissing }] })
    }
  })

  it("a missing rhythm also names the other broken rules", () => {
    expect(parse(" | Cousin").skipped).toEqual([
      { line: 1, reason: `${importText.rhythmMissing}; ${personFormRules.name}` },
    ])
  })

  it("more than four fields skips the line", () => {
    expect(parse("Mira | Cousin | 30 | 2023-11-01 | extra").skipped).toEqual([
      { line: 1, reason: importText.tooManyFields },
    ])
  })
})

describe("parseImport: form rules, line numbers and valid lines", () => {
  it("skips each line that breaks a form rule, with its 1-based line number and reason, and keeps the valid ones", () => {
    const text = [
      "# name | relationship | rhythm | last contact", // 1: ignored
      "Mira Castell | Cousin | 30 | 2023-11-01", //       2: valid
      "", //                                               3: ignored
      "Tomas Reyes | | 0", //                              4: rhythm too small
      "Ayesha Khan | | 30.5", //                           5: not whole
      `${"n".repeat(61)} | | 30`, //                        6: name too long
      `Leo Hart | ${"r".repeat(41)} | 30`, //               7: relationship too long
      "Grace Obi | | 30 | 2023-11-15", //                  8: later than today
      "Joel Park | | 30 | 2023-02-30", //                  9: not a real date
      "   ", //                                            10: ignored
      "Nia Bello | Old teammate | 365 | 2023-11-14", //   11: valid (today)
    ].join("\r\n")
    const result = parse(text)
    expect(result.people.map((p) => p.name)).toEqual(["Mira Castell", "Nia Bello"])
    expect(result.people[1]).toEqual({
      name: "Nia Bello",
      relationship: "Old teammate",
      rhythmDays: 365,
      lastContactAt: Date.UTC(2023, 10, 14),
    })
    expect(result.skipped).toEqual([
      { line: 4, reason: personFormRules.rhythmDays },
      { line: 5, reason: personFormRules.rhythmDays },
      { line: 6, reason: personFormRules.name },
      { line: 7, reason: personFormRules.relationship },
      { line: 8, reason: personFormRules.lastContactFuture },
      { line: 9, reason: personFormRules.lastContactDate },
    ])
  })

  it("joins several broken rules on one line", () => {
    expect(parse(`${"n".repeat(61)} | | 400 | 2099-01-01`).skipped).toEqual([
      { line: 1, reason: [personFormRules.name, personFormRules.rhythmDays, personFormRules.lastContactFuture].join("; ") },
    ])
  })

  it("adds repeated names as written", () => {
    expect(parse("Mira Castell | | 30\nMira Castell | | 30").people).toHaveLength(2)
  })

  it("empty text gives no people and no skipped lines", () => {
    expect(parse("")).toEqual({ people: [], skipped: [] })
    expect(parse("# only a comment\n\n")).toEqual({ people: [], skipped: [] })
  })
})

describe("imported people get importance 2 and 10 minutes", () => {
  it("the constants are 2 and 10, and the engine accepts imported people with them", () => {
    expect(IMPORT_IMPORTANCE).toBe(2)
    expect(IMPORT_COST_MINUTES).toBe(10)

    let n = 0
    const engine = new DecayEngine<PersonPayload, PersonPolicyData, ContactEvent>(
      ghostedPolicy,
      new InMemoryAdapter(),
      () => `id-${n++}`
    )
    const { people } = parse("Mira Castell | Cousin | 30 | 2023-11-01\nTomas Reyes | | 7")
    for (const payload of people) {
      engine.addItem({ payload, importance: IMPORT_IMPORTANCE, costMinutes: IMPORT_COST_MINUTES }, T0)
    }
    const view = engine.view(T0)
    expect(view.map((p) => [p.payload.name, p.importance, p.costMinutes, p.policyData.lastContactAt])).toEqual([
      ["Mira Castell", 2, 10, NOV_1],
      ["Tomas Reyes", 2, 10, T0],
    ])
  })
})
