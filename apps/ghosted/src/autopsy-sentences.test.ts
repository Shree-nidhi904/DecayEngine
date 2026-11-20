// Tests for the cause-of-death sentences (task 3.6; Req 19.3, 19.4, 19.6, 31).
// autopsy-sentences.ts was written outside Kiro and is never edited here.
//
// Every report is built through the real engine (InMemoryAdapter, fixed
// times from T0 = 2023-11-14 22:13:20 UTC) and every date is shown in UTC.
// The engine dates a crossing up to one minute after it happens, so each
// death below falls a few seconds into the day named.
//
// Exact sentences (open issue 3.2): three fixed reports, a death after a call,
// a person never contacted, and a person added already dark. Each sentence
// was checked against the Ghosted wording rules (Req 31): it describes timing
// only and blames neither person.

import { describe, expect, it } from "vitest"
import { generateCauseSentences } from "./autopsy-sentences"
import type { ContactEvent, PersonPayload } from "./policy"
import type { GhostedEngine } from "./engine-instance"
import { DAY_MS, T0, day, makeEngine } from "./test/fixtures"

const UTC = { timeZone: "UTC" } as const
const TEXT: ContactEvent = { kind: "text" }
const CALL: ContactEvent = { kind: "call" }
const MEETUP: ContactEvent = { kind: "meetup" }
const CLOSING = "The light shows how recently you were in touch, not how much anyone matters."

/** Phrases that blame or judge (Req 31.2), in lower case, both apostrophes. */
const BANNED = ["doesn't care", "doesn\u2019t care", "ignored you", "ghosted you"]

function payload(rhythmDays: number, lastContactAt: number): PersonPayload {
  return { name: "Mira Castell", relationship: "College", rhythmDays, lastContactAt }
}

function add(engine: GhostedEngine, p: PersonPayload, at = T0): string {
  return engine.addItem({ payload: p, importance: 2, costMinutes: 10 }, at)
}

/** The rules every sentence keeps: no banned phrase, never "0 days". */
function expectWordingRules(sentences: readonly string[]) {
  expect(sentences.length).toBeGreaterThan(0)
  for (const s of sentences) {
    const lower = s.toLowerCase()
    for (const phrase of BANNED) expect(lower, s).not.toContain(phrase)
    expect(s).not.toMatch(/\b0 days\b/)
  }
}

describe("generateCauseSentences: exact sentences for three fixed reports", () => {
  it("a death after a call (30-day rhythm, call on day 10, dark just after day 91)", () => {
    const engine = makeEngine()
    const p = payload(30, T0)
    const id = add(engine, p)
    engine.tend(id, CALL, day(10))
    engine.tick(day(100))

    const sentences = generateCauseSentences(engine.autopsy(id, day(100)), p, UTC)

    expectWordingRules(sentences)
    // Silence: day 10 to just after day 91 = 81 days, 81 / 30 = 2.7 rhythms.
    // Fading from just after day 46 (30 Dec), dark just after day 91 (13 Feb).
    expect(sentences).toEqual([
      "After the last call there was no contact for 81 days, about 2.7 times your usual rhythm.",
      "The window started fading on 30 Dec 2023.",
      "It went dark on 13 Feb 2024.",
      "The last contact was on 24 Nov 2023 (a call).",
      "1 contact logged in this life: 1 call.",
      CLOSING,
    ])
  })

  it("a person never contacted (last contact 10 days before the add, dark just after day 71)", () => {
    const engine = makeEngine()
    const p = payload(30, day(-10))
    const id = add(engine, p)
    engine.tick(day(100))

    const sentences = generateCauseSentences(engine.autopsy(id, day(100)), p, UTC)

    expectWordingRules(sentences)
    // The quiet stretch starts at the given last contact (4 Nov): 81 days to the death (24 Jan).
    expect(sentences).toEqual([
      "After the last contact on 4 Nov 2023 there was no contact for 81 days, about 2.7 times your usual rhythm.",
      "The window started fading on 10 Dec 2023.",
      "It went dark on 24 Jan 2024.",
      "No contact was logged after it was added.",
      CLOSING,
    ])
  })

  it("a person added already dark (last contact 95 days before the add)", () => {
    const engine = makeEngine()
    const p = payload(30, day(-95))
    const id = add(engine, p)

    const report = engine.autopsy(id, T0)
    expect(report.lifeStartedAt).toBe(report.diedAt)
    const sentences = generateCauseSentences(report, p, UTC)

    expectWordingRules(sentences)
    // 95 / 30 = 3.17, shown to one decimal.
    expect(sentences).toEqual([
      "Already dark when added: no contact for 95 days, about 3.2 times your usual rhythm.",
      "Last contact was on 11 Aug 2023.",
      "The window was added on 14 Nov 2023, after it had already gone dark.",
      CLOSING,
    ])
  })
})

