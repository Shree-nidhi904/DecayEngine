import { describe, it, expect } from "vitest"
import fc from "fast-check"
import * as generators from "../generators"

describe("generator coverage", () => {
  // Feature: engine, Generator coverage: alive, weak and dead outcomes all occur often
  it("generated scenarios reach all three states", () => {
    const samples = fc.sample(fc.tuple(generators.commandSequence(), generators.offset()), {
      numRuns: 300,
      seed: 42,
    })
    const counts = { alive: 0, weak: 0, dead: 0 }
    for (const [commands, offset] of samples) {
      const { engine } = generators.buildEngine(commands)
      const now = generators.latestTimestamp(commands) + offset
      for (const item of engine.view(now)) {
        counts[item.state]++
      }
    }
    const total = counts.alive + counts.weak + counts.dead
    const summary = JSON.stringify(counts)

    expect(total).toBeGreaterThan(0)
    expect(counts.alive / total, summary).toBeGreaterThanOrEqual(0.1)
    expect(counts.weak / total, summary).toBeGreaterThanOrEqual(0.1)
    expect(counts.dead / total, summary).toBeGreaterThanOrEqual(0.1)
  })

  it("the small sequence adds at most 10 items", () => {
    for (const commands of fc.sample(generators.smallCommandSequence(), { numRuns: 200, seed: 7 })) {
      expect(commands.filter((c) => c.kind === "add").length).toBeLessThanOrEqual(10)
    }
  })

  it("timestamps never decrease and are whole minutes", () => {
    for (const commands of fc.sample(generators.commandSequence(), { numRuns: 200, seed: 9 })) {
      for (let i = 0; i < commands.length; i++) {
        expect((commands[i]!.at - generators.BASE_TIME) % generators.MINUTE_MS).toBe(0)
        if (i > 0) expect(commands[i]!.at).toBeGreaterThanOrEqual(commands[i - 1]!.at)
      }
    }
  })
})
