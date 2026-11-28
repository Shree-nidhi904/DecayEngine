// @vitest-environment jsdom
// The first ten seconds (task L6, Requirement 25, design "The First Ten
// Seconds"). A real engine with the Study Dungeon policy on a recording
// adapter, in-memory flag storage, a fixed clock, a tick scheduler that never
// fires, and fake animation frames with a fake frame clock, so the dock's
// own Play steps only when the test says so. The App kit is not used: it
// gives Play no frames on purpose.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { DecayEngine, InMemoryAdapter, type StoredSnapshot } from "@decay-engine/engine"
import type { FrameScheduler } from "@decay-engine/shell"
import { ANNOUNCER_ID, App } from "./App"
import { FIRST_LOOK_FLAG } from "./first-look"
import { STARTED_FLAG, TOUR_DONE_FLAG, type FlagStorage } from "./first-run"
import { studyDungeonPolicy, type FactPayload, type FactPolicyData, type ReviewEvent } from "./policy"
import type { Scheduler } from "./ticking"
import { MemoryStorage } from "./test/app-kit"

afterEach(cleanup)

const T0 = 1_700_000_000_000
const DAY_MS = 86_400_000
const ANNOUNCE = "Showing the next 30 days. Nothing is saved."
const idleScheduler: Scheduler = { setInterval: () => 1, clearInterval: () => {} }

/** Counts saves and keeps the last snapshot as JSON. */
class RecordingAdapter extends InMemoryAdapter {
  saves = 0
  last: string | null = null
  override save(snapshot: StoredSnapshot): void {
    this.saves++
    super.save(snapshot)
    this.last = JSON.stringify(snapshot)
  }
}

/** Frames that run only when the test moves the frame clock. */
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

type Options = { storage?: FlagStorage; reducedMotion?: boolean; firstLook?: boolean }

function setup({
  storage = new MemoryStorage({ [TOUR_DONE_FLAG]: "1" }),
  reducedMotion = false,
  firstLook = true,
}: Options = {}) {
  const adapter = new RecordingAdapter()
  let next = 0
  const engine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(studyDungeonPolicy, adapter, () => `id-${next++}`)
  const frames = fakeFrames()
  const result = render(
    <App
      engine={engine}
      clock={() => T0}
      tickScheduler={idleScheduler}
      frameScheduler={frames.scheduler}
      frameClock={frames.clock}
      prefersReducedMotion={() => reducedMotion}
      formatDate={(ms) => new Date(ms).toISOString().slice(0, 10)}
      storage={storage}
      reload={() => {}}
      timeZone="UTC"
      defaultAnswerCheck="self"
      session={new MemoryStorage()}
      notifications={null}
      firstLook={firstLook}
    />
  )
  return { ...result, adapter, engine, frames, storage }
}

const loadSample = () => fireEvent.click(screen.getByRole("button", { name: /load sample data/i }))
const skipButton = () => screen.queryByRole("button", { name: "Skip the preview" })
const slider = () => screen.getByRole("slider") as HTMLInputElement
const offset = () => Number(slider().value)
const announcer = () => document.getElementById(ANNOUNCER_ID)!
const previewing = (container: HTMLElement) => container.querySelector(".sd-world")!.hasAttribute("data-previewing")
const playButton = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>(".shell-time-machine-controls .shell-button-primary")!