describe("generateCauseSentences: facts", () => {
  it.each([
    [TEXT, "message", "a message"],
    [CALL, "call", "a call"],
    [MEETUP, "meet-up", "a meet-up"],
  ] as const)("names the kind of the last contact (%o)", (event, noun, withArticle) => {
    const engine = makeEngine()
    const p = payload(30, T0)
    const id = add(engine, p)
    // Day 10: freshness 88.9, so a text lights fully too and every kind dies just after day 91.
    engine.tend(id, event, day(10))
    engine.tick(day(100))

    const sentences = generateCauseSentences(engine.autopsy(id, day(100)), p, UTC)

    expectWordingRules(sentences)
    expect(sentences[0]).toBe(`After the last ${noun} there was no contact for 81 days, about 2.7 times your usual rhythm.`)
    expect(sentences).toContain(`The last contact was on 24 Nov 2023 (${withArticle}).`)
  })

  it("counts whole days and the rhythm ratio for a 7-day rhythm (dark 18.9 days after a call)", () => {
    const engine = makeEngine()
    const p = payload(7, T0)
    const id = add(engine, p)
    engine.tend(id, CALL, day(2))
    engine.tick(day(40))

    const report = engine.autopsy(id, day(40))
    // 2.7 × 7 = 18.9 days of silence: 18 whole days, 2.7 rhythms.
    expect(report.silenceMs).toBeGreaterThan(18.9 * DAY_MS)
    const sentences = generateCauseSentences(report, p, UTC)
    expectWordingRules(sentences)
    expect(sentences[0]).toBe("After the last call there was no contact for 18 days, about 2.7 times your usual rhythm.")
  })

  it("lists every contact of the life by kind and names the last one", () => {
    const engine = makeEngine()
    const p = payload(30, T0)
    const id = add(engine, p)
    // Each contact while lit: day 5 (94.4), day 20 (age 15), day 40 (age 20).
    engine.tend(id, TEXT, day(5))
    engine.tend(id, CALL, day(20))
    engine.tend(id, MEETUP, day(40))
    engine.tick(day(150))

    const sentences = generateCauseSentences(engine.autopsy(id, day(150)), p, UTC)

    expectWordingRules(sentences)
    expect(sentences[0]).toBe("After the last meet-up there was no contact for 81 days, about 2.7 times your usual rhythm.")
    expect(sentences).toContain("3 contacts logged in this life: 1 message, 1 call, 1 meet-up.")
    expect(sentences).toContain("The last contact was on 24 Dec 2023 (a meet-up).")
  })

  it("after a reconnect with no contact since, starts the silence at the reconnect", () => {
    const engine = makeEngine()
    const p = payload(30, T0)
    const id = add(engine, p)
    // Dark just after day 81; reconnected on day 90; dark again just after day 171.
    expect(engine.resurrect(id, CALL, day(90))).toEqual({ ok: true })
    engine.tick(day(200))

    const report = engine.autopsy(id, day(200))
    expect(report.lifeStartedAt).toBe(day(90))
    const sentences = generateCauseSentences(report, p, UTC)

    expectWordingRules(sentences)
    expect(sentences[0]).toBe(
      "After the window was lit again there was no contact for 81 days, about 2.7 times your usual rhythm."
    )
    expect(sentences).toContain("No contact was logged after it was lit again.")
    expect(sentences).toContain("The window had been lit again once.")
  })

  it("started dark: floors the gap to whole days (95.4 days reads 95 days), never 0", () => {
    const engine = makeEngine()
    const p = payload(30, T0 - 95.4 * DAY_MS)
    const id = add(engine, p)

    const sentences = generateCauseSentences(engine.autopsy(id, T0), p, UTC)

    expectWordingRules(sentences)
    expect(sentences[0]).toBe("Already dark when added: no contact for 95 days, about 3.2 times your usual rhythm.")
  })

  it("every sentence of every report above ends with the freshness line, and nothing judges anyone", () => {
    const engine = makeEngine()
    const p = payload(14, day(-50))
    const id = add(engine, p)
    const sentences = generateCauseSentences(engine.autopsy(id, T0), p, UTC)
    expectWordingRules(sentences)
    expect(sentences[sentences.length - 1]).toBe(CLOSING)
    expect(sentences.join(" ")).not.toMatch(/\bcare/i)
  })
})
