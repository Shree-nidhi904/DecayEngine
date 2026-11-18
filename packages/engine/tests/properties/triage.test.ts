import { describe, it, expect } from "vitest"
import fc from "fast-check"
import * as generators from "../generators"
import { FakePolicy } from "../fake-policy"
import { triageValue } from "../../src/triage"
import { RUNS } from "./_shared"

const { weak, dead } = new FakePolicy().thresholds
const budget = () => fc.integer({ min: 1, max: 240 })

describe("triage", () => {
  // Feature: engine, Property 12: Triage only picks weak items
  it("never picks an alive or dead item", () => {
    fc.assert(
      fc.property(generators.commandSequence(), generators.offset(), budget(), (commands, offset, minutes) => {
        const { engine } = generators.buildEngine(commands)
        const now = generators.latestTimestamp(commands) + offset
        const states = new Map(engine.view(now).map((i) => [i.id, i.state]))
        const { picks, others } = engine.triage(minutes, now)

        for (const c of [...picks, ...others]) {
          expect(states.get(c.item.id)).toBe("weak")
          expect(c.item.health).toBeGreaterThanOrEqual(dead)
          expect(c.item.health).toBeLessThan(weak)
        }
        // Every weak item is a candidate
        const weakCount = [...states.values()].filter((s) => s === "weak").length
        expect(picks.length + others.length).toBe(weakCount)
      }),
      RUNS
    )
  })

  // Feature: engine, Property 13: Triage respects the budget
  it("total costMinutes of picks never exceeds the budget", () => {
    fc.assert(
      fc.property(generators.commandSequence(), generators.offset(), budget(), (commands, offset, minutes) => {
        const { engine } = generators.buildEngine(commands)
        const now = generators.latestTimestamp(commands) + offset
        const spent = engine.triage(minutes, now).picks.reduce((sum, c) => sum + c.item.costMinutes, 0)
        expect(spent).toBeLessThanOrEqual(minutes)
      }),
      RUNS
    )
  })

  // Feature: engine, Property 14: Triage is optimal for small cases
  it("total value of picks equals the brute-force best for at most 10 candidates", () => {
    fc.assert(
      fc.property(generators.smallCommandSequence(), generators.offset(), budget(), (commands, offset, minutes) => {
        const { engine } = generators.buildEngine(commands)
        const now = generators.latestTimestamp(commands) + offset
        const { picks, others } = engine.triage(minutes, now)
        const candidates = [...picks, ...others]
        expect(candidates.length).toBeLessThanOrEqual(10)

        let best = 0
        for (let mask = 0; mask < 1 << candidates.length; mask++) {
          let cost = 0
          let value = 0
          candidates.forEach((c, i) => {
            if (mask & (1 << i)) {
              cost += c.item.costMinutes
              value += c.value
            }
          })
          if (cost <= minutes && value > best) best = value
        }
        const picked = picks.reduce((sum, c) => sum + c.value, 0)
        expect(Math.abs(picked - best)).toBeLessThan(1e-9)
        expect(picks.reduce((sum, c) => sum + c.item.costMinutes, 0)).toBeLessThanOrEqual(minutes)
        // Values follow the locked rule
        for (const c of candidates) {
          expect(c.value).toBeCloseTo(triageValue(c.item.health, c.item.importance), 9)
        }
      }),
      RUNS
    )
  })
})