describe("the first look starts only on the first sample load (Requirement 25.1, 25.2, 25.9)", () => {
  it("plays the plan on the dock's Play, with the top banner, then returns to today", () => {
    const { container, frames, storage, engine } = setup()
    loadSample()
    expect(engine.view(T0)).toHaveLength(12)

    expect(storage.getItem(FIRST_LOOK_FLAG)).toBe("1")
    expect(announcer().textContent).toBe(ANNOUNCE)
    expect(skipButton()).not.toBeNull()
    expect(skipButton()!.closest(".sd-dock")).not.toBeNull()
    expect(frames.pending()).toBe(1)
    expect(offset()).toBe(0)

    frames.at(2_000)
    expect(offset()).toBe(15 * DAY_MS)
    expect(previewing(container)).toBe(true)
    expect(screen.getByRole("button", { name: /back to today/i })).toBeTruthy()

    frames.at(4_500)
    expect(offset()).toBe(30 * DAY_MS)

    frames.at(5_000)
    expect(offset()).toBe(0)
    expect(previewing(container)).toBe(false)
    expect(skipButton()).toBeNull()
    expect(frames.pending()).toBe(0)
  })

  it("says its sentence once and nothing else while it plays, in the one live region", () => {
    const { container, frames } = setup()
    loadSample()
    const regions = container.querySelectorAll("[aria-live]").length
    const said = announcer().querySelector("p")
    frames.at(1_000)
    frames.at(3_000)
    expect(announcer().querySelector("p")).toBe(said)
    expect(announcer().textContent).toBe(ANNOUNCE)
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(regions)
  })

  it("saves nothing while it plays (Requirement 25.5)", () => {
    const { adapter, frames, storage } = setup()
    loadSample()
    const saves = adapter.saves
    const snapshot = adapter.last
    const flags = (storage as MemoryStorage).entries()
    frames.at(1_000)
    frames.at(2_500)
    frames.at(4_500)
    expect(adapter.saves).toBe(saves)
    expect(adapter.last).toBe(snapshot)
    expect((storage as MemoryStorage).entries()).toEqual(flags)
  })

  it("does not start with the flag set, as after a reload or a reset", () => {
    const { frames } = setup({ storage: new MemoryStorage({ [TOUR_DONE_FLAG]: "1", [FIRST_LOOK_FLAG]: "1" }) })
    loadSample()
    expect(skipButton()).toBeNull()
    expect(frames.pending()).toBe(0)
  })

  it("keeps the flag across a reload of the same storage, so it never plays twice", () => {
    const storage = new MemoryStorage({ [TOUR_DONE_FLAG]: "1" })
    const first = setup({ storage })
    loadSample()
    first.frames.at(5_000)
    cleanup()
    storage.removeItem(STARTED_FLAG)
    const second = setup({ storage })
    loadSample()
    expect(skipButton()).toBeNull()
    expect(second.frames.pending()).toBe(0)
  })

  it("under reduced motion does not play, and the flag is still set (Requirement 25.3)", () => {
    const { container, frames, storage } = setup({ reducedMotion: true })
    loadSample()
    expect(storage.getItem(FIRST_LOOK_FLAG)).toBe("1")
    expect(skipButton()).toBeNull()
    expect(frames.pending()).toBe(0)
    expect(previewing(container)).toBe(false)
    expect(announcer().textContent).not.toBe(ANNOUNCE)
  })

  it("does nothing without the firstLook prop (Requirement 25.11)", () => {
    const { frames, storage } = setup({ firstLook: false })
    loadSample()
    expect(skipButton()).toBeNull()
    expect(frames.pending()).toBe(0)
    expect(storage.getItem(FIRST_LOOK_FLAG)).toBeNull()
  })

  it("a storage that throws for the flag still loads the sample, and the first look does not play", () => {
    const inner = new MemoryStorage({ [TOUR_DONE_FLAG]: "1" })
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

describe("Skip and the other ways out (Requirement 25.7, 25.8)", () => {
  function playing() {
    const ctx = setup()
    loadSample()
    ctx.frames.at(2_000)
    expect(offset()).toBe(15 * DAY_MS)
    return ctx
  }

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
  })

  it("Skip stops it and returns to today; focus on Skip goes to <main>", () => {
    const ctx = playing()
    const skip = skipButton()!
    skip.focus()
    fireEvent.click(skip)
    expectStopped(ctx)
    expect(document.activeElement).toBe(screen.getByRole("main"))
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

  it("Back to today on the time bar stops it", () => {
    const ctx = playing()
    fireEvent.click(screen.getByRole("button", { name: /back to today/i }))
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
