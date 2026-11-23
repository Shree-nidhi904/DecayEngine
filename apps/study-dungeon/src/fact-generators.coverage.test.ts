// Generator Coverage Check for test/fact-generators.ts (task P5, task 23.2),
// following packages/engine/tests/properties/generator-coverage.test.ts and
// Ghosted's generator-coverage.test.ts. If a check fails, the generator is
// fixed, never the threshold (no-fake-tests.md). Fixed seeds, so every run
// samples the same facts.

import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { MINUTE_MS, T0, buildFacts, factAt, factsScenario, scenarioTimes } from "./test/fact-generators"

describe("fact generator coverage", () => {
  it("generated facts reach all three states: alive, weak and dead each at least 10% of facts", () => {
    const counts = { alive: 0, weak: 0, dead: 0 }
    for (const s of fc.sample(factsScenario(), { numRuns: 300, seed: 21 })) {
      const { engine, ids, now } = buildFacts(s)
      for (const id of ids) counts[factAt(engine, id, now).state]++
    }
    const total = counts.alive + counts.weak + counts.dead
    expect(total).toBeGreaterThanOrEqual(300)
    for (const state of ["alive", "weak", "dead"] as const) {
      expect(counts[state] / total, JSON.stringify(counts)).toBeGreaterThanOrEqual(0.1)
    }
  })

  it("right and wrong answers, and challenges of dead facts, all occur", () => {
    let right = 0
    let wrong = 0
    let challenges = 0
    for (const s of fc.sample(factsScenario(), { numRuns: 300, seed: 22 })) {
      for (const f of s.facts) {
        for (const st of f.steps) {
          if (st.correct) right++
          else wrong++
        }
      }
      const { engine, ids } = buildFacts(s)
      for (const id of ids) {
        challenges += engine.history(id).filter((e) => e.type === "resurrected" || e.type === "resurrect-failed").length
      }
    }
    const steps = right + wrong
    expect(steps).toBeGreaterThan(0)
    expect(right / steps).toBeGreaterThanOrEqual(0.1)
    expect(wrong / steps).toBeGreaterThanOrEqual(0.1)
    expect(challenges).toBeGreaterThan(0)
  })

  it("every time is T0 plus whole minutes; each fact's steps increase; now is after every step", () => {
    for (const s of fc.sample(factsScenario(), { numRuns: 300, seed: 23 })) {
      const { stepTimes, now } = scenarioTimes(s)
      for (const times of stepTimes) {
        let previous = T0
        for (const t of times) {
          expect(Number.isInteger((t - T0) / MINUTE_MS)).toBe(true)
          expect(t).toBeGreaterThanOrEqual(previous)
          previous = t
        }
        expect(now).toBeGreaterThanOrEqual(previous)
      }
      expect(Number.isInteger((now - T0) / MINUTE_MS)).toBe(true)
      expect(now - T0).toBeLessThanOrEqual((5 * 10 + 20) * 24 * 60 * MINUTE_MS)

      // buildFacts really used these times: every add, review and challenge is in the history at them.
      const { engine, ids, now: built } = buildFacts(s)
      expect(built).toBe(now)
      ids.forEach((id, i) => {
        const logged = engine
          .history(id)
          .filter((e) => e.type === "created" || e.type === "tended" || e.type === "resurrected" || e.type === "resurrect-failed")
          .map((e) => e.timestamp)
        expect(logged).toEqual([T0, ...stepTimes[i]!])
      })
    }
  })
})
