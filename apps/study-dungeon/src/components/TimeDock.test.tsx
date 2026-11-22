// @vitest-environment jsdom
//
// TimeDock (task 21.4; Requirement 19.1-19.11, 19.13). The shell TimeMachine
// rendered through the dock, with a real DecayEngine on InMemoryAdapter, a
// fixed `realNow`, fake animation frames and an in-memory session storage.
// Never the real clock.
//
// The dock starts collapsed (Req 19.1). Tests that use a jump, Play or a
// marker expand it first with the "Coming up" toggle, as a user would.
//
// Worked by hand from the policy (health = 100 × 0.5^(days / half-life);
// weak below 60, dead below 10). A solid fact (half-life 10) added at T0:
//   weakens at 10 × log2(100 / 60) ≈ 7.37 days → marker on day 8 (days are rounded up)
//   dies at 10 × log2(10) ≈ 33.22 days         → marker on day 34

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, within } from "@testing-library/react"
import type { FrameScheduler } from "@decay-engine/shell"
import { DOCK_HEIGHT_PROPERTY, TimeDock } from "./TimeDock"
import { DOCK_EXPANDED_FLAG, type SessionFlagStorage } from "../dock-state"
import { creatureOf } from "../creatures"
import { DAY_MS } from "../policy"
import { T0, makeEngine } from "../test/fixtures"
import { MemoryStorage } from "../test/app-kit"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.documentElement.style.removeProperty(DOCK_HEIGHT_PROPERTY)
})

/** Frames that run only when the test says so. */
function fakeFrames(): FrameScheduler {
  const queue: (() => void)[] = []
  return {
    request: (callback) => {
      queue.push(callback)
      return queue.length
    },
    cancel: () => {},
  }
}

type Options = {
  offsetMs?: number
  withFact?: boolean
  session?: SessionFlagStorage | null
}

function setup({ offsetMs = 0, withFact = false, session }: Options = {}) {
  const { engine, add } = makeEngine()
  if (withFact) add("s1", "solid", T0)
  const onChange = vi.fn()
  const result = render(
    <TimeDock
      engine={engine}
      realNow={T0}
      offsetMs={offsetMs}
      onChange={onChange}
      formatDate={(ms) => new Date(ms).toISOString().slice(0, 10)}
      version={0}
      frames={fakeFrames()}
      clock={() => 0}
      prefersReducedMotion={() => false}
      session={session}
    />
  )
  const dock = result.container.querySelector<HTMLElement>(".sd-dock")!
  return { ...result, dock, onChange }
}

const toggleOf = (dock: HTMLElement) => within(dock).getByRole("button", { name: "Coming up" })

/** Expands the dock with its toggle, as a user would, and checks that it did. */
function expand(dock: HTMLElement) {
  fireEvent.click(toggleOf(dock))
  expect(dock.hasAttribute("data-open")).toBe(true)
}

/** The accessible name of each focusable control in DOM order (the Tab order, Req 19.9). */
const controlOrder = (dock: HTMLElement) =>
  [...dock.querySelectorAll<HTMLElement>("input, button")].map((el) => {
    const copy = el.cloneNode(true) as HTMLElement
    copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove())
    return el.getAttribute("aria-label") ?? copy.textContent
  })

describe("collapsed by default (Req 19.1, 19.2, 19.12)", () => {
  it("starts collapsed: no timeline, no markers, and the toggle says it is collapsed", () => {
    const { dock } = setup({ withFact: true })
    expect(dock.hasAttribute("data-open")).toBe(false)
    expect(dock.querySelector(".sd-timeline")).toBeNull()
    expect(dock.querySelectorAll(".sd-marker")).toHaveLength(0)
    expect(dock.querySelector(".sd-events")).toBeNull()
    const toggle = toggleOf(dock)
    expect(toggle.tagName).toBe("BUTTON")
    expect(toggle.getAttribute("type")).toBe("button")
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
  })

  it("the collapsed bar keeps the candle, the title, the date line and the slider", () => {
    const { dock } = setup({ offsetMs: 30 * DAY_MS })
    expect(dock.querySelector(".sd-candle")).not.toBeNull()
    expect(dock.querySelector(".shell-time-machine-title")!.textContent).toBe("Time machine")
    // T0 is 1 Oct 2026; 30 days later is 31 Oct.
    expect(dock.querySelector(".shell-time-machine-showing")!.textContent).toBe("2026-10-31 · 30 days ahead")
    expect(within(dock).getByRole("slider", { name: "Days ahead" })).toBeTruthy()
  })

  it('shows the hint "Drag to look ahead" only while collapsed', () => {
    const { dock } = setup()
    expect(within(dock).getByText("Drag to look ahead").classList.contains("sd-dock-hint")).toBe(true)
    expand(dock)
    expect(within(dock).queryByText("Drag to look ahead")).toBeNull()
    fireEvent.click(toggleOf(dock))
    expect(within(dock).getByText("Drag to look ahead")).toBeTruthy()
  })
})

