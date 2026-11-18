import { describe, it, expect } from "vitest"
import fc from "fast-check"
import * as generators from "../generators"
import { RUNS } from "./_shared"

describe("forecast", () => {
  // Feature: engine, Property 17: An item forecast to die at T is dead in view(T)
  it("forecast is consistent with view", () => {
    fc.assert(
      fc.property(
        generators.commandSequence(),
        generators.offset(),
        fc.integer({ min: 1000, max: 100_000_000 }),
        (commands, offset, horizonMs) => {
          const { engine } = generators.buildEngine(commands)
          const now = generators.latestTimestamp(commands) + offset
          const entries = engine.forecast(now, horizonMs)

          for (const entry of entries) {
            expect(entry.diesAt).toBeGreaterThan(now)
            expect(entry.diesAt).toBeLessThanOrEqual(now + horizonMs)
            const atDeath = engine.view(entry.diesAt).find((i) => i.id === entry.item.id)
            expect(atDeath).toBeDefined()
            expect(atDeath!.state).toBe("dead")
          }
          // Soonest first, ties by id
          for (let i = 1; i < entries.length; i++) {
            const [a, b] = [entries[i - 1]!, entries[i]!]
            expect(a.diesAt < b.diesAt || (a.diesAt === b.diesAt && a.item.id < b.item.id)).toBe(true)
          }
          // Nothing that is alive or weak at now and dead at the horizon's end is missing
          const forecastIds = new Set(entries.map((e) => e.item.id))
          const livingNow = engine.view(now).filter((i) => i.state !== "dead").map((i) => i.id)
          const deadAtEnd = new Set(engine.view(now + horizonMs).filter((i) => i.state === "dead").map((i) => i.id))
          for (const id of livingNow) {
            expect(forecastIds.has(id)).toBe(deadAtEnd.has(id))
          }
        }
      ),
      RUNS
    )
  })
})
