// Extensions spec, tasks 6.2 to 6.4 (Requirements 6.6 and 11): the examples in
// docs/ADDING_A_POLICY.md work when copied. The milk object is read out of the
// guide's own text, compiled the way Policy Lab compiles a policy, and run on
// the real engine. Fixed times, never the clock.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { DecayEngine, InMemoryAdapter, checkPolicy } from "@decay-engine/engine"
import { PRESETS, T0, compilePolicy, runLab } from "./lab"

const guide = readFileSync(fileURLToPath(new URL("../../../docs/ADDING_A_POLICY.md", import.meta.url)), "utf8")

/** The object literal after `export const milkPolicy: ... =`, up to the end of its code block. */
function milkObject(): string {
  const match = /export const milkPolicy:[^=]*=\s*(\{[\s\S]*?\n\})\n```/.exec(guide)
  if (match === null) throw new Error("test bug: the milk example was not found in the guide")
  return match[1]!
}

describe("docs/ADDING_A_POLICY.md", () => {
  it("the milk example compiles and passes checkPolicy", () => {
    const compiled = compilePolicy(milkObject())
    if (!compiled.ok) throw new Error(compiled.error)
    const r = checkPolicy(compiled.policy, [{ label: "Milk", shelfLifeDays: 7 }], [{ kind: "freeze" }], T0)
    expect(r.failures).toEqual([])
    expect(r.passed).toBe(true)
  })

  it("the milk example has the same rules as Policy Lab's milk preset (same curve over 40 days)", () => {
    const milk = PRESETS[0]
    const inputs = { payload: milk.payload, event: milk.event, tendDay: milk.tendDay, horizonDays: 40 }
    const fromGuide = runLab({ source: milkObject(), ...inputs })
    const fromPreset = runLab({ source: milk.source, ...inputs })
    if (!fromGuide.ok || !fromPreset.ok) throw new Error("run failed")
    expect(fromGuide.series).toEqual(fromPreset.series)
    expect(fromGuide.thresholds).toEqual({ weak: 40, dead: 10 })
  })

  it("the connect example's importance and cost are accepted by the engine", () => {
    const m = /importance: (\d+), costMinutes: (\d+)/.exec(guide)
    if (m === null) throw new Error("test bug: the connect example was not found in the guide")
    const importance = Number(m[1])
    const costMinutes = Number(m[2])
    expect(importance).toBeGreaterThanOrEqual(1)
    expect(importance).toBeLessThanOrEqual(3)
    const compiled = compilePolicy(milkObject())
    if (!compiled.ok) throw new Error(compiled.error)
    const engine = new DecayEngine(compiled.policy, new InMemoryAdapter(), () => "milk-1")
    const id = engine.addItem({ payload: { label: "Milk", shelfLifeDays: 7 }, importance, costMinutes }, T0)
    expect(engine.view(T0).find((i) => i.id === id)?.health).toBe(100)
  })

  it("links to Policy Lab, and describes checkPolicy without overselling it", () => {
    expect(guide).toContain("https://decay-engine-lab.pages.dev")
    expect(guide).not.toContain("runs the contract's rules")
    expect(guide).toMatch(/does not check `nextDueAt` or `resurrect`/)
  })
})
