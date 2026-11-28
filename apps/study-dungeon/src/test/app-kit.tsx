// Test kit for App-level tests (round 6): a real DecayEngine on an
// InMemoryAdapter, a hand-moved clock, a fake tick scheduler, no animation
// frames, an in-memory storage for the first-run flag and a reload spy.
// Never the real clock, never real timers, never window.localStorage.

import { fireEvent, render, screen, within } from "@testing-library/react"
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
  /**
   * The dock's session storage (task 21.1). Defaults to a new in-memory one
   * per kit, so an expanded dock in one test never leaks into the next.
   */
  session?: AppProps["session"]
  /**
   * Task L5: the Notification class. Defaults to null (no Notification API,
   * as in jsdom), so earlier tests are unchanged.
   */
  notifications?: AppProps["notifications"]
  /** Task L5: called when a notification is clicked. */
  focusWindow?: AppProps["focusWindow"]
  /** Passed to the sync panel in the Profile sheet (a fake sync server). */
  syncProps?: AppProps["syncProps"]
  /** The id from `?tend=<id>` (feedback list, point 6). */
  tendId?: AppProps["tendId"]
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
  const session = options.session === undefined ? new MemoryStorage() : options.session
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
        session={session}
        notifications={options.notifications ?? null}
        {...(options.focusWindow === undefined ? {} : { focusWindow: options.focusWindow })}
        // No sync server unless a test passes one, whatever the build's .env says.
        syncProps={{ env: {}, ...options.syncProps }}
        {...(options.tendId === undefined ? {} : { tendId: options.tendId })}
        formatTime={(ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ")}
      />
    )
  }

  return {
    engine,
    storage,
    session,
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

/** Opens the Settings side sheet (feedback list, point 7), where the sound switch, backup, reset and the rest now live. */
export function openSettings(): void {
  fireEvent.click(screen.getByRole("button", { name: "Settings" }))
}

/** Closes the Settings sheet with its own Close button, so a later "Close" is the dialog's. */
export function closeSettings(): void {
  fireEvent.click(within(document.getElementById("sd-settings-sheet")!).getByRole("button", { name: "Close" }))
}

/** Opens the Profile side sheet: sync and the activity history. */
export function openProfile(): void {
  fireEvent.click(screen.getByRole("button", { name: /^(Sync|Profile)$/ }))
}
