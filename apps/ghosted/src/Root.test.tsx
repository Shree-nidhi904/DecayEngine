// Root.tsx (task 2.8; Req 23.3, 20.7, design section 9.1): a real engine that
// cannot load its snapshot shows the problem screen; no usable storage shows
// its sentence; any other error reaches the crash screen; a working engine
// renders the App frame. Fixed times, a fake reload, an in-memory storage.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { DecayEngineError, type StorageAdapter } from "@decay-engine/engine"
import { Root } from "./Root"
import { ANNOUNCER_ID } from "./App"
import { problemScreenText } from "./components/ErrorBoundary"
import { ENGINE_STORAGE_KEY, OWN_PEOPLE_FLAG, STARTED_FLAG } from "./first-run"
import { storageProblemText } from "./storage-errors"
import type { Scheduler } from "./ticking"
import { FakeStorage } from "./test/fake-storage"
import { T0, makeEngine } from "./test/fixtures"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Never fires: the tick on mount is enough for these tests. */
const idleScheduler: Scheduler = { setInterval: () => 1, clearInterval: () => {} }
const appProps = { clock: () => T0, tickScheduler: idleScheduler, timeZone: "UTC" }

/** An adapter whose stored text is a JSON array: the engine rejects it as INVALID_SNAPSHOT. */
const corruptAdapter: StorageAdapter = { load: () => JSON.parse("[1, 2, 3]"), save: () => {} }

/** An adapter that cannot reach storage, as LocalStorageAdapter reports it. */
const unavailableAdapter: StorageAdapter = {
  load: () => {
    throw new DecayEngineError("STORAGE_UNAVAILABLE", "localStorage is not available")
  },
  save: () => {},
}

describe("Root", () => {
  it("a corrupt snapshot shows the problem screen with Reload and Reset, and Reset clears only Ghosted's keys", () => {
    const storage = new FakeStorage({
      [ENGINE_STORAGE_KEY]: "[1, 2, 3]",
      [STARTED_FLAG]: "1",
      [OWN_PEOPLE_FLAG]: "1",
      "decay-engine:study-dungeon": "{}",
    })
    const reload = vi.fn()
    render(
      <Root createEngine={() => makeEngine(corruptAdapter)} storage={storage} session={null} reload={reload} appProps={appProps} />
    )

    const screenEl = screen.getByRole("alert")
    expect(screenEl.textContent).toContain(storageProblemText.corrupt)
    fireEvent.click(screen.getByRole("button", { name: problemScreenText.reload }))
    expect(reload).toHaveBeenCalledTimes(1)

    // Reset asks first, then removes exactly Ghosted's keys and reloads.
    fireEvent.click(screen.getByRole("button", { name: problemScreenText.reset }))
    expect(screen.getByText(problemScreenText.confirmReset)).toBeTruthy()
    expect(storage.removed).toEqual([])
    fireEvent.click(screen.getByRole("button", { name: problemScreenText.confirm }))
    expect(storage.removed).toEqual([ENGINE_STORAGE_KEY, STARTED_FLAG, OWN_PEOPLE_FLAG])
    expect(storage.snapshot()).toEqual({ "decay-engine:study-dungeon": "{}" })
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it("Cancel on the reset question removes nothing", () => {
    const storage = new FakeStorage({ [STARTED_FLAG]: "1" })
    render(
      <Root createEngine={() => makeEngine(corruptAdapter)} storage={storage} session={null} reload={vi.fn()} appProps={appProps} />
    )
    fireEvent.click(screen.getByRole("button", { name: problemScreenText.reset }))
    fireEvent.click(screen.getByRole("button", { name: problemScreenText.cancel }))
    expect(storage.removed).toEqual([])
    expect(screen.getByRole("button", { name: problemScreenText.reload })).toBeTruthy()
  })

  it("storage the engine cannot reach shows its sentence with Reload and no Reset", () => {
    const reload = vi.fn()
    render(
      <Root
        createEngine={() => makeEngine(unavailableAdapter)}
        storage={new FakeStorage()}
        session={null}
        reload={reload}
        appProps={appProps}
      />
    )
    expect(screen.getByRole("alert").textContent).toContain(storageProblemText.unavailable)
    expect(screen.queryByRole("button", { name: problemScreenText.reset })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: problemScreenText.reload }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("no usable localStorage for the flags shows the unavailable sentence", () => {
    render(<Root createEngine={() => makeEngine()} storage={null} session={null} reload={vi.fn()} appProps={appProps} />)
    expect(screen.getByRole("alert").textContent).toContain(storageProblemText.unavailable)
    expect(screen.queryByRole("button", { name: problemScreenText.reset })).toBeNull()
  })

  it("any other error reaches the crash screen and is logged, never hidden", () => {
    // React reports the caught error to console.error as well; keep the output quiet.
    vi.spyOn(console, "error").mockImplementation(() => {})
    const bug = new Error("not a storage problem")
    const log = vi.fn()
    render(
      <Root
        createEngine={() => {
          throw bug
        }}
        storage={new FakeStorage()}
        session={null}
        reload={vi.fn()}
        log={log}
        appProps={appProps}
      />
    )
    expect(screen.getByRole("alert").textContent).toContain(problemScreenText.crashed)
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(problemScreenText.title)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]![0]).toBe(bug)
    // Storage can be used, so the crash screen offers the reset too.
    expect(screen.getByRole("button", { name: problemScreenText.reset })).toBeTruthy()
  })

  it("a working engine renders the App frame: one h1, the main landmark and the live region", () => {
    render(<Root createEngine={() => makeEngine()} storage={new FakeStorage()} session={null} reload={vi.fn()} appProps={appProps} />)
    const headings = screen.getAllByRole("heading", { level: 1 })
    expect(headings.map((h) => h.textContent)).toEqual(["Ghosted"])
    expect(screen.getByRole("banner").textContent).toContain("People you are losing touch with")
    const main = screen.getByRole("main")
    const announcer = document.getElementById(ANNOUNCER_ID)
    expect(announcer).not.toBeNull()
    expect(main.contains(announcer)).toBe(true)
    expect(announcer!.getAttribute("aria-live")).toBe("polite")
    expect(screen.queryByRole("alert")).toBeNull()
  })
})
