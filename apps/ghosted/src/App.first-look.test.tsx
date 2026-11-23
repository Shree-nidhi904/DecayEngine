// The first ten seconds (task L6, Req 40, design section 17.6). A real engine
// on RecordingAdapter, in-memory flag storage, a fixed clock, a tick
// scheduler that never fires, and fake animation frames with a fake frame
// clock, so the dock's own Play steps only when the test says so.

import "./test/dialog-polyfill"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { FrameScheduler } from "@decay-engine/shell"
import { ANNOUNCER_ID, App } from "./App"
import { FIRST_LOOK_FLAG } from "./first-look"
import type { FlagStorage } from "./first-run"
import { SPLASH_SEEN_FLAG } from "./splash"
import type { Scheduler } from "./ticking"
import { FakeStorage } from "./test/fake-storage"
import { DAY_MS, T0, makeEngine } from "./test/fixtures"
import { RecordingAdapter } from "./test/recording-adapter"

afterEach(cleanup)

const idleScheduler: Scheduler = { setInterval: () => 1, clearInterval: () => {} }
const ANNOUNCE = "Showing the next 30 days. Nothing is saved."

/** Frames that run only on flush(), and the time the shell's Play reads. */
function fakeFrames() {
  const queue = new Map<number, () => void>()
  let next = 1
  const state = { time: 0 }
  const scheduler: FrameScheduler = {
    request: (callback) => {
      const handle = next++
      queue.set(handle, callback)
      return handle
    },
    cancel: (handle) => {
      queue.delete(handle as number)
    },
  }
  return {
    scheduler,
    clock: () => state.time,
    pending: () => queue.size,
    /** Moves the frame clock to `ms` and runs the frames waiting now. */
    at(ms: number) {
      state.time = ms
      const waiting = [...queue.values()]
      queue.clear()
      act(() => {
        for (const callback of waiting) callback()
      })
    },
  }
}

type Options = {
  storage?: FlagStorage
  session?: FakeStorage | null
  reducedMotion?: boolean
  firstLook?: boolean
}

function setup({ storage = new FakeStorage(), session, reducedMotion = false, firstLook = true }: Options = {}) {
  const adapter = new RecordingAdapter()
  const engine = makeEngine(adapter)
  const frames = fakeFrames()
  let splash: FakeStorage | null
  if (session === undefined) {
    splash = new FakeStorage()
    splash.setItem(SPLASH_SEEN_FLAG, "1")
  } else {
    splash = session
  }
  const result = render(
    <App
      engine={engine}
      storage={storage}
      session={splash}
      clock={() => T0}
      tickScheduler={idleScheduler}
      frameScheduler={frames.scheduler}
      frameClock={frames.clock}
      prefersReducedMotion={() => reducedMotion}
      timeZone="UTC"
      notifications={null}
      firstLook={firstLook}
    />
  )
  return { ...result, adapter, engine, frames, storage }
}

const loadSample = () => fireEvent.click(screen.getByRole("button", { name: "Load sample street" }))
const skipButton = () => screen.queryByRole("button", { name: "Skip the preview" })
const slider = () => screen.getByRole("slider") as HTMLInputElement
const offset = () => Number(slider().value)
const announcer = () => document.getElementById(ANNOUNCER_ID)!
const previewing = (container: HTMLElement) => container.querySelector(".gh-app")!.hasAttribute("data-previewing")
const playButton = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>(".shell-time-machine-controls .shell-button-primary")!

