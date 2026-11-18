import { describe, it, expect } from "vitest"
import fc from "fast-check"
import * as generators from "../generators"
import { RUNS } from "./_shared"

describe("view", () => {
  // Feature: engine, Property 4: View never changes stored data
  it("view does not change storage", () => {
    fc.assert(
      fc.property(
        generators.commandSequence(),
        fc.array(generators.timestamp(), { minLength: 1, maxLength: 5 }),
        (commands, timestamps) => {
          const { engine, adapter } = generators.buildEngine(commands)
          const before = adapter.load()
          const memoryBefore = engine.view(generators.BASE_TIME)

          for (const ts of timestamps) engine.view(ts)

          expect(adapter.load()).toEqual(before)
          expect(engine.view(generators.BASE_TIME)).toEqual(memoryBefore)
        }
      ),
      RUNS
    )
  })
})
