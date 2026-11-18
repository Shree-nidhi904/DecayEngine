import { describe, it, expect } from "vitest"
import fc from "fast-check"
import * as generators from "../generators"
import { RUNS, expectEngineError } from "./_shared"

describe("tend", () => {
  // Feature: engine, Property 8: Tend never succeeds when the settled item is dead
  it("tend on an item dead at now throws ITEM_ALREADY_DEAD and applies nothing", () => {
    fc.assert(
      fc.property(generators.commandSequence(), generators.event(), generators.offset(), (commands, event, offset) => {
        const { engine } = generators.buildEngine(commands)
        const now = generators.latestTimestamp(commands) + offset
        // Dead at now, including items not yet settled in storage
        const deadIds = engine.view(now).filter((i) => i.state === "dead").map((i) => i.id)

        for (const id of deadIds) {
          expectEngineError(() => engine.tend(id, event, now), "ITEM_ALREADY_DEAD")
          expect(engine.history(id).some((h) => h.type === "tended" && h.timestamp === now && h.event === event)).toBe(false)
          expect(engine.view(now).find((i) => i.id === id)!.state).toBe("dead")
        }
      }),
      RUNS
    )
  })
})
