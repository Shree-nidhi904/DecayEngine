// @vitest-environment jsdom
//
// Root (task 18.3): the engine is built through createEngineSafely, and the
// App sits inside the ErrorBoundary. A damaged snapshot shows the problem
// screen instead of a blank page, and its reset removes exactly the app's
// keys (RESET_KEYS: the snapshot, the first-run flag and the tour flag).
//
// The corrupt-snapshot tests use the real createEngine from engine-instance.ts,
// so the real LocalStorageAdapter reads jsdom's localStorage. Reload and
// logging are fakes; the App gets a fixed clock and a fake tick scheduler.

import "./test/dialog-polyfill"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { DecayEngine, InMemoryAdapter } from "@decay-engine/engine"
import type { FrameScheduler } from "@decay-engine/shell"
import { Root, type RootProps } from "./Root"
import { createEngine } from "./engine-instance"
import { ENGINE_STORAGE_KEY, STARTED_FLAG, TOUR_DONE_FLAG } from "./first-run"
import { SOUND_SETTING_KEY } from "./sound"
import { storageProblemText } from "./storage-errors"
import { problemScreenText } from "./components/ErrorBoundary"
import { studyDungeonPolicy, type FactPayload, type FactPolicyData, type ReviewEvent } from "./policy"
import type { Scheduler } from "./ticking"
import { day } from "./test/fixtures"

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

const noTicks: Scheduler = { setInterval: () => 1, clearInterval() {} }
const noFrames: FrameScheduler = {
  request() {
    throw new Error("test bug: Play was not expected")
  },
  cancel() {},
}
const appProps: RootProps["appProps"] = {
  clock: () => day(1),
  tickScheduler: noTicks,
  frameScheduler: noFrames,
  frameClock: () => 0,
  prefersReducedMotion: () => false,
  formatDate: (ms) => new Date(ms).toISOString().slice(0, 10),
  timeZone: "UTC",
}

/** Everything left in jsdom's localStorage, except quarantine copies (see quarantined). */
function stored(): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!
    if (key.startsWith(`${ENGINE_STORAGE_KEY}:corrupt-`)) continue
    out[key] = localStorage.getItem(key)!
  }
  return out
}

/** The texts of the copies kept of unreadable snapshots (@decay-engine/persist quarantineSnapshot). */
function quarantined(): string[] {
  const out: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!
    if (key.startsWith(`${ENGINE_STORAGE_KEY}:corrupt-`)) out.push(localStorage.getItem(key)!)
  }
  return out
}

const button = (name: string) => screen.getByRole("button", { name })
const problem = () => screen.getByRole("alert")

function renderRoot(props: Partial<RootProps> = {}) {
  const reload = vi.fn()
  const log = vi.fn()
  render(
    <Root createEngine={createEngine} storage={localStorage} reload={reload} log={log} appProps={appProps} {...props} />
  )
  return { reload, log }
}