describe("the first look starts only on the first sample load (Req 40.1, 40.2, 40.9)", () => {
  it("plays the plan on the dock's Play, with the banner, then returns to today", () => {
    const { container, frames, storage } = setup()
    expect(storage.getItem(FIRST_LOOK_FLAG)).toBeNull()
    loadSample()

    // Started: the flag first, one announcement, the Skip button, Play running.
    expect(storage.getItem(FIRST_LOOK_FLAG)).toBe("1")
    expect(announcer().textContent).toBe(ANNOUNCE)
    expect(skipButton()).not.toBeNull()
    expect(frames.pending()).toBe(1)
    expect(offset()).toBe(0)

    frames.at(2_000)
    expect(offset()).toBe(15 * DAY_MS)
    expect(previewing(container)).toBe(true)
    expect(screen.getByRole("button", { name: /back to today/i })).toBeTruthy()

    frames.at(4_500)
    expect(offset()).toBe(30 * DAY_MS)
    // The street is shown 30 days ahead: Sunita, Meera and Dan have gone dark.
    expect(screen.getByRole("region", { name: "Empty windows" }).querySelectorAll(".gh-card-name")).toHaveLength(7)

    frames.at(5_000)
    expect(offset()).toBe(0)
    expect(previewing(container)).toBe(false)
    expect(skipButton()).toBeNull()
    expect(frames.pending()).toBe(0)
  })

  it("says its sentence once and nothing else while it plays, in the one live region", () => {
    const { container, frames } = setup()
    loadSample()
    // Counted after the sample loads: loading data adds the page's other polite region, which is not L6's.
    const regions = container.querySelectorAll("[aria-live]").length
    expect(skipButton()!.closest("[aria-live]")).toBeNull()
    const said = announcer().querySelector("p")
    frames.at(1_000)
    frames.at(3_000)
    expect(announcer().querySelector("p")).toBe(said)
    expect(announcer().textContent).toBe(ANNOUNCE)
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(regions)
  })

  it("saves nothing while it plays (Req 40.5)", () => {
    const { adapter, frames, storage } = setup()
    loadSample()
    const saves = adapter.saves
    const snapshot = adapter.lastSnapshotJson
    const flags = ["ghosted:started", "ghosted:own-people", FIRST_LOOK_FLAG].map((k) => storage.getItem(k))
    frames.at(1_000)
    frames.at(2_500)
    frames.at(4_500)
    expect(adapter.saves).toBe(saves)
    expect(adapter.lastSnapshotJson).toBe(snapshot)
    expect(["ghosted:started", "ghosted:own-people", FIRST_LOOK_FLAG].map((k) => storage.getItem(k))).toEqual(flags)
  })

  it("does not move focus when it starts", () => {
    const { container } = setup()
    const importButton = container.querySelector<HTMLButtonElement>('[data-action="import"]')!
    importButton.focus()
    loadSample()
    expect(skipButton()).not.toBeNull()
    expect(document.activeElement).toBe(importButton)
  })

  it("does not start with the flag set, as after a reload or a reset", () => {
    const storage = new FakeStorage()
    storage.setItem(FIRST_LOOK_FLAG, "1")
    const { frames } = setup({ storage })
    loadSample()
    expect(skipButton()).toBeNull()
    expect(announcer().textContent).not.toBe(ANNOUNCE)
    expect(frames.pending()).toBe(0)
  })

  it("keeps the flag across a reload of the same storage, so it never plays twice", () => {
    const storage = new FakeStorage()
    const first = setup({ storage })
    loadSample()
    first.frames.at(5_000)
    cleanup()
    // A new page with the same storage and an empty engine (as after "Reset all data").
    storage.removeItem("ghosted:started")
    const second = setup({ storage })
    loadSample()
    expect(skipButton()).toBeNull()
    expect(second.frames.pending()).toBe(0)
  })

  it("under reduced motion does not play, and the flag is still set (Req 40.3)", () => {
    const { frames, storage, container } = setup({ reducedMotion: true })
    loadSample()
    expect(storage.getItem(FIRST_LOOK_FLAG)).toBe("1")
    expect(skipButton()).toBeNull()
    expect(frames.pending()).toBe(0)
    expect(previewing(container)).toBe(false)
    expect(announcer().textContent).not.toBe(ANNOUNCE)
  })

  it("waits for the splash to close", () => {
    const { frames } = setup({ session: new FakeStorage() })
    expect(screen.getByRole("button", { name: "Walk in" })).toBeTruthy()
    loadSample()
    expect(skipButton()).toBeNull()
    expect(frames.pending()).toBe(0)
    fireEvent.click(screen.getByRole("button", { name: "Walk in" }))
    expect(skipButton()).not.toBeNull()
    expect(frames.pending()).toBe(1)
  })

  it("waits for an open dialog to close", () => {
    const { container, frames } = setup()
    fireEvent.click(container.querySelector('[data-action="import"]')!)
    const dialog = container.querySelector("dialog")!
    loadSample()
    expect(skipButton()).toBeNull()
    expect(frames.pending()).toBe(0)
    const close = within(dialog)
      .getAllByRole("button")
      .find((b) => /cancel|close/i.test(b.textContent ?? ""))!
    fireEvent.click(close)
    expect(container.querySelector("dialog")).toBeNull()
    expect(skipButton()).not.toBeNull()
  })

  it("does nothing without the firstLook prop (Req 40.11)", () => {
    const { frames, storage } = setup({ firstLook: false })
    loadSample()
    expect(skipButton()).toBeNull()
    expect(frames.pending()).toBe(0)
    expect(storage.getItem(FIRST_LOOK_FLAG)).toBeNull()
  })

  it("a storage that throws for the flag still loads the sample, and the first look does not play", () => {
    const inner = new FakeStorage()
    const storage: FlagStorage = {
      getItem: (key) => {
        if (key === FIRST_LOOK_FLAG) throw new Error("blocked")
        return inner.getItem(key)
      },
      setItem: (key, value) => {
        if (key === FIRST_LOOK_FLAG) throw new DOMException("full", "QuotaExceededError")
        inner.setItem(key, value)
      },
      removeItem: (key) => inner.removeItem(key),
    }
    const { engine, frames } = setup({ storage })
    loadSample()
    expect(engine.view(T0)).toHaveLength(12)
    expect(skipButton()).toBeNull()
    expect(frames.pending()).toBe(0)
  })
})

