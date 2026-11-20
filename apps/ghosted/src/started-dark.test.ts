// Property 13: Started dark (task 3.6, design section 7.3; Req 19.6, 20.8).
// A person whose last contact is more than 9T/10 before the add is dead at
// creation, with "created" and "died" at the same moment, and the autopsy
// sentences name the whole-day gap and never say "0 days". Real engine,
// fixed times (test/generators.ts), never the real clock.

import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { generateCauseSentences } from "./autopsy-sentences"
import type { PersonPayload } from "./policy"
import { DAY_MS, startedDark } from "./test/generators"
import { makeEngine } from "./test/fixtures"

describe("a person added already dark", () => {
  // Feature: ghosted, Property 13: Started dark
  it("Property 13: is dead at creation, logged as created then died at the add, and the sentences name the gap in whole days", () => {
    fc.assert(
      fc.property(startedDark(), ({ rhythmDays, gapMs, addAt }) => {
        const engine = makeEngine()
        const payload: PersonPayload = {
          name: "Ines Moreau",
          relationship: "",
          rhythmDays,
          lastContactAt: addAt - gapMs,
        }
        const id = engine.addItem({ payload, importance: 1, costMinutes: 10 }, addAt)

        const person = engine.view(addAt).find((p) => p.id === id)!
        expect(person.state).toBe("dead")
        expect(person.diedAt).toBe(addAt)
        expect(engine.history(id).map((e) => [e.type, e.timestamp])).toEqual([
          ["created", addAt],
          ["died", addAt],
        ])

        const report = engine.autopsy(id, addAt)
        expect(report.lifeStartedAt).toBe(report.diedAt)
        expect(report.tends).toEqual([])

        const sentences = generateCauseSentences(report, payload, { timeZone: "UTC" })
        const days = Math.floor(gapMs / DAY_MS)
        expect(days).toBeGreaterThanOrEqual(1)
        expect(sentences.join(" ")).toContain(`${days} days`)
        for (const s of sentences) expect(s).not.toMatch(/\b0 days\b/)
      }),
      { numRuns: 100 }
    )
  })
})