describe("the toggle (Req 19.3, 19.9)", () => {
  it("expands and collapses the dock, keeps its name, and points at the panel it opens", () => {
    const { dock } = setup({ withFact: true })
    const toggle = toggleOf(dock)
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!
    expect(dock.contains(panel)).toBe(true)
    expect(panel.children).toHaveLength(0)

    fireEvent.click(toggle)
    expect(dock.hasAttribute("data-open")).toBe(true)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(panel.querySelector(".sd-timeline")).not.toBeNull()
    expect(panel.querySelectorAll(".sd-marker")).toHaveLength(2)

    fireEvent.click(toggle)
    expect(dock.hasAttribute("data-open")).toBe(false)
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(panel.children).toHaveLength(0)
  })

  it('has the same visible name, "Coming up", in both states; its glyph is hidden from screen readers', () => {
    const { dock } = setup()
    const toggle = toggleOf(dock)
    const name = () => controlOrder(dock)[1]
    expect(toggle.hasAttribute("aria-label")).toBe(false)
    expect(name()).toBe("Coming up")
    expect(toggle.querySelector('[aria-hidden="true"]')!.textContent).toBe("▴")
    fireEvent.click(toggle)
    expect(name()).toBe("Coming up")
    expect(toggle.querySelector('[aria-hidden="true"]')!.textContent).toBe("▾")
  })

  it("is quiet, never filled: Play stays the dock's one primary button", () => {
    const { dock } = setup()
    expand(dock)
    expect(toggleOf(dock).classList.contains("shell-button-primary")).toBe(false)
    expect([...dock.querySelectorAll(".shell-button-primary")].map((b) => b.textContent)).toEqual(["Play"])
  })

  it("comes right after the slider; once expanded, the markers, the jumps and Play follow", () => {
    const { dock } = setup({ withFact: true })
    expand(dock)
    const name = creatureOf("s1").name
    expect(controlOrder(dock)).toEqual([
      "Days ahead",
      "Coming up",
      `Day 8: ${name} weakens`,
      `Day 34: ${name} dies`,
      "+7 days",
      "+14 days",
      "+30 days",
      "Play",
    ])
  })
})

describe("the preview while collapsing and expanding (Req 19.4)", () => {
  it("collapsing and expanding never changes the preview offset", () => {
    const { dock, onChange } = setup({ offsetMs: 30 * DAY_MS })
    expand(dock)
    fireEvent.click(toggleOf(dock))
    expand(dock)
    expect(onChange).not.toHaveBeenCalled()
    expect((within(dock).getByRole("slider") as HTMLInputElement).value).toBe(String(30 * DAY_MS))
    expect(dock.hasAttribute("data-previewing")).toBe(true)
  })

  it("the slider moves the preview while collapsed, and the dock stays collapsed", () => {
    const { dock, onChange } = setup()
    fireEvent.change(within(dock).getByRole("slider"), { target: { value: String(45 * DAY_MS) } })
    expect(dock.hasAttribute("data-open")).toBe(false)
    expect(onChange.mock.calls).toEqual([[45 * DAY_MS]])
  })

  it("once expanded, a jump sets its offset", () => {
    const { dock, onChange } = setup()
    expand(dock)
    fireEvent.click(within(dock).getByRole("button", { name: "+14 days" }))
    expect(onChange.mock.calls).toEqual([[14 * DAY_MS]])
  })
})

