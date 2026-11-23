// Feature: ghosted, Property 16: the rescue line is a real gain (task R1,
// task 11.4; Req 37.3-37.5, 37.7, 37.14, design section 14.10).
//
// Real engines with ghostedPolicy, built by test/generators.ts (unchanged),
// plus two cases built here so the rarer branches occur often: a text after
// the first flicker, and a window lit again and dark again. Fixed times only.
//
// Expected values (design 14.5): a call at the flicker leaves the what-if
// window 40 points brighter than the real one from then on, so it goes dark
// 0.4 T = 1.2 × rhythm days later, give or take the engine's one-minute
// precision.

import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { DEATH_TIME_PRECISION_MS as P, whatIf } from "@decay-engine/insight"
import type { GhostedEngine } from "./engine-instance"
import { ghostedPolicy, type Person } from "./policy"
import { generateRescueSentence } from "./rescue-sentence"
import {
  DAY_MS,
  contactEvent,
  deadPerson,
  personAt,
  rhythmDays,
  spanMs,
  type Scenario,
} from "./test/generators"

const UTC = { timeZone: "UTC" }

type Case = { person: Person; now: number; engine: GhostedEngine }

const thousandths = (min: number, max: number) => fc.integer({ min, max }).map((n) => n / 1000)

const add = (rhythm: number, ageFraction: number): Scenario["add"] => ({
  name: "Ines Moreau",
  relationship: "Work",
  rhythmDays: rhythm,
  importance: 2,
  costMinutes: 10,
  ageFraction,
})

/**
 * Lit at the add (last contact 0 to 0.399 T old), then a text when the age is
 * 0.81 to 0.89 T (freshness 11 to 19: still flickering after it), then a
 * view 0.5 to 1.2 T later, after the window has gone dark (1.3 T − age after
 * the text).
 */
function textAfterFlicker(): fc.Arbitrary<Case> {
  return fc
    .record({ rhythm: rhythmDays(), age: thousandths(0, 399), at: thousandths(810, 890), view: thousandths(500, 1200) })
    .map(({ rhythm, age, at, view }) =>
      personAt({
        add: add(rhythm, age),
        steps: [{ afterFraction: at - age, event: { kind: "text" } }],
        viewFraction: view,
      })
    )
    .filter(({ person }) => person.state === "dead")
}

/** Lit at the add, dark after 1.0 T (a reconnect of any kind), dark again 0.95 to 1.2 T later. */
function litAgainDark(): fc.Arbitrary<Case> {
  return fc
    .record({ rhythm: rhythmDays(), age: thousandths(0, 399), event: contactEvent(), view: thousandths(950, 1200) })
    .map(({ rhythm, age, event, view }) =>
      personAt({ add: add(rhythm, age), steps: [{ afterFraction: 1, event }], viewFraction: view })
    )
    .filter(({ person }) => person.state === "dead")
}

/** Every generated dark person, a third from each source. */
const darkPerson = (): fc.Arbitrary<Case> => fc.oneof(deadPerson(), textAfterFlicker(), litAgainDark())

/** Words the line never uses (Req 37.7), and the banned phrases of wording.test.ts, built from pieces. */
const NEVER = /\b(die|dies|died|dying|dead|late|later|should)\b/i
const BANNED: readonly RegExp[] = [
  new RegExp(`doesn['’]t ${"ca" + "re"}`, "i"),
  new RegExp(`${"igno" + "red"} you`, "i"),
  new RegExp(`${"ghost" + "ed"} you`, "i"),
  new RegExp(`how much (?:someone|anyone|they|he|she) ${"ca" + "res"}`, "i"),
]

const N_OF = /, (\d+) days? longer\.$/

function look({ person, now, engine }: Case) {
  const report = engine.autopsy(person.id, now)
  const history = engine.history(person.id)
  return { report, history, line: generateRescueSentence(person, history, report, UTC) }
}

describe("Property 16: the rescue line is a real gain", () => {
  it("with a flicker: whatIf replays the life, goes dark later by 0.4 T, and the line's N follows the rule", () => {
    fc.assert(
      fc.property(darkPerson(), (c) => {
        const { report, history, line } = look(c)
        if (report.wentWeakAt === null) return
        const w = whatIf(ghostedPolicy, c.person, history, { at: report.wentWeakAt, event: { kind: "call" } })
        expect(w.ok).toBe(true)
        if (!w.ok) return
        expect(w.stoppedAt).toBeNull()
        expect(w.diesAt).not.toBeNull()
        expect(w.baselineDiesAt).not.toBeNull()
        const diesAt = w.diesAt!
        const base = w.baselineDiesAt!
        expect(Math.abs(base - report.diedAt)).toBeLessThanOrEqual(P)
        // Later than the real darkening, by 0.4 T within the engine's precision.
        expect(diesAt).toBeGreaterThan(report.diedAt)
        expect(Math.abs(diesAt - base - 0.4 * spanMs(c.person.payload.rhythmDays))).toBeLessThanOrEqual(2 * P)
        // The line is shown, and N is floor((diesAt − baselineDiesAt + P) / DAY_MS) of this independent call.
        expect(line).not.toBeNull()
        const n = Number(N_OF.exec(line!)?.[1])
        expect(n).toBe(Math.floor((diesAt - base + P) / DAY_MS))
        expect(n).toBeGreaterThanOrEqual(1)
      }),
      { numRuns: 100 }
    )
  })

  it("without a flicker in this life, no line", () => {
    fc.assert(
      fc.property(darkPerson(), (c) => {
        const { report, line } = look(c)
        if (report.wentWeakAt === null) expect(line).toBeNull()
      }),
      { numRuns: 100 }
    )
  })

  it("every line uses neutral words: no banned phrase, never die, dead, late or should", () => {
    fc.assert(
      fc.property(darkPerson(), (c) => {
        const { line } = look(c)
        if (line === null) return
        expect(NEVER.test(line), line).toBe(false)
        expect(BANNED.filter((b) => b.test(line)).map((b) => b.source), line).toEqual([])
      }),
      { numRuns: 100 }
    )
  })
})

describe("Property 16: the generated dark people reach every branch", () => {
  it("lines, texts after the flicker, lit again and no flicker each occur often (fixed seed)", () => {
    const samples = fc.sample(darkPerson(), { numRuns: 300, seed: 42 })
    let withLine = 0
    let textAfter = 0
    let litAgain = 0
    let noFlicker = 0
    for (const c of samples) {
      const { report, line } = look(c)
      if (line !== null) withLine++
      if (report.wentWeakAt === null) noFlicker++
      else if (report.tends.some((t) => t.at > report.wentWeakAt! && t.event.kind === "text")) textAfter++
      if (report.timesResurrected > 0 && report.wentWeakAt !== null) litAgain++
    }
    const share = (n: number) => n / samples.length
    const counts = JSON.stringify({ withLine, textAfter, litAgain, noFlicker, total: samples.length })
    expect(share(withLine), counts).toBeGreaterThanOrEqual(0.3)
    expect(share(textAfter), counts).toBeGreaterThanOrEqual(0.05)
    expect(share(litAgain), counts).toBeGreaterThanOrEqual(0.05)
    expect(share(noFlicker), counts).toBeGreaterThanOrEqual(0.05)
  })
})
