import { describe, expect, it } from "vitest"
import {
  LAB_COST_MINUTES,
  LAB_IMPORTANCE,
  MAX_LAB_DAYS,
  PRESETS,
  clampHorizon,
  clampTendDay,
  compilePolicy,
  runLab,
} from "./lab"

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

// Extensions spec, task 3.5 (Requirements 5.7 to 5.10) and 3.3 (8.2). Expected values worked by hand:
// the fact preset halves every 3 days from 100, weak below 50, dead below 15. Day 3 is exactly 50 (alive),
// day 4 is 39.7 (weak), day 8 is 15.7 (weak), day 9 is 12.5 (dead).
describe("runLab, extensions spec", () => {
  it("clamps the days shown to whole numbers from 1 to 730", () => {
    expect(clampHorizon(0)).toBe(1)
    expect(clampHorizon(731)).toBe(730)
    expect(clampHorizon(1.5)).toBe(1)
    expect(clampHorizon(Number.NaN)).toBe(1)
    expect(clampHorizon(40)).toBe(40)
    const r = run(0, { horizonDays: 731 })
    if (!r.ok) throw new Error(r.error)
    expect(r.series.length).toBe(MAX_LAB_DAYS + 1)
    expect(r.series[r.series.length - 1]!.day).toBe(730)
  })

  it("clamps the tend day to 0..730, and empty or not a number means never", () => {
    expect(clampTendDay(-3)).toBe(0)
    expect(clampTendDay(900)).toBe(730)
    expect(clampTendDay(4.7)).toBe(4)
    expect(clampTendDay(null)).toBeNull()
    expect(clampTendDay(Number.NaN)).toBeNull()
  })

  it("the fact preset, never tended, goes weak on day 4 and dies on day 9", () => {
    const r = run(1, { tendDay: null })
    if (!r.ok) throw new Error(r.error)
    expect(r.series[3]!.state).toBe("alive")
    expect(r.weakDay).toBe(4)
    expect(r.deadDay).toBe(9)
    expect(r.series[8]!.state).toBe("weak")
    expect(r.series[8]!.health).toBeCloseTo(100 * Math.pow(0.5, 8 / 3), 9)
  })

  it("a tend day past the window never tends", () => {
    const later = run(0, { tendDay: 50, horizonDays: 40 })
    const never = run(0, { tendDay: null, horizonDays: 40 })
    if (!later.ok || !never.ok) throw new Error("run failed")
    expect(later.series).toEqual(never.series)
    expect(later.tendError).toBeNull()
  })

  it("tending a dead item is refused by the engine and shown as a tend error; the curve is still there", () => {
    const r = run(1, { tendDay: 20 })
    if (!r.ok) throw new Error(r.error)
    expect(r.tendError).not.toBeNull()
    expect(r.series.length).toBe(41)
    expect(r.series[20]!.state).toBe("dead")
  })

  it("returns the policy's thresholds for the chart's lines", () => {
    const milk = run(0)
    const fact = run(1)
    if (!milk.ok || !fact.ok) throw new Error("run failed")
    expect(milk.thresholds).toEqual({ weak: 40, dead: 10 })
    expect(fact.thresholds).toEqual({ weak: 50, dead: 15 })
  })

  it("the item has importance 2 and cost 5 (the values the page states)", () => {
    expect(LAB_IMPORTANCE).toBe(2)
    expect(LAB_COST_MINUTES).toBe(5)
  })

  // P5, over a fixed grid instead of generated inputs (Policy Lab has no fast-check dependency).
  it("P5: every preset gives equal results on two runs, for tend days and windows across the range", () => {
    for (let i = 0; i < PRESETS.length; i++) {
      for (const tendDay of [null, 0, 1, 5, 39, 40, 41, 730]) {
        for (const horizonDays of [1, 40, 365]) {
          expect(run(i, { tendDay, horizonDays })).toEqual(run(i, { tendDay, horizonDays }))
        }
      }
    }
  })
})
