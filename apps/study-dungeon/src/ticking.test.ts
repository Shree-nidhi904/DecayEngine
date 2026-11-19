// Tests for startTicking (task 4). Uses a fake scheduler and a hand-advanced
// `now`; never the real clock. Builds a real DecayEngine on InMemoryAdapter
// (engine-instance.ts needs localStorage, so it is not imported here).

import { describe, expect, it } from "vitest"
import { DecayEngine, InMemoryAdapter, type HistoryEntry } from "@decay-engine/engine"
import {
  DAY_MS,
  studyDungeonPolicy,
  type FactPayload,
  type FactPolicyData,
  type ReviewEvent,
} from "./policy"
import { startTicking, TICK_INTERVAL_MS, type Scheduler } from "./ticking"

const T0 = Date.UTC(2026, 9, 1) // 1 Oct 2026, fixed

function makeEngine() {
  let n = 0
  return new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(
    studyDungeonPolicy,
    new InMemoryAdapter(),
    () => `fact-${++n}`
  )
}

// One interval at a time; fire() runs the callback once if it is still active.
function makeFakeScheduler() {
  let callback: (() => void) | null = null
  const calls: { ms: number }[] = []
  const scheduler: Scheduler = {
    setInterval(cb, ms) {
      callback = cb
      calls.push({ ms })
      return 1
    },
    clearInterval() {
      callback = null
    },
  }
  return {
    scheduler,
    calls,
    fire: () => callback?.(),
    isActive: () => callback !== null,
  }
}

function recordingEngine() {
  const ticks: number[] = []
  return { ticks, tick: (now: number) => (ticks.push(now), 0) }
}

describe("startTicking", () => {
  it("ticks once immediately with getNow()'s value and schedules every minute", () => {
    const engine = recordingEngine()
    const fake = makeFakeScheduler()
    const now = T0

    startTicking(engine, () => now, fake.scheduler)

    expect(engine.ticks).toEqual([T0])
    expect(fake.calls).toEqual([{ ms: TICK_INTERVAL_MS }])
    expect(TICK_INTERVAL_MS).toBe(60_000)
  })

  it("ticks again with the new now after one interval", () => {
    const engine = recordingEngine()
    const fake = makeFakeScheduler()
    let now = T0

    startTicking(engine, () => now, fake.scheduler)
    now = T0 + TICK_INTERVAL_MS
    fake.fire()

    expect(engine.ticks).toEqual([T0, T0 + TICK_INTERVAL_MS])
  })

  it("stops ticking after stop()", () => {
    const engine = recordingEngine()
    const fake = makeFakeScheduler()
    let now = T0

    const stop = startTicking(engine, () => now, fake.scheduler)
    stop()
    now = T0 + TICK_INTERVAL_MS
    fake.fire()

    expect(fake.isActive()).toBe(false)
    expect(engine.ticks).toEqual([T0])
  })

  it("passes each tick's time to onTick", () => {
    const engine = recordingEngine()
    const fake = makeFakeScheduler()
    const seen: number[] = []
    let now = T0

    startTicking(engine, () => now, fake.scheduler, TICK_INTERVAL_MS, (t) => seen.push(t))
    now = T0 + 5 * TICK_INTERVAL_MS
    fake.fire()

    expect(seen).toEqual([T0, T0 + 5 * TICK_INTERVAL_MS])
  })

  it("hands a tick's error to onError, then still calls onTick (added after round 7)", () => {
    const failing = { tick: () => { throw new Error("quota") } }
    const fake = makeFakeScheduler()
    let now = T0
    const errors: Array<[string, number]> = []
    const ticked: number[] = []
    startTicking(failing, () => now, fake.scheduler, TICK_INTERVAL_MS, (t) => ticked.push(t), (e, t) =>
      errors.push([(e as Error).message, t])
    )
    now = T0 + TICK_INTERVAL_MS
    fake.fire()
    expect(errors).toEqual([["quota", T0], ["quota", T0 + TICK_INTERVAL_MS]])
    expect(ticked).toEqual([T0, T0 + TICK_INTERVAL_MS])
  })

  it("lets a tick's error propagate when there is no onError", () => {
    const failing = { tick: () => { throw new Error("quota") } }
    expect(() => startTicking(failing, () => T0, makeFakeScheduler().scheduler)).toThrow("quota")
  })

  it("saves a solid fact's death with its bisected time when a tick runs past day 34", () => {
    const engine = makeEngine()
    const fake = makeFakeScheduler()
    let now = T0
    const id = engine.addItem(
      {
        payload: { question: "Capital of Peru?", answer: "Lima", why: "", knowledge: "solid" },
        importance: 2,
        costMinutes: 2,
      },
      T0
    )

    startTicking(engine, () => now, fake.scheduler)
    // Nothing has died at T0.
    expect(engine.history(id).some((e) => e.type === "died")).toBe(false)

    now = T0 + 34 * DAY_MS
    fake.fire()

    const item = engine.view(now).find((i) => i.id === id)
    expect(item?.state).toBe("dead")
    expect(item?.health).toBe(0)

    // Health 100 halves every 10 days and drops below 10 at
    // 10 × log2(10) ≈ 33.2193 days. Bisection dates the death at most
    // 1 minute after that moment.
    const crossing = T0 + 10 * Math.log2(10) * DAY_MS
    const died = engine.history(id).filter((e: HistoryEntry) => e.type === "died")
    expect(died).toHaveLength(1)
    expect(died[0]!.timestamp).toBeGreaterThanOrEqual(crossing)
    expect(died[0]!.timestamp).toBeLessThanOrEqual(crossing + 60_000)
    expect(item?.diedAt).toBe(died[0]!.timestamp)

    // Saved, not just previewed: the stored graveyard has it.
    expect(engine.graveyard().map((i) => i.id)).toEqual([id])
  })
})