describe("the markers (Req 19.6)", () => {
  it('keep their labels ("Day N: name weakens/dies") as name and title, and jump to their day once expanded', () => {
    const { dock, onChange } = setup({ withFact: true })
    expand(dock)
    const name = creatureOf("s1").name
    const track = within(dock).getByRole("group", { name: "Predicted changes" })
    const markers = within(track).getAllByRole("button")
    expect(markers.map((m) => [m.getAttribute("aria-label"), m.getAttribute("title"), m.getAttribute("data-kind")])).toEqual([
      [`Day 8: ${name} weakens`, `Day 8: ${name} weakens`, "weak"],
      [`Day 34: ${name} dies`, `Day 34: ${name} dies`, "dead"],
    ])
    fireEvent.click(markers[1]!)
    expect(onChange.mock.calls).toEqual([[34 * DAY_MS]])
  })

  it('shows the "Next:" line once expanded', () => {
    const { dock } = setup({ withFact: true })
    expand(dock)
    const name = creatureOf("s1").name
    expect(dock.querySelector(".sd-events")!.textContent).toBe(`Next: ${name} weakens in 8d · ${name} dies in 34d`)
  })
})

describe("kept for the tab (Req 19.5)", () => {
  it("keeps the choice in the session storage and starts from it", () => {
    const session = new MemoryStorage()
    const first = setup({ session })
    expect(session.entries()).toEqual({})
    expand(first.dock)
    expect(session.entries()).toEqual({ [DOCK_EXPANDED_FLAG]: "1" })
    cleanup()

    // A reload in the same tab: expanded again.
    const second = setup({ session })
    expect(second.dock.hasAttribute("data-open")).toBe(true)
    expect(toggleOf(second.dock).getAttribute("aria-expanded")).toBe("true")
    fireEvent.click(toggleOf(second.dock))
    expect(session.entries()).toEqual({ [DOCK_EXPANDED_FLAG]: "0" })
    cleanup()

    expect(setup({ session }).dock.hasAttribute("data-open")).toBe(false)
  })

  it("with no session storage, the toggle still works for the page's life", () => {
    const { dock } = setup({ session: null })
    expand(dock)
    fireEvent.click(toggleOf(dock))
    expect(dock.hasAttribute("data-open")).toBe(false)
  })

  it("with a session storage that throws, it starts collapsed and the toggle still works", () => {
    const throwing: SessionFlagStorage = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    }
    const { dock } = setup({ session: throwing })
    expect(dock.hasAttribute("data-open")).toBe(false)
    expand(dock)
    fireEvent.click(toggleOf(dock))
    expect(dock.hasAttribute("data-open")).toBe(false)
  })
})

/** A ResizeObserver stand-in: records what it watches and fires when the test says so. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  readonly observed: Element[] = []
  readonly callback: ResizeObserverCallback
  disconnected = false
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    FakeResizeObserver.instances.push(this)
  }
  observe(element: Element) {
    this.observed.push(element)
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true
  }
  /** Reports a border-box block size, as a browser would after a layout. */
  fire(blockSize: number) {
    const entry = { borderBoxSize: [{ blockSize, inlineSize: 1000 }] } as unknown as ResizeObserverEntry
    this.callback([entry], this as unknown as ResizeObserver)
  }
}

describe("the page's room for the dock (Req 19.7, 19.13)", () => {
  const root = () => document.documentElement

  it("with ResizeObserver: --dock-h on the root element equals the dock's height, and is removed with the dock", () => {
    FakeResizeObserver.instances = []
    vi.stubGlobal("ResizeObserver", FakeResizeObserver)
    const { dock, unmount } = setup()
    expect(FakeResizeObserver.instances).toHaveLength(1)
    const observer = FakeResizeObserver.instances[0]!
    expect(observer.observed).toEqual([dock])

    observer.fire(118)
    expect(root().style.getPropertyValue(DOCK_HEIGHT_PROPERTY)).toBe("118px")
    // Expanded the dock grows; a fraction rounds up, so the room is never short.
    observer.fire(266.2)
    expect(root().style.getPropertyValue(DOCK_HEIGHT_PROPERTY)).toBe("267px")

    unmount()
    expect(observer.disconnected).toBe(true)
    expect(root().style.getPropertyValue(DOCK_HEIGHT_PROPERTY)).toBe("")
  })

  it("without ResizeObserver: nothing is set, so the CSS fallbacks apply", () => {
    vi.stubGlobal("ResizeObserver", undefined)
    setup()
    expect(root().style.getPropertyValue(DOCK_HEIGHT_PROPERTY)).toBe("")
  })
})