describe("Skip and the other ways out (Req 40.7, 40.8)", () => {
  /** Starts the first look and moves it to +15 days. */
  function playing() {
    const ctx = setup()
    loadSample()
    ctx.frames.at(2_000)
    expect(offset()).toBe(15 * DAY_MS)
    return ctx
  }

  /** Back at today, no Skip, and no Play frame left to move it again. */
  function expectStopped(ctx: ReturnType<typeof setup>) {
    expect(offset()).toBe(0)
    expect(previewing(ctx.container)).toBe(false)
    expect(skipButton()).toBeNull()
    ctx.frames.at(3_000)
    ctx.frames.at(5_000)
    expect(offset()).toBe(0)
    expect(ctx.frames.pending()).toBe(0)
  }

  it("Skip is a real, named button in the Tab order", () => {
    playing()
    const skip = skipButton()!
    expect(skip.tagName).toBe("BUTTON")
    expect(skip.getAttribute("type")).toBe("button")
    expect(skip.tabIndex).toBe(0)
    expect(skip.hasAttribute("disabled")).toBe(false)
    expect(skip.hasAttribute("aria-disabled")).toBe(false)
    expect(skip.closest(".gh-dock")).not.toBeNull()
  })

  it("Skip stops it and returns to today; focus on Skip goes to the hero heading", () => {
    const ctx = playing()
    const skip = skipButton()!
    skip.focus()
    fireEvent.click(skip)
    expectStopped(ctx)
    const hero = within(screen.getByRole("main")).getAllByRole("heading", { level: 2 })[0]!
    expect(document.activeElement).toBe(hero)
  })

  it("Escape stops it", () => {
    const ctx = playing()
    fireEvent.keyDown(document, { key: "Escape" })
    expectStopped(ctx)
  })

  it("moving the slider stops it, and that touch does not move the offset", () => {
    const ctx = playing()
    fireEvent.change(slider(), { target: { value: String(10 * DAY_MS) } })
    expectStopped(ctx)
  })

  it("Play (reading Stop) stops it", () => {
    const ctx = playing()
    fireEvent.click(playButton(ctx.container))
    expectStopped(ctx)
  })

  it("a jump stops it", () => {
    const ctx = playing()
    const jump = ctx.container.querySelector<HTMLButtonElement>(".shell-time-machine-controls .shell-button-quiet")!
    fireEvent.click(jump)
    expectStopped(ctx)
  })

  it("Back to today stops it", () => {
    const ctx = playing()
    fireEvent.click(screen.getByRole("button", { name: /back to today/i }))
    expectStopped(ctx)
  })

  it("a dialog opening stops it", () => {
    const ctx = playing()
    const pane = screen.getByRole("region", { name: "The Street" }).querySelector<HTMLButtonElement>("button.gh-win")!
    fireEvent.click(pane)
    expect(ctx.container.querySelector("dialog")).not.toBeNull()
    expectStopped(ctx)
  })

  it("after it ends, the slider works as before", () => {
    const ctx = playing()
    fireEvent.click(skipButton()!)
    fireEvent.change(slider(), { target: { value: String(10 * DAY_MS) } })
    expect(offset()).toBe(10 * DAY_MS)
    expect(previewing(ctx.container)).toBe(true)
  })
})
