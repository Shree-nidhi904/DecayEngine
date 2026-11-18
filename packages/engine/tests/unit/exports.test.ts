// Public API of the package (task 37.1): what src/index.ts exports and what it
// keeps internal. clampHealth and applyHealth are checked in
// tests/unit/state-derivation.test.ts and are not repeated here.
//
// The last block runs the quick start from packages/engine/README.md using
// only the public API, so the README example stays correct.

import { describe, it, expect, expectTypeOf } from "vitest"
import * as api from "../../src/index"
import {
  DecayEngine,
  DecayEngineError,
  InMemoryAdapter,
  checkPolicy,
} from "../../src/index"
import type {
  AutopsyReport,
  DecayEngineErrorCode,
  DecayPolicy,
  EngineState,
  ForecastEntry,
  HistoryEntry,
  IdGenerator,
  Item,
  ResurrectOutcome,
  StorageAdapter,
  StoredSnapshot,
  TriageCandidate,
  TriageResult,
} from "../../src/index"
import * as autopsyModule from "../../src/autopsy"
import * as bisectionModule from "../../src/bisection"
import * as checkPolicyModule from "../../src/check-policy"
import * as engineModule from "../../src/engine"
import * as errorsModule from "../../src/errors"
import * as forecastModule from "../../src/forecast"
import * as serializationModule from "../../src/serialization"
import * as settleModule from "../../src/settle"
import * as localStorageModule from "../../src/storage/local-storage"
import * as memoryModule from "../../src/storage/memory"
import * as triageModule from "../../src/triage"
import * as typesModule from "../../src/types"

// Fixed timestamps. Tests never read the real clock.
const T0 = 1_700_000_000_000
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

