import { describe, it, expect } from "vitest"
import fc from "fast-check"
import * as generators from "../generators"
import { FakePolicy } from "../fake-policy"
import { RUNS } from "./_shared"

describe("history", () => {
  // Feature: engine, Property 7: History entries always in time order
  it("history is sorted by timestamp", () => {
    fc.assert(
      fc.property(
        generators.commandSequence(),
        generators.offset(),
        fc.boolean(),
        generators.event(),
        (commands, offset, resurrectFails, event) => {
          const policy = new FakePolicy()
          policy.setResurrectFailure(resurrectFails)
          const { engine } = generators.buildEngine(commands, { policy })
          const now = generators.latestTimestamp(commands) + offset

          engine.tick(now)
          for (const item of engine.graveyard()) engine.resurrect(item.id, event, now)

          for (const item of engine.view(now)) {
            const history = engine.history(item.id)
            expect(history[0]!.type).toBe("created")
            for (let i = 1; i < history.length; i++) {
              expect(history[i]!.timestamp).toBeGreaterThanOrEqual(history[i - 1]!.timestamp)
            }
          }
        }
      ),
      RUNS
    )
  })
})
