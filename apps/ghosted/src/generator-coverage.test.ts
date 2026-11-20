// Generator Coverage Check for the Ghosted generators (task 3.2, design
// section 7.2), following packages/engine/tests/properties/generator-coverage.test.ts.
// If a check fails, the generator is fixed, never the threshold
// (no-fake-tests.md). Fixed seeds, so every run samples the same people.

import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { MINUTE_MS, T0, buildScenario, personAt, scenario, scenarioTimes } from "./test/generators"

describe("generator coverage", () => {
  // Feature: ghosted, Generator coverage: lit, flickering and boarded-up people all occur often
  it("generated people reach all three states", () => {
    const samples = fc.sample(scenario(), { numRuns: 300, seed: 42 })
    const counts = { alive: 0, weak: 0, dead: 0 }
    for (const s of samples) counts[personAt(s).person.state]++
    const total = counts.alive + counts.weak + counts.dead
    expect(total).toBe(300)
    for (const state of ["alive", "weak", "dead"] as const) {
      expect(counts[state] / total, JSON.stringify(counts)).toBeGreaterThanOrEqual(0.1)
    }
  })

  // Feature: ghosted, Generator coverage: every contact kind occurs often
  it("every contact kind is at least 10% of generated steps", () => {
    const samples = fc.sample(scenario(), { numRuns: 300, seed: 7 })
    const counts = { text: 0, call: 0, meetup: 0 }
    for (const s of samples) for (const st of s.steps) counts[st.event.kind]++
    const total = counts.text + counts.call + counts.meetup
    expect(total, "no steps were generated").toBeGreaterThan(0)
    for (const kind of ["text", "call", "meetup"] as const) {
      expect(counts[kind] / total, JSON.stringify(counts)).toBeGreaterThanOrEqual(0.1)
    }
  })

  // Feature: ghosted, Generator coverage: reconnects occur often
  it("at least 5% of scenarios contain a reconnect (a step on a dead person)", () => {
    const samples = fc.sample(scenario(), { numRuns: 300, seed: 9 })
    let withReconnect = 0
    for (const s of samples) {
      const { engine, id } = buildScenario(s)
      if (engine.history(id).some((e) => e.type === "resurrected")) withReconnect++
    }
    expect(withReconnect / samples.length, `${withReconnect} of ${samples.length}`).toBeGreaterThanOrEqual(0.05)
  })

  // Feature: ghosted, Generator coverage: times are whole minutes from T0 and never decrease
  it("every time buildScenario uses is T0 plus whole minutes, in non-decreasing order", () => {
    const samples = fc.sample(scenario(), { numRuns: 300, seed: 11 })
    for (const s of samples) {
      const { addAt, lastContactAt, stepTimes, viewAt } = scenarioTimes(s)
      const times = [addAt, ...stepTimes, viewAt]

      for (const t of [lastContactAt, ...times]) {
        expect(Number.isInteger((t - T0) / MINUTE_MS), `${t} is not T0 plus whole minutes`).toBe(true)
      }
      for (let i = 1; i < times.length; i++) {
        expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!)
      }

      // buildScenario really used these times: the add and every step are in
      // the history at them, in order, and `now` is the view time.
      const { engine, id, now } = buildScenario(s)
      expect(now).toBe(viewAt)
      const logged = engine
        .history(id)
        .filter((e) => e.type === "created" || e.type === "tended" || e.type === "resurrected")
        .map((e) => e.timestamp)
      expect(logged).toEqual([addAt, ...stepTimes])
      expect(engine.view(addAt).find((p) => p.id === id)?.payload.lastContactAt).toBe(lastContactAt)
    }
  })
})
