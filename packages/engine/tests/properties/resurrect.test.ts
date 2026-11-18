import { describe, it, expect } from "vitest"
import fc from "fast-check"
import * as generators from "../generators"
import { FakePolicy } from "../fake-policy"
import { RUNS } from "./_shared"

describe("resurrect", () => {
  // Feature: engine, Property 6: Successful resurrect always yields alive with health 100
  it("a successful resurrect gives alive, health 100, no diedAt", () => {
    fc.assert(
      fc.property(generators.commandSequence(), generators.offset(), generators.event(), (commands, offset, event) => {
        const policy = new FakePolicy()
        policy.setResurrectFailure(false)
        const { engine } = generators.buildEngine(commands, { policy })
        const now = generators.latestTimestamp(commands) + offset
        engine.tick(now)

        for (const dead of engine.graveyard()) {
          expect(engine.resurrect(dead.id, event, now)).toStrictEqual({ ok: true })
          const item = engine.view(now).find((i) => i.id === dead.id)!
          expect(item.state).toBe("alive")
          expect(item.health).toBe(100)
          expect(item.diedAt).toBeUndefined()
          expect(item.timesResurrected).toBe(dead.timesResurrected + 1)
        }
        expect(engine.graveyard()).toEqual([])
      }),
      RUNS
    )
  })
})
