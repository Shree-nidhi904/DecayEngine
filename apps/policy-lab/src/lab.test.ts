import { describe, expect, it } from "vitest"
import { PRESETS, compilePolicy, runLab } from "./lab"

const run = (i: number, over: Partial<Parameters<typeof runLab>[0]> = {}) => {
  const p = PRESETS[i]
  return runLab({ source: p.source, payload: p.payload, event: p.event, tendDay: p.tendDay, horizonDays: 40, ...over })
}

describe("compilePolicy", () => {
  it("rejects syntax errors and missing members with a message", () => {
    expect(compilePolicy("{ nope").ok).toBe(false)
    const r = compilePolicy("{ thresholds: { weak: 40, dead: 10 } }")
    expect(r).toEqual({ ok: false, error: "Missing function: init" })
  })
})

describe("runLab", () => {
  it("milk: passes checkPolicy, and a tend on day 5 resets health", () => {
    const r = run(0)
    if (!r.ok) throw new Error(r.error)
    expect(r.check.passed).toBe(true)
    expect(r.series[0].health).toBe(100)
    expect(r.series[4].health).toBeCloseTo(60, 6)
    expect(r.series[5].health).toBe(60)
    expect(r.tendError).toBeNull()
  })

  it("fact: never tended it dies, tended it lives longer", () => {
    const none = run(1, { tendDay: null })
    const tended = run(1)
    if (!none.ok || !tended.ok) throw new Error("run failed")
    expect(none.check.passed).toBe(true)
    expect(none.deadDay).not.toBeNull()
    expect(tended.deadDay === null || tended.deadDay > none.deadDay!).toBe(true)
  })

  it("broken policy is caught by checkPolicy", () => {
    const r = run(2)
    if (!r.ok) throw new Error(r.error)
    expect(r.check.passed).toBe(false)
    expect(r.check.failures.length).toBeGreaterThan(0)
  })

  it("reports bad JSON and bad source instead of throwing", () => {
    expect(run(0, { payload: "{" })).toEqual({ ok: false, error: "Payload is not valid JSON." })
    expect(run(0, { source: "oops(" }).ok).toBe(false)
  })

  it("is deterministic", () => {
    expect(run(1)).toEqual(run(1))
  })
})
