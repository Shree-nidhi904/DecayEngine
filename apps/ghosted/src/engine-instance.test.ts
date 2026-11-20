// engine-instance.ts (Req 23.1): the engine saves under "decay-engine:ghosted"
// in jsdom's real localStorage and loads it back. Fixed times; never the clock.

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createEngine, STORAGE_NAMESPACE } from "./engine-instance"

const T0 = 1_700_000_000_000
const DAY_MS = 86_400_000
const KEY = "decay-engine:ghosted"

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

const mira = {
  payload: { name: "Mira Castell", relationship: "College", rhythmDays: 30, lastContactAt: T0 },
  importance: 2,
  costMinutes: 10,
}

describe("createEngine", () => {
  it("uses the namespace 'ghosted'", () => {
    expect(STORAGE_NAMESPACE).toBe("ghosted")
  })

  it("starts empty when nothing is stored, and saves nothing until a write", () => {
    const engine = createEngine()
    expect(engine.view(T0)).toEqual([])
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it("saves the snapshot under decay-engine:ghosted, and only there", () => {
    const engine = createEngine()
    const id = engine.addItem(mira, T0)

    const stored = JSON.parse(localStorage.getItem(KEY)!)
    expect(stored.items.map((item: { id: string }) => item.id)).toEqual([id])
    expect(stored.items[0].payload).toEqual(mira.payload)
    expect(stored.items[0].policyData).toEqual({ lastContactAt: T0 })
    expect(Object.keys(localStorage)).toEqual([KEY])
  })

  it("gives each person a different id", () => {
    const engine = createEngine()
    const a = engine.addItem(mira, T0)
    const b = engine.addItem({ ...mira, payload: { ...mira.payload, name: "Theo Brandt" } }, T0)
    expect(a).not.toBe(b)
  })

  it("loads a saved street back in a new engine, with the Ghosted policy", () => {
    const id = createEngine().addItem(mira, T0)

    const again = createEngine()
    const [person] = again.view(T0 + 37 * DAY_MS)
    expect(person?.id).toBe(id)
    expect(person?.payload.name).toBe("Mira Castell")
    // 30-day rhythm: T = 90 days, so day 37 is weak at 100 × 53 / 90.
    expect(person?.state).toBe("weak")
    expect(person?.health).toBeCloseTo((100 * 53) / 90, 9)
  })

  it("leaves another app's key alone", () => {
    localStorage.setItem("decay-engine:study-dungeon", '{"kept":true}')
    createEngine().addItem(mira, T0)
    expect(localStorage.getItem("decay-engine:study-dungeon")).toBe('{"kept":true}')
  })
})
