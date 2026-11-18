import { describe, it, expect } from "vitest"
import fc from "fast-check"
import * as generators from "../generators"
import { DecayEngine } from "../../src/engine"
import { InMemoryAdapter } from "../../src/storage/memory"
import { FakePolicy } from "../fake-policy"
import { RUNS } from "./_shared"

describe("tick", () => {
  // Feature: engine, Property 5: Tick is idempotent for the same timestamp
  it("a second tick at the same time changes nothing", () => {
    fc.assert(
      fc.property(generators.commandSequence(), generators.offset(), (commands, offset) => {
        const { engine, adapter } = generators.buildEngine(commands)
        const now = generators.latestTimestamp(commands) + offset

        engine.tick(now)
        const afterFirst = adapter.load()
        expect(engine.tick(now)).toBe(0)
        expect(adapter.load()).toEqual(afterFirst)
      }),
      RUNS
    )
  })

  // Feature: engine, Property 9: Splitting time makes no difference (away from thresholds)
  it("tick(t1) then view(t2) equals view(t2)", () => {
    const tolerance = 0.0001
    const { weak, dead } = new FakePolicy().thresholds
    const nearThreshold = (h: number) => Math.abs(h - weak) < tolerance || Math.abs(h - dead) < tolerance

    fc.assert(
      fc.property(generators.commandSequence(), generators.offset(), generators.offset(), (commands, o1, o2) => {
        const t1 = generators.latestTimestamp(commands) + o1
        const t2 = t1 + o2
        const snapshot = generators.buildEngine(commands).adapter.load()

        const engineFrom = () => {
          const adapter = new InMemoryAdapter()
          if (snapshot !== null) adapter.save(snapshot)
          return new DecayEngine(new FakePolicy(), adapter, generators.counterIds())
        }
        const engineA = engineFrom()
        engineA.tick(t1)
        const viewA = engineA.view(t2)
        const viewB = engineFrom().view(t2)

        expect(viewA.map((i) => i.id)).toEqual(viewB.map((i) => i.id))
        for (const [i, itemA] of viewA.entries()) {
          const itemB = viewB[i]!
          // Skip the whole case if rounding could put the two paths on opposite sides of a threshold
          fc.pre(!nearThreshold(itemA.health) && !nearThreshold(itemB.health))
          expect(Math.abs(itemA.health - itemB.health)).toBeLessThan(tolerance)
          expect(itemA.state).toBe(itemB.state)
        }
      }),
      RUNS
    )
  })
})
