// Properties P-A, P-B and P-E for replay (requirements.md, "Correctness
// properties"; design section 7.4). Histories come from a real engine driven
// by a generated scenario.

import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { deathTime } from "./death-time"
import { replay } from "./replay"
import { DEATH_TIME_PRECISION_MS } from "./types"
import type { ReplayResult } from "./types"
import { ITEM_ID, deepFreeze, entriesOf, findNonJson } from "./test/fixtures"
import { runScenario, scenarioArb } from "./test/scenario"

const RUNS = { numRuns: 100 }

function okResult<P, D>(r: ReplayResult<P, D>) {
  expect(r.ok, r.ok ? "" : JSON.stringify(r.reason)).toBe(true)
  if (!r.ok) throw new Error("unreachable: asserted ok above")
  return r
}

describe("P-A: replaying an item's own history reproduces it", () => {
  it("tended healths, resurrections, deaths, the final item and diesAt", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const run = runScenario(s)
        const r = okResult(replay(run.policy, run.item, run.history, { until: run.end }))

        // tended: same timestamps and events, health within 1e-9 (L5)
        const recTended = entriesOf(run.history, "tended")
        const repTended = entriesOf(r.history, "tended")
        expect(repTended).toHaveLength(recTended.length)
        recTended.forEach((e, i) => {
          const x = repTended[i]!
          expect(x.timestamp).toBe(e.timestamp)
          expect(x.event).toEqual(e.event)
          expect(Math.abs(x.health - e.health)).toBeLessThanOrEqual(1e-9)
        })

        // resurrected: one to one, health 100
        const recRes = entriesOf(run.history, "resurrected")
        const repRes = entriesOf(r.history, "resurrected")
        expect(repRes.map((e) => [e.timestamp, e.event, e.health])).toEqual(
          recRes.map((e) => [e.timestamp, e.event, 100])
        )

        // died: one to one, within the precision (L6)
        const recDied = entriesOf(run.history, "died")
        const repDied = entriesOf(r.history, "died")
        expect(repDied).toHaveLength(recDied.length)
        recDied.forEach((e, i) => {
          expect(Math.abs(repDied[i]!.timestamp - e.timestamp)).toBeLessThanOrEqual(DEATH_TIME_PRECISION_MS)
        })

        // the final item
        expect(r.item.id).toBe(ITEM_ID)
        expect(r.item.state).toBe(run.item.state)
        expect(r.item.timesResurrected).toBe(run.item.timesResurrected)
        expect(r.item.payload).toEqual(run.item.payload)
        expect(r.item.policyData).toEqual(run.item.policyData)
        if (run.item.state !== "dead") {
          expect(Math.abs(r.item.health - run.item.health)).toBeLessThanOrEqual(1e-9)
        }

        // diesAt: the original's death time, within the precision
        const expected = run.item.state === "dead" ? run.item.diedAt! : deathTime(run.engine, ITEM_ID, run.end)
        if (expected === null) {
          expect(r.diesAt).toBeNull()
        } else {
          expect(r.diesAt).not.toBeNull()
          expect(Math.abs(r.diesAt! - expected)).toBeLessThanOrEqual(DEATH_TIME_PRECISION_MS)
        }
      }),
      RUNS
    )
  })
})

describe("P-B: replay is deterministic and changes nothing", () => {
  it("two calls give equal results and the inputs are unchanged", () => {
    fc.assert(
      fc.property(scenarioArb, fc.boolean(), (s, withUntil) => {
        const run = runScenario(s)
        const item = deepFreeze(run.item)
        const history = deepFreeze(run.history)
        const itemBefore = JSON.stringify(item)
        const historyBefore = JSON.stringify(history)
        const options = withUntil ? { until: run.end } : {}

        const first = replay(run.policy, item, history, options)
        const second = replay(run.policy, item, history, options)
        expect(second).toEqual(first)
        expect(JSON.stringify(item)).toBe(itemBefore)
        expect(JSON.stringify(history)).toBe(historyBefore)
      }),
      RUNS
    )
  })
})

describe("P-E: replay results are JSON", () => {
  it("survive a JSON round trip with nothing undefined", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const run = runScenario(s)
        const r = replay(run.policy, run.item, run.history, { until: run.end })
        expect(findNonJson(r)).toBeNull()
        expect(JSON.parse(JSON.stringify(r))).toEqual(r)
      }),
      RUNS
    )
  })

  it("failure results are JSON too", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const run = runScenario(s)
        // until 1 ms before the last entry: always invalid-options
        const last = run.history[run.history.length - 1]!.timestamp
        const r = replay(run.policy, run.item, run.history, { until: last - 1 })
        expect(r).toMatchObject({ ok: false, reason: { code: "invalid-options", option: "until" } })
        expect(findNonJson(r)).toBeNull()
        expect(JSON.parse(JSON.stringify(r))).toEqual(r)
      }),
      RUNS
    )
  })
})
