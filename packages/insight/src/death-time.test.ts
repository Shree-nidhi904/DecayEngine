// deathTime: answers from the engine's view and forecast (Requirement 5).
// Expected times are worked out here from the test policies' rules; the
// library itself never does this.

import { describe, expect, it } from "vitest"
import { DecayEngine, DecayEngineError, InMemoryAdapter } from "@decay-engine/engine"
import { deathTime } from "./death-time"
import { DEATH_TIME_PRECISION_MS } from "./types"
import { DAY, ITEM_ID, T0, entriesOf, thrown } from "./test/fixtures"
import { EXP_HALF_LIFE_MS, LINEAR_RATE_PER_DAY, expPolicy, linearPolicy } from "./test/policies"

const EXP_LIFE_MS = (EXP_HALF_LIFE_MS * Math.log(10)) / Math.log(2) // 3 × log2(10) days
const LINEAR_LIFE_MS = (80 / LINEAR_RATE_PER_DAY) * DAY

function engineWith(policy: typeof expPolicy, adapter = new InMemoryAdapter()) {
  const engine = new DecayEngine(policy, adapter, () => ITEM_ID)
  engine.addItem({ payload: { label: "a" }, importance: 2, costMinutes: 10 }, T0)
  return engine
}

describe("deathTime", () => {
  it("a never-tended expPolicy item dies 3 × log2(10) days after creation, to the minute", () => {
    const d = deathTime(engineWith(expPolicy), ITEM_ID, T0)
    expect(d).not.toBeNull()
    expect(d!).toBeGreaterThanOrEqual(Math.floor(T0 + EXP_LIFE_MS))
    expect(d!).toBeLessThanOrEqual(T0 + EXP_LIFE_MS + DEATH_TIME_PRECISION_MS)
  })

  it("a never-tended linearPolicy item dies 80 / 7 days after creation, to the minute", () => {
    const d = deathTime(engineWith(linearPolicy), ITEM_ID, T0)
    expect(d).not.toBeNull()
    expect(d!).toBeGreaterThanOrEqual(Math.floor(T0 + LINEAR_LIFE_MS))
    expect(d!).toBeLessThanOrEqual(T0 + LINEAR_LIFE_MS + DEATH_TIME_PRECISION_MS)
  })

  it("a dead item gives its diedAt, the same time as its died entry", () => {
    const engine = engineWith(expPolicy)
    engine.tick(T0 + 30 * DAY)
    const died = entriesOf(engine.history(ITEM_ID), "died")
    expect(died).toHaveLength(1)
    const d = deathTime(engine, ITEM_ID, T0 + 30 * DAY)
    expect(d).toBe(died[0]!.timestamp)
    expect(d).toBe(engine.view(T0 + 30 * DAY)[0]!.diedAt)
    expect(d!).toBeLessThanOrEqual(T0 + EXP_LIFE_MS + DEATH_TIME_PRECISION_MS)
  })

  it("gives null when the item does not die within the horizon", () => {
    expect(deathTime(engineWith(expPolicy), ITEM_ID, T0, { horizonMs: DAY })).toBeNull()
  })

  it("throws the engine's ITEM_NOT_FOUND for an unknown id", () => {
    const error = thrown(() => deathTime(engineWith(expPolicy), "nobody", T0))
    expect(error).toBeInstanceOf(DecayEngineError)
    expect((error as DecayEngineError).code).toBe("ITEM_NOT_FOUND")
  })

  it("saves nothing", () => {
    const adapter = new InMemoryAdapter()
    const engine = engineWith(expPolicy, adapter)
    const before = JSON.stringify(adapter.load())
    deathTime(engine, ITEM_ID, T0 + 5 * DAY)
    deathTime(engine, ITEM_ID, T0 + 30 * DAY)
    expect(JSON.stringify(adapter.load())).toBe(before)
  })
})
