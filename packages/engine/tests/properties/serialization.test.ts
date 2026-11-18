import { describe, it, expect } from "vitest"
import fc from "fast-check"
import * as generators from "../generators"
import { DecayEngine } from "../../src/engine"
import { InMemoryAdapter } from "../../src/storage/memory"
import { FakePolicy } from "../fake-policy"
import { RUNS } from "./_shared"

describe("serialization", () => {
  // Feature: engine, Property 10: Serialization round-trip preserves data
  it("JSON text round-trip into a new engine keeps items and history", () => {
    fc.assert(
      fc.property(generators.commandSequence(), generators.offset(), (commands, offset) => {
        const { engine: original, adapter } = generators.buildEngine(commands)
        const now = generators.latestTimestamp(commands) + offset
        const saved = adapter.load()
        fc.pre(saved !== null)

        // Through JSON text and back, as the local storage adapter does
        const reloaded = JSON.parse(JSON.stringify(saved)) as typeof saved
        expect(reloaded).toEqual(saved)

        // A new engine runs parseSnapshot and its validation
        const adapter2 = new InMemoryAdapter()
        adapter2.save(reloaded!)
        const restored = new DecayEngine(new FakePolicy(), adapter2, generators.counterIds())

        expect(restored.view(now)).toEqual(original.view(now))
        expect(restored.graveyard()).toEqual(original.graveyard())
        for (const item of original.view(now)) {
          expect(restored.history(item.id)).toEqual(original.history(item.id))
        }
      }),
      RUNS
    )
  })
})