describe("a snapshot that cannot be read", () => {
  // Both are what the engine's loader rejects: text that is not JSON, and a
  // schema version it does not know.
  it.each([
    ["text that is not JSON", "{not json"],
    ["an unknown schema version", JSON.stringify({ schemaVersion: 99, items: [], history: [] })],
  ])("(%s) shows the problem screen with the corrupt sentence, not the app", (_label, snapshot) => {
    localStorage.setItem(ENGINE_STORAGE_KEY, snapshot)
    const { log } = renderRoot()

    expect(problem().textContent).toContain(problemScreenText.title)
    expect(problem().textContent).toContain(storageProblemText.corrupt)
    expect(screen.queryByRole("tablist")).toBeNull()
    expect(screen.queryByText("Welcome to the Study Dungeon")).toBeNull()
    // A storage problem, not a crash: nothing is logged.
    expect(log).not.toHaveBeenCalled()
  })

  it("Reset all data asks first, then removes exactly the app's keys and reloads", () => {
    localStorage.setItem(ENGINE_STORAGE_KEY, "{not json")
    localStorage.setItem(STARTED_FLAG, "1")
    localStorage.setItem(TOUR_DONE_FLAG, "1")
    localStorage.setItem(SOUND_SETTING_KEY, "on")
    localStorage.setItem("decay-engine:ghosted", "other app")
    const { reload } = renderRoot()

    fireEvent.click(button("Reset all data"))
    expect(screen.getByText("Reset all data? This cannot be undone.")).toBeTruthy()
    expect(reload).not.toHaveBeenCalled()
    expect(stored()[ENGINE_STORAGE_KEY]).toBe("{not json")

    fireEvent.click(button("Reset"))
    // The sound setting is a preference for this browser and is kept; so is another app's data.
    expect(stored()).toEqual({ [SOUND_SETTING_KEY]: "on", "decay-engine:ghosted": "other app" })
    expect(reload).toHaveBeenCalledTimes(1)
    // Reset does not take the unreadable text with it: a copy was kept at startup.
    expect(quarantined()).toContain("{not json")
  })

  it("Reload only reloads", () => {
    localStorage.setItem(ENGINE_STORAGE_KEY, "{not json")
    const { reload } = renderRoot()
    fireEvent.click(button("Reload"))
    expect(reload).toHaveBeenCalledTimes(1)
    expect(stored()).toEqual({ [ENGINE_STORAGE_KEY]: "{not json" })
  })
})

describe("storage that cannot be used at startup", () => {
  it("shows the unavailable sentence and offers no reset", () => {
    const blocked = Object.assign(new Error("The operation is insecure."), { name: "SecurityError" })
    renderRoot({
      createEngine: () => {
        throw blocked
      },
    })
    expect(problem().textContent).toContain(storageProblemText.unavailable)
    expect(screen.queryByRole("button", { name: "Reset all data" })).toBeNull()
    expect(button("Reload")).toBeTruthy()
  })

  it("shows the unavailable sentence when the flags have nowhere to go", () => {
    renderRoot({ storage: null })
    expect(problem().textContent).toContain(storageProblemText.unavailable)
  })
})

describe("a healthy start", () => {
  it("renders the App: with nothing saved, the first-run welcome", () => {
    renderRoot()
    expect(screen.getByRole("heading", { name: "Welcome to the Study Dungeon" })).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("the error boundary around the App", () => {
  function engineThatCrashesOnView() {
    const engine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(
      studyDungeonPolicy,
      new InMemoryAdapter(),
      () => "x"
    )
    vi.spyOn(engine, "view").mockImplementation(() => {
      throw new Error("render bug")
    })
    return engine
  }

  it("a crash while rendering shows the crash screen, logs the error, and offers the reset", () => {
    // React reports the caught error on the console as well; keep the output clean.
    vi.spyOn(console, "error").mockImplementation(() => {})
    localStorage.setItem(STARTED_FLAG, "1")
    localStorage.setItem("unrelated", "keep me")
    const engine = engineThatCrashesOnView()
    const { log, reload } = renderRoot({ createEngine: () => engine })

    expect(problem().textContent).toContain(problemScreenText.crashed)
    expect(log).toHaveBeenCalledTimes(1)
    expect((log.mock.calls[0]![0] as Error).message).toBe("render bug")

    fireEvent.click(button("Reset all data"))
    fireEvent.click(button("Reset"))
    expect(stored()).toEqual({ unrelated: "keep me" })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("an engine error that is not a storage problem is a crash, not a storage message", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const bug = new Error("constructor bug")
    const { log } = renderRoot({
      createEngine: () => {
        throw bug
      },
    })
    expect(problem().textContent).toContain(problemScreenText.crashed)
    expect(problem().textContent).not.toContain(storageProblemText.corrupt)
    expect(log.mock.calls[0]![0]).toBe(bug)
  })
})
