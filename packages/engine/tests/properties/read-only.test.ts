import { describe, it, expect } from "vitest"
import fc from "fast-check"
import * as generators from "../generators"
import { RUNS } from "./_shared"

describe("read-only operations", () => {
  // Feature: engine, Property 16: Read-only operations never change stored data
  it("view, due, graveyard, history, triage, autopsy and forecast leave storage unchanged", () => {
    fc.assert(
      fc.property(
        generators.commandSequence(),
        generators.offset(),
        fc.integer({ min: 1, max: 240 }),
        (commands, offset, budget) => {
          const { engine, adapter } = generators.buildEngine(commands)
          const now = generators.latestTimestamp(commands) + offset
          const before = adapter.load()
          const memoryBefore = engine.view(now)

          engine.view(now)
          engine.due(now)
          engine.graveyard()
          engine.triage(budget, now)
          engine.forecast(now, 30 * 24 * generators.HOUR_MS)
          for (const item of memoryBefore) {
            engine.history(item.id)
            if (item.state === "dead") engine.autopsy(item.id, now)
          }

          expect(adapter.load()).toEqual(before)
          expect(engine.view(now)).toEqual(memoryBefore)
        }
      ),
      RUNS
    )
  })
})
