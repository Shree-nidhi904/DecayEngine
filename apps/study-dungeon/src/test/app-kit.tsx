// Test kit for App-level tests (round 6): a real DecayEngine on an
// InMemoryAdapter, a hand-moved clock, a fake tick scheduler, no animation
// frames, an in-memory storage for the first-run flag and a reload spy.
// Never the real clock, never real timers, never window.localStorage.

import { render } from "@testing-library/react"
import { vi } from "vitest"
import { DecayEngine, InMemoryAdapter, type StorageAdapter } from "@decay-engine/engine"
import type { FrameScheduler } from "@decay-engine/shell"
import { App, type AppProps } from "../App"
import type { FlagStorage } from "../first-run"
import { studyDungeonPolicy, type FactPayload, type FactPolicyData, type Knowledge, type ReviewEvent } from "../policy"
import type { Scheduler } from "../ticking"

/** A Storage stand-in backed by a Map; `entries()` shows what is left. */
export class MemoryStorage implements FlagStorage {
  private readonly map: Map<string, string>
  constructor(initial: Record<string, string> = {}) {
    this.map = new Map(Object.entries(initial))
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  entries(): Record<string, string> {
    return Object.fromEntries(this.map)
  }
}

/** One interval at a time, fired by hand; mirrors ticking.test.ts. */
function fakeTickScheduler() {
  let callback: (() => void) | null = null
  const scheduler: Scheduler = {
    setInterval(cb) {
      callback = cb
      return 1
    },
    clearInterval() {
      callback = null
    },
  }
  return { scheduler, fire: () => callback?.() }
}

// Play is not used in these tests; a frame request is a test bug.
const noFrames: FrameScheduler = {
  request() {
    throw new Error("test bug: Play was not expected")
  },
  cancel() {},
}

/** Round 7 additions; both optional, so earlier tests are unchanged. */
export type AppKitOptions = {
  /** The engine's adapter. Defaults to a new InMemoryAdapter. */
  adapter?: StorageAdapter
  /** Passed to the App: the fake Web Audio context for sound tests. */
  createAudioContext?: AppProps["createAudioContext"]
  /**
   * How fights check answers. Defaults to "self" (Show answer, then I knew
   * it / I forgot), which the tests written before answer checking use.
   */
  answerCheck?: AppProps["defaultAnswerCheck"]
}

export function makeAppKit(
  storage: MemoryStorage = new MemoryStorage({ "study-dungeon:started": "1" }),
  options: AppKitOptions = {}
) {
  const queue: string[] = []
  let next = 0
  const engine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(
    studyDungeonPolicy,
    options.adapter ?? new InMemoryAdapter(),
    // Queued ids first (facts added by the test), then id-0, id-1, ... (sample data).
    () => queue.shift() ?? `id-${next++}`
  )
  const add = (id: string, knowledge: Knowledge, at: number, why = "") => {
    queue.push(id)
    engine.addItem({ payload: { question: `Question ${id}`, answer: `Answer ${id}`, why, knowledge }, importance: 2, costMinutes: 2 }, at)
  }
  const ticks = fakeTickScheduler()
  const reload = vi.fn()
  let clockNow = 0

  function renderApp(at: number) {
    clockNow = at
    return render(
      <App
        engine={engine}
        clock={() => clockNow}
        tickScheduler={ticks.scheduler}
        frameScheduler={noFrames}
        frameClock={() => 0}
        prefersReducedMotion={() => false}
        formatDate={(ms) => new Date(ms).toISOString().slice(0, 10)}
        storage={storage}
        reload={reload}
        timeZone="UTC"
        createAudioContext={options.createAudioContext}
        defaultAnswerCheck={options.answerCheck ?? "self"}
      />
    )
  }

  return {
    engine,
    storage,
    reload,
    add,
    renderApp,
    setClock: (ms: number) => {
      clockNow = ms
    },
    /** Runs the minute tick by hand (wrap in act). */
    fireTick: () => ticks.fire(),
  }
}
