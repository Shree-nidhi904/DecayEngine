import { describe, it, expect } from "vitest"
import fc from "fast-check"
import * as generators from "../generators"
import { FakePolicy } from "../fake-policy"
import { RUNS } from "./_shared"

const { weak, dead } = new FakePolicy().thresholds

describe("health and state", () => {
  // Feature: engine, Property 1: Health is always between 0 and 100 inclusive
  it("health bounds", () => {
    fc.assert(
      fc.property(generators.commandSequence(), generators.offset(), (commands, offset) => {
        const { engine, adapter } = generators.buildEngine(commands)
        const now = generators.latestTimestamp(commands) + offset

        const viewed = engine.view(now).map((i) => i.health)
        const stored = (adapter.load()?.items ?? []).map((i) => i.health)
        for (const health of [...viewed, ...stored]) {
          expect(Number.isFinite(health)).toBe(true)
          expect(health).toBeGreaterThanOrEqual(0)
          expect(health).toBeLessThanOrEqual(100)
        }
      }),
      RUNS
    )
  })

  // Feature: engine, Property 2: State always matches health and thresholds
  it("state matches health", () => {
    fc.assert(
      fc.property(generators.commandSequence(), generators.offset(), (commands, offset) => {
        const { engine, adapter } = generators.buildEngine(commands)
        const now = generators.latestTimestamp(commands) + offset

        for (const item of [...engine.view(now), ...(adapter.load()?.items ?? [])]) {
          if (item.state === "dead") {
            expect(item.health).toBe(0)
            expect(item.diedAt).toBeDefined()
          } else {
            expect(item.diedAt).toBeUndefined()
            expect(item.state).toBe(item.health >= weak ? "alive" : "weak")
            expect(item.health).toBeGreaterThanOrEqual(dead)
          }
          expect(item.createdAt).toBeLessThanOrEqual(item.lastEventAt)
        }
      }),
      RUNS
    )
  })
})
