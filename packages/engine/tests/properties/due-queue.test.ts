import { describe, it, expect } from "vitest"
import fc from "fast-check"
import * as generators from "../generators"
import { FakePolicy } from "../fake-policy"
import { RUNS } from "./_shared"

describe("due queue", () => {
  // Feature: engine, Property 3: Dead items never appear in the due queue
  it("dead items are never due", () => {
    fc.assert(
      fc.property(generators.commandSequence(), generators.timestamp(), (commands, now) => {
        const { engine } = generators.buildEngine(commands)
        const deadAtNow = new Set(engine.view(now).filter((i) => i.state === "dead").map((i) => i.id))
        const dueItems = engine.due(now)

        for (const item of dueItems) {
          expect(item.state).not.toBe("dead")
          expect(item.health).toBeGreaterThanOrEqual(new FakePolicy().thresholds.dead)
          expect(deadAtNow.has(item.id)).toBe(false)
        }
      }),
      RUNS
    )
  })
})
