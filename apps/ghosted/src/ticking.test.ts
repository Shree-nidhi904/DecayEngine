// ticking.ts: startTicking with a fake scheduler and a hand-moved `now`, and
// useSettleTicks through renderHook. A real DecayEngine with the Ghosted
// policy on InMemoryAdapter. Adapted from Study Dungeon's ticking.test.ts.
// Never the real clock.

import { describe, expect, it } from "vitest"
import { renderHook } from "@testing-library/react"
import { DecayEngine, InMemoryAdapter, type HistoryEntry } from "@decay-engine/engine"
import { ghostedPolicy, type ContactEvent, type PersonPayload, type PersonPolicyData } from "./policy"
import { startTicking, TICK_INTERVAL_MS, useSettleTicks, type Scheduler } from "./ticking"

const T0 = 1_700_000_000_000
const DAY_MS = 86_400_000
const MINUTE_MS = 60_000

function makeEngine() {
  let n = 0
  return new DecayEngine<PersonPayload, PersonPolicyData, ContactEvent>(
    ghostedPolicy,
    new InMemoryAdapter(),
    () => `person-${++n}`
  )
}

// One interval at a time; fire() runs the callback once if it is still active.
function makeFakeScheduler() {
  let callback: (() => void) | null = null
  const calls: { ms: number }[] = []
  let cleared = 0
  const scheduler: Scheduler = {
    setInterval(cb, ms) {
      callback = cb
      calls.push({ ms })
      return calls.length
    },
    clearInterval() {
      callback = null
      cleared++
    },
  }
  return {
    scheduler,
    calls,
    fire: () => callback?.(),
    isActive: () => callback !== null,
    cleared: () => cleared,
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

    startTicking(engine, () => T0, fake.scheduler)

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

  it("stops ticking after stop(), and a second stop() does nothing", () => {
    const engine = recordingEngine()
    const fake = makeFakeScheduler()
    let now = T0

    const stop = startTicking(engine, () => now, fake.scheduler)
    stop()
    stop()
    now = T0 + TICK_INTERVAL_MS
    fake.fire()

    expect(fake.isActive()).toBe(false)
    expect(fake.cleared()).toBe(1)
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

  it("hands a tick's error to onError, then still calls onTick", () => {
    const failing = {
      tick: (): number => {
        throw new Error("quota")
      },
    }
    const fake = makeFakeScheduler()
    let now = T0
    const errors: Array<[string, number]> = []
    const ticked: number[] = []
    startTicking(failing, () => now, fake.scheduler, TICK_INTERVAL_MS, (t) => ticked.push(t), (e, t) =>
      errors.push([(e as Error).message, t])
    )
    now = T0 + TICK_INTERVAL_MS
    fake.fire()
    expect(errors).toEqual([
      ["quota", T0],
      ["quota", T0 + TICK_INTERVAL_MS],
    ])
    expect(ticked).toEqual([T0, T0 + TICK_INTERVAL_MS])
  })

  it("lets a tick's error propagate when there is no onError", () => {
    const failing = {
      tick: (): number => {
        throw new Error("quota")
      },
    }
    expect(() => startTicking(failing, () => T0, makeFakeScheduler().scheduler)).toThrow("quota")
  })

  it("saves a 30-day-rhythm person going dark, with the bisected time, when a tick runs at day 90", () => {
    const engine = makeEngine()
    const fake = makeFakeScheduler()
    let now = T0
    const id = engine.addItem(
      { payload: { name: "Mira Castell", relationship: "College", rhythmDays: 30, lastContactAt: T0 }, importance: 2, costMinutes: 10 },
      T0
    )

    startTicking(engine, () => now, fake.scheduler)
    expect(engine.history(id).some((e) => e.type === "died")).toBe(false)

    now = T0 + 90 * DAY_MS
    fake.fire()

    const person = engine.view(now).find((p) => p.id === id)
    expect(person?.state).toBe("dead")
    expect(person?.health).toBe(0)

    // T = 90 days: health is exactly 10 at day 81 (still weak) and below 10
    // just after it. Bisection dates the death at most one minute later.
    const died = engine.history(id).filter((e: HistoryEntry) => e.type === "died")
    expect(died).toHaveLength(1)
    expect(died[0]!.timestamp).toBeGreaterThan(T0 + 81 * DAY_MS)
    expect(died[0]!.timestamp).toBeLessThanOrEqual(T0 + 81 * DAY_MS + MINUTE_MS)
    expect(person?.diedAt).toBe(died[0]!.timestamp)

    // Saved, not just previewed: the stored graveyard has the person.
    expect(engine.graveyard().map((p) => p.id)).toEqual([id])
  })
})

describe("useSettleTicks", () => {
  function setup(initialPreviewing: boolean) {
    const engine = recordingEngine()
    const fake = makeFakeScheduler()
    let now = T0
    const getNow = () => now
    const seen: number[] = []
    const options = { getNow, scheduler: fake.scheduler }
    const hook = renderHook(
      ({ previewing }: { previewing: boolean }) => useSettleTicks(engine, previewing, (t) => seen.push(t), options),
      { initialProps: { previewing: initialPreviewing } }
    )
    return { engine, fake, seen, hook, setNow: (t: number) => (now = t) }
  }

  it("ticks on mount and then every minute while not previewing", () => {
    const { engine, fake, seen, setNow } = setup(false)
    expect(engine.ticks).toEqual([T0])
    setNow(T0 + TICK_INTERVAL_MS)
    fake.fire()
    expect(engine.ticks).toEqual([T0, T0 + TICK_INTERVAL_MS])
    expect(seen).toEqual([T0, T0 + TICK_INTERVAL_MS])
  })

  it("never ticks while previewing", () => {
    const { engine, fake } = setup(true)
    expect(engine.ticks).toEqual([])
    expect(fake.calls).toEqual([])
  })

  it("stops when a preview starts, and ticks straight away when it ends", () => {
    const { engine, fake, hook, setNow } = setup(false)
    hook.rerender({ previewing: true })
    expect(fake.isActive()).toBe(false)

    setNow(T0 + 3 * TICK_INTERVAL_MS)
    fake.fire()
    expect(engine.ticks).toEqual([T0])

    hook.rerender({ previewing: false })
    expect(engine.ticks).toEqual([T0, T0 + 3 * TICK_INTERVAL_MS])
    expect(fake.isActive()).toBe(true)
  })

  it("stops the interval on unmount", () => {
    const { engine, fake, hook, setNow } = setup(false)
    hook.unmount()
    setNow(T0 + TICK_INTERVAL_MS)
    fake.fire()
    expect(fake.isActive()).toBe(false)
    expect(engine.ticks).toEqual([T0])
  })
})
