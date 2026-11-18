import { describe, it, expect } from "vitest"
import fc from "fast-check"
import * as generators from "../generators"
import { RUNS } from "./_shared"

describe("timing", () => {
  // Feature: engine, Property 15: diedAt lies between the previous lastEventAt and the time death was detected
  it("a death found by tick is dated within [previous lastEventAt, now]", () => {
    fc.assert(
      fc.property(generators.commandSequence(), generators.offset(), (commands, offset) => {
        const { engine, adapter } = generators.buildEngine(commands)
        const now = generators.latestTimestamp(commands) + offset
        const before = new Map((adapter.load()?.items ?? []).map((i) => [i.id, i]))

        engine.tick(now)
        for (const item of adapter.load()?.items ?? []) {
          const prev = before.get(item.id)!
          if (prev.state !== "dead" && item.state === "dead") {
            expect(item.diedAt).toBeGreaterThanOrEqual(prev.lastEventAt)
            expect(item.diedAt).toBeLessThanOrEqual(now)
          }
          if (prev.state === "dead") {
            // An earlier death keeps its date
            expect(item.diedAt).toBe(prev.diedAt)
          }
        }
      }),
      RUNS
    )
  })

  // Feature: engine, Property 15 (all deaths): every stored diedAt is within its item's life
  it("every diedAt in storage lies between createdAt and lastEventAt", () => {
    fc.assert(
      fc.property(generators.commandSequence(), generators.offset(), (commands, offset) => {
        const { engine, adapter } = generators.buildEngine(commands)
        engine.tick(generators.latestTimestamp(commands) + offset)
        for (const item of adapter.load()?.items ?? []) {
          if (item.state !== "dead") continue
          expect(item.diedAt).toBeGreaterThanOrEqual(item.createdAt)
          expect(item.diedAt).toBeLessThanOrEqual(item.lastEventAt)
        }
      }),
      RUNS
    )
  })

  // Feature: engine, Property 15 (bisection rule): view(diedAt) already shows the item dead
  it("an item dead at now is already dead at its own diedAt, and not dead a minute earlier", () => {
    fc.assert(
      fc.property(generators.commandSequence(), generators.offset(), (commands, offset) => {
        const { engine, adapter } = generators.buildEngine(commands)
        const now = generators.latestTimestamp(commands) + offset
        const stored = new Map((adapter.load()?.items ?? []).map((i) => [i.id, i]))

        for (const item of engine.view(now)) {
          const before = stored.get(item.id)!
          // Deaths found by settling (bisected), not deaths already stored
          if (item.state !== "dead" || before.state === "dead") continue
          const diedAt = item.diedAt!
          expect(engine.view(diedAt).find((i) => i.id === item.id)!.state).toBe("dead")
          if (diedAt - generators.MINUTE_MS >= before.lastEventAt) {
            expect(engine.view(diedAt - generators.MINUTE_MS).find((i) => i.id === item.id)!.state).not.toBe("dead")
          }
        }
      }),
      RUNS
    )
  })
})
