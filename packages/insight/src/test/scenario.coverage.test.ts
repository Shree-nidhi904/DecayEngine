// Generator coverage check (design section 7.3), like the engine's: the
// scenarios must reach every case the properties are about. If a share fails,
// change the generator mix, never the threshold.

import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { entriesOf } from "./fixtures"
import { runScenario, scenarioArb } from "./scenario"

const runs = fc.sample(scenarioArb, { numRuns: 1000, seed: 42 }).map((s) => ({ s, run: runScenario(s) }))

function share(pred: (r: (typeof runs)[number]) => boolean): number {
  return runs.filter(pred).length / runs.length
}

describe("scenario generator coverage (1,000 scenarios, seed 42)", () => {
  it("ends alive, weak and dead, each in at least 5%", () => {
    expect(share((r) => r.run.item.state === "alive")).toBeGreaterThanOrEqual(0.05)
    expect(share((r) => r.run.item.state === "weak")).toBeGreaterThanOrEqual(0.05)
    expect(share((r) => r.run.item.state === "dead")).toBeGreaterThanOrEqual(0.05)
  })

  it("has a died entry in at least 30%", () => {
    expect(share((r) => entriesOf(r.run.history, "died").length > 0)).toBeGreaterThanOrEqual(0.3)
  })

  it("has a resurrected entry in at least 10%", () => {
    expect(share((r) => entriesOf(r.run.history, "resurrected").length > 0)).toBeGreaterThanOrEqual(0.1)
  })

  it("has a resurrect-failed entry in at least 10%", () => {
    expect(share((r) => entriesOf(r.run.history, "resurrect-failed").length > 0)).toBeGreaterThanOrEqual(0.1)
  })

  it("has an edited entry in at least 10%", () => {
    expect(share((r) => entriesOf(r.run.history, "edited").length > 0)).toBeGreaterThanOrEqual(0.1)
  })

  it("has a tick step that changed health in at least 30%", () => {
    expect(share((r) => r.run.tickChanges > 0)).toBeGreaterThanOrEqual(0.3)
  })

  it("uses both policies, each in at least 30%", () => {
    expect(share((r) => r.s.policy === "exp")).toBeGreaterThanOrEqual(0.3)
    expect(share((r) => r.s.policy === "linear")).toBeGreaterThanOrEqual(0.3)
  })
})