describe("src/index.ts exports", () => {
  it("exports exactly the public values from the task list", () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        "DecayEngine",
        "DecayEngineError",
        "InMemoryAdapter",
        "LocalStorageAdapter",
        "MAX_FORECAST_HORIZON_MS",
        "MAX_TIMESTAMP",
        "checkPolicy",
        "deriveState",
        "validateThresholds",
      ].sort()
    )
  })

  it("re-exports the real implementations, not copies", () => {
    expect(api.DecayEngine).toBe(engineModule.DecayEngine)
    expect(api.DecayEngineError).toBe(errorsModule.DecayEngineError)
    expect(api.InMemoryAdapter).toBe(memoryModule.InMemoryAdapter)
    expect(api.LocalStorageAdapter).toBe(localStorageModule.LocalStorageAdapter)
    // deriveState and validateThresholds: see state-derivation.test.ts
    expect(api.checkPolicy).toBe(checkPolicyModule.checkPolicy)
    expect(api.MAX_FORECAST_HORIZON_MS).toBe(typesModule.MAX_FORECAST_HORIZON_MS)
    expect(api.MAX_FORECAST_HORIZON_MS).toBe(315_360_000_000)
    expect(api.MAX_TIMESTAMP).toBe(typesModule.MAX_TIMESTAMP)
    expect(api.MAX_TIMESTAMP).toBe(8_640_000_000_000_000)
  })

  // Each internal name must exist in its own module, so a typo or a rename
  // cannot make the "not exported" check pass by accident.
  const internals: Array<{ name: string; module: object }> = [
    { name: "settle", module: settleModule },
    { name: "bisectCrossing", module: bisectionModule },
    { name: "findDeathAfter", module: bisectionModule },
    { name: "BISECT_PRECISION_MS", module: bisectionModule },
    { name: "parseSnapshot", module: serializationModule },
    { name: "serializeSnapshot", module: serializationModule },
    { name: "validateItem", module: serializationModule },
    { name: "SCHEMA_VERSION", module: serializationModule },
    { name: "triage", module: triageModule },
    { name: "triageValue", module: triageModule },
    { name: "MAX_BUDGET_MINUTES", module: triageModule },
    { name: "autopsy", module: autopsyModule },
    { name: "forecast", module: forecastModule },
  ]

  it.each(internals)("keeps $name internal", ({ name, module }) => {
    expect((module as Record<string, unknown>)[name]).toBeDefined()
    expect(name in api).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// README quick start. Keep this policy identical to the one in README.md.

type Plant = { name: string }
type PlantData = { lossPerDay: number }
type PlantEvent = { type: "water" }

const plantPolicy: DecayPolicy<Plant, PlantData, PlantEvent> = {
  thresholds: { weak: 50, dead: 10 },

  init: () => ({ lossPerDay: 10 }),

  // Loses lossPerDay health per day since the last event, kept within 0-100.
  healthAt: (item, now) => {
    const days = (now - item.lastEventAt) / DAY
    return Math.min(100, Math.max(0, item.health - item.policyData.lossPerDay * days))
  },

  applyEvent: (item) => ({ health: 100, policyData: item.policyData }),

  // Due when it would reach the weak threshold.
  nextDueAt: (item) =>
    item.lastEventAt + ((item.health - 50) / item.policyData.lossPerDay) * DAY,

  resurrect: () => ({ ok: true }),
}

describe("README quick start", () => {
  it("the example policy passes checkPolicy", () => {
    const report = checkPolicy(plantPolicy, [{ name: "Fern" }], [{ type: "water" }], T0)
    expect(report).toEqual({ passed: true, failures: [] })
  })

  it("runs as the README describes, through the public API only", () => {
    let next = 0
    const ids: IdGenerator = () => `plant-${++next}`
    const adapter: StorageAdapter = new InMemoryAdapter()
    const engine = new DecayEngine(plantPolicy, adapter, ids)

    const fern = engine.addItem({ payload: { name: "Fern" }, importance: 1, costMinutes: 5 }, T0)
    expect(fern).toBe("plant-1")

    // Day 3: health 70, alive. Day 6: health 40, weak.
    const day3: Item<Plant, PlantData>[] = engine.view(T0 + 3 * DAY)
    expect(day3[0]!.health).toBeCloseTo(70, 9)
    expect(day3[0]!.state).toBe("alive")
    const day6 = engine.view(T0 + 6 * DAY)
    expect(day6[0]!.health).toBeCloseTo(40, 9)
    expect(day6[0]!.state).toBe("weak")

    // Left alone, it dies just after day 9 (health below 10).
    const forecast: ForecastEntry<Plant, PlantData>[] = engine.forecast(T0, 10 * DAY)
    expect(forecast.map((e) => e.item.id)).toEqual([fern])
    expect(forecast[0]!.diesAt).toBeGreaterThan(T0 + 9 * DAY)
    expect(forecast[0]!.diesAt).toBeLessThanOrEqual(T0 + 9 * DAY + MINUTE)

    // Day 6, 15 minutes free: tend the fern. Value (100 - 40) x (1 - 0.4) x 1 = 36.
    const plan: TriageResult<Plant, PlantData> = engine.triage(15, T0 + 6 * DAY)
    expect(plan.picks.map((p) => p.item.id)).toEqual([fern])
    expect(plan.picks[0]!.value).toBeCloseTo(36, 9)

    engine.tend(fern, { type: "water" }, T0 + 6 * DAY)
    expect(engine.view(T0 + 6 * DAY)[0]!.health).toBe(100)

    // Forgotten again: dead by day 16 (it crosses below 10 just after day 15).
    expect(engine.tick(T0 + 16 * DAY)).toBe(1)
    expect(engine.graveyard().map((i) => i.id)).toEqual([fern])

    const report: AutopsyReport<PlantEvent> = engine.autopsy(fern, T0 + 16 * DAY)
    expect(report.lastTend).toEqual({ at: T0 + 6 * DAY, event: { type: "water" } })
    expect(report.diedAt).toBeGreaterThan(T0 + 15 * DAY)
    expect(report.diedAt).toBeLessThanOrEqual(T0 + 15 * DAY + MINUTE)
    expect(report.silenceMs).toBe(report.diedAt - (T0 + 6 * DAY))

    const outcome: ResurrectOutcome = engine.resurrect(fern, { type: "water" }, T0 + 16 * DAY)
    expect(outcome).toEqual({ ok: true })
    expect(engine.view(T0 + 16 * DAY)[0]).toMatchObject({ state: "alive", health: 100, timesResurrected: 1 })

    // created (day 0)
    // state-changed alive -> weak (just after day 5, found when tend settles on day 6)
    // tended (day 6), state-changed weak -> alive (day 6, caused by the tend)
    // state-changed alive -> weak (just after day 11) and died (just after day 15), from the tick
    // resurrected (day 16)
    const history: HistoryEntry[] = engine.history(fern)
    expect(history.map((e) => e.type)).toEqual([
      "created",
      "state-changed",
      "tended",
      "state-changed",
      "state-changed",
      "died",
      "resurrected",
    ])
    const changes = history.flatMap((e) => (e.type === "state-changed" ? [`${e.from}->${e.to}`] : []))
    expect(changes).toEqual(["alive->weak", "weak->alive", "alive->weak"])
    expect(history[1]!.timestamp).toBeGreaterThan(T0 + 5 * DAY)
    expect(history[1]!.timestamp).toBeLessThanOrEqual(T0 + 5 * DAY + MINUTE)
    expect(report.wentWeakAt).toBe(history[4]!.timestamp)
    expect(report.wentWeakAt!).toBeGreaterThan(T0 + 11 * DAY)
    expect(report.wentWeakAt!).toBeLessThanOrEqual(T0 + 11 * DAY + MINUTE)

    // Errors carry a code.
    expect(() => engine.forecast(T0, 0)).toThrow(DecayEngineError)
    expect(() => engine.forecast(T0, 0)).toThrow(
      expect.objectContaining({ code: "INVALID_HORIZON" satisfies DecayEngineErrorCode })
    )

    // The remaining public types compile against what the engine returns.
    expectTypeOf(plan.picks).toEqualTypeOf<TriageCandidate<Plant, PlantData>[]>()
    expectTypeOf(adapter.load()).toEqualTypeOf<StoredSnapshot | null>()
    expectTypeOf<EngineState<Plant, PlantData>["items"]>().toEqualTypeOf<
      Map<string, Item<Plant, PlantData>>
    >()
  })
})
