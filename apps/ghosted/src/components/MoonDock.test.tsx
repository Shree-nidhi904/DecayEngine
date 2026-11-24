// MoonDock (task 5.1; Req 12.1, 12.3, 12.4, 12.5, 12.6, 12.7, 25.3, 26).
// The shell TimeMachine and PreviewBanner rendered through the dock, with a
// fixed `today`, a fake frame scheduler and clock, and timeZone "UTC".
// Never the real clock.
//
// Task L2 (Req 34): the dock starts collapsed. Tests that use a jump, Play or
// a marker expand it first with the "Coming up" toggle, as a user would.

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { join } from "node:path"
import type { FrameScheduler } from "@decay-engine/shell"
import { DOCK_HEIGHT_PROPERTY, DOCK_JUMP_DAYS, MoonDock } from "./MoonDock"
import { DOCK_EXPANDED_FLAG } from "../dock-state"
import { loadSampleData } from "../sample-data"
import type { SessionFlagStorage } from "../splash"
import { DOCK_DAYS, dockMarkers, markerSoonLabel, type DockMarker } from "../timeline"
import { FakeStorage } from "../test/fake-storage"
import { DAY_MS, T0, makeEngine } from "../test/fixtures"
import { readText, SRC_DIR } from "../test/source-files"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.documentElement.style.removeProperty(DOCK_HEIGHT_PROPERTY)
})

const formatDate = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(ms)

/** Frames that run only when the test says so. */
function fakeFrames() {
  const queue: (() => void)[] = []
  const frames: FrameScheduler = {
    request: (callback) => {
      queue.push(callback)
      return queue.length
    },
    cancel: () => {},
  }
  return { frames, runNext: () => queue.shift()?.() }
}

type Options = {
  offsetMs?: number
  markers?: readonly DockMarker[]
  reducedMotion?: boolean
  session?: SessionFlagStorage | null
}

function setup({ offsetMs = 0, markers = [], reducedMotion = false, session }: Options = {}) {
  const onChange = vi.fn()
  let time = 0
  const { frames, runNext } = fakeFrames()
  const result = render(
    <MoonDock
      today={T0}
      offsetMs={offsetMs}
      onChange={onChange}
      markers={markers}
      formatDate={formatDate}
      timeZone="UTC"
      frames={frames}
      clock={() => time}
      prefersReducedMotion={() => reducedMotion}
      session={session}
    />
  )
  const dock = result.container.querySelector<HTMLElement>(".gh-dock")!
  return {
    ...result,
    dock,
    onChange,
    runNext,
    setTime: (t: number) => {
      time = t
    },
  }
}

const toggleOf = (dock: HTMLElement) => within(dock).getByRole("button", { name: "Coming up" })

/** Expands the dock with its toggle, as a user would, and checks that it did. */
function expand(dock: HTMLElement) {
  fireEvent.click(toggleOf(dock))
  expect(dock.hasAttribute("data-expanded")).toBe(true)
}

function sampleMarkers(): DockMarker[] {
  const engine = makeEngine()
  loadSampleData(engine, T0)
  return dockMarkers(engine.view(T0), engine.forecast(T0, DOCK_DAYS * DAY_MS), T0)
}

describe("the time machine in the dock (Req 12.1, 26)", () => {
  it("reaches 365 days ahead", () => {
    const { dock } = setup()
    const slider = within(dock).getByRole("slider", { name: "Days ahead" }) as HTMLInputElement
    expect(slider.min).toBe("0")
    expect(slider.max).toBe(String(365 * DAY_MS))
  })

  it("jumps +30, +90, +180 days and +1 year, in that order, each to its offset", () => {
    const { dock, onChange } = setup()
    expand(dock)
    expect(DOCK_JUMP_DAYS).toEqual([30, 90, 180, 365])
    const jumps = within(dock)
      .getAllByRole("button")
      .filter((b) => b.textContent!.startsWith("+"))
    expect(jumps.map((b) => b.textContent)).toEqual(["+30 days", "+90 days", "+180 days", "+1 year"])
    for (const jump of jumps) fireEvent.click(jump)
    expect(onChange.mock.calls).toEqual([[30 * DAY_MS], [90 * DAY_MS], [180 * DAY_MS], [365 * DAY_MS]])
  })

  it("dragging past the end is held at 365 days", () => {
    const { dock, onChange } = setup()
    fireEvent.change(within(dock).getByRole("slider"), { target: { value: String(400 * DAY_MS) } })
    expect(onChange).toHaveBeenLastCalledWith(365 * DAY_MS)
  })

  it("under reduced motion, Play goes straight to +1 year (Req 25.3)", () => {
    const { dock, onChange, runNext } = setup({ reducedMotion: true })
    expand(dock)
    fireEvent.click(within(dock).getByRole("button", { name: "Play the year" }))
    expect(onChange.mock.calls).toEqual([[365 * DAY_MS]])
    runNext() // no frame was asked for
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("with motion, Play ends at +1 year after its 5 seconds", () => {
    const { dock, onChange, runNext, setTime } = setup()
    expand(dock)
    fireEvent.click(within(dock).getByRole("button", { name: "Play the year" }))
    setTime(5_000)
    act(() => {
      runNext()
    })
    expect(onChange).toHaveBeenLastCalledWith(365 * DAY_MS)
  })

  it("shows the previewed date", () => {
    setup({ offsetMs: 90 * DAY_MS })
    // T0 is 14 Nov 2023; 90 days later is 12 Feb 2024.
    expect(screen.getByRole("slider").getAttribute("aria-valuetext")).toBe("12 Feb 2024, 90 days ahead")
  })
})

describe("the preview banner (Req 12.5, 12.6)", () => {
  it("is not shown today", () => {
    const { dock } = setup()
    expect(within(dock).queryByRole("status")).toBeNull()
    expect(within(dock).queryByRole("button", { name: "Back to today" })).toBeNull()
    expect(dock.hasAttribute("data-previewing")).toBe(false)
  })

  it('says "Future preview · nothing is saved" while previewing, and Back to today sets the offset to 0', () => {
    const { dock, onChange } = setup({ offsetMs: 30 * DAY_MS })
    expect(within(dock).getByRole("status").textContent).toContain("Future preview · nothing is saved")
    expect(dock.hasAttribute("data-previewing")).toBe(true)
    fireEvent.click(within(dock).getByRole("button", { name: "Back to today" }))
    expect(onChange.mock.calls).toEqual([[0]])
  })

  it("Back to today comes after the slider, the toggle, the markers, the jumps and Play in the Tab order", () => {
    const { dock } = setup({ offsetMs: 30 * DAY_MS, markers: sampleMarkers() })
    expand(dock)
    const order = [...dock.querySelectorAll<HTMLElement>("input, button")].map(
      (el) => el.getAttribute("aria-label") ?? el.textContent
    )
    expect(order[0]).toBe("Days ahead")
    // The toggle comes right after the slider (Req 34.9).
    expect(order[1]).toBe("Coming up")
    expect(order[order.length - 2]).toBe("Play the year")
    expect(order[order.length - 1]).toBe("Back to today")
    expect(order.indexOf("+30 days")).toBeGreaterThan(order.indexOf("Sunita Rao starts fading on 17 November"))
  })

  it("adds no filled button of its own: Play is the dock's one primary", () => {
    const { dock } = setup({ offsetMs: 30 * DAY_MS, markers: sampleMarkers() })
    expand(dock)
    expect(dock.querySelectorAll(".gh-button-primary")).toHaveLength(0)
    expect([...dock.querySelectorAll(".shell-button-primary")].map((b) => b.textContent)).toEqual(["Play the year"])
  })
})

describe("the moon (Req 12.3)", () => {
  it("is decoration only, and its shade reads --age, set to offset / 365 days", () => {
    const today = setup()
    const moon = today.dock.querySelector("svg.gh-moon")!
    expect(moon.getAttribute("aria-hidden")).toBe("true")
    expect(moon.querySelector(".gh-moon-shade")).not.toBeNull()
    expect(today.dock.style.getPropertyValue("--age")).toBe("0.0000")
    cleanup()

    expect(setup({ offsetMs: 90 * DAY_MS }).dock.style.getPropertyValue("--age")).toBe("0.2466")
    cleanup()
    expect(setup({ offsetMs: 365 * DAY_MS }).dock.style.getPropertyValue("--age")).toBe("1.0000")
  })

  it("the shade moves with --age in the CSS, and only moves smoothly inside the motion block", () => {
    const dockCss = readText(join(SRC_DIR, "styles/dock.css"))
    expect(dockCss).toMatch(/\.gh-moon-shade\s*\{[^}]*transform:\s*translateX\(calc\(60px - var\(--age\) \* 52px\)\)/)
    expect(dockCss).not.toMatch(/\b(?:transition|animation)\s*:/)
    const motion = readText(join(SRC_DIR, "styles/motion.css"))
    const block = motion.slice(motion.indexOf("@media (prefers-reduced-motion: no-preference)"))
    expect(block).toMatch(/\.gh-moon-shade\s*\{\s*transition:\s*transform 0\.3s;/)
  })
})

describe("the markers (Req 12.4, 16.1)", () => {
  it("one named button per marker, with the triangle for fading and the cross for going dark", () => {
    const markers = sampleMarkers()
    const { dock } = setup({ markers })
    expand(dock)
    const track = within(dock).getByRole("group", { name: "Who fades and goes dark in the next year" })
    const buttons = within(track).getAllByRole("button")
    expect(buttons).toHaveLength(markers.length)
    // T0 is 14 November 2023, 22:13:20 UTC; Sunita starts fading 2.4 days later (17 November, 07:49).
    expect(buttons[0]!.getAttribute("aria-label")).toBe("Sunita Rao starts fading on 17 November")
    buttons.forEach((button, i) => {
      const glyph = markers[i]!.type === "fades" ? "triangle" : "cross"
      expect(button.querySelector(`[data-glyph="${glyph}"]`), button.getAttribute("aria-label")!).not.toBeNull()
      expect(button.getAttribute("aria-label")).toMatch(
        markers[i]!.type === "fades" ? / starts fading on \d{1,2} [A-Z][a-z]+$/ : / goes dark on \d{1,2} [A-Z][a-z]+$/
      )
      expect(button.getAttribute("aria-label")!.startsWith(markers[i]!.name)).toBe(true)
    })
  })

  it("sits at day / 365 of the track, and activating one jumps to that day", () => {
    const markers = sampleMarkers()
    const { dock, onChange } = setup({ markers })
    expand(dock)
    const buttons = within(dock).getAllByRole("button").filter((b) => b.classList.contains("gh-dock-mark"))
    const last = markers[markers.length - 1]!
    expect(buttons[buttons.length - 1]!.style.getPropertyValue("--at")).toBe(String(last.day / 365))
    expect(readText(join(SRC_DIR, "styles/dock.css"))).toMatch(
      /\.gh-dock-mark\s*\{[^}]*inset-inline-start:\s*calc\(8px \+ \(100% - 16px\) \* var\(--at, 0\)\);/
    )
    fireEvent.click(buttons[buttons.length - 1]!)
    expect(onChange).toHaveBeenCalledWith(last.day * DAY_MS)
  })

  it("markers already passed at the shown day are marked as passed", () => {
    const markers = sampleMarkers()
    const { dock } = setup({ markers, offsetMs: 30 * DAY_MS })
    expand(dock)
    const passed = [...dock.querySelectorAll<HTMLElement>(".gh-dock-mark")].map((b) => b.hasAttribute("data-passed"))
    expect(passed).toEqual(markers.map((m) => m.day <= 30))
  })
})

describe("the collapsed dock (task L2; Req 34.1-34.5, 34.9, 34.11)", () => {
  it("starts collapsed: the toggle says so, and no marker, tick or marker list is on the page", () => {
    const { dock } = setup({ markers: sampleMarkers() })
    expect(dock.hasAttribute("data-expanded")).toBe(false)
    const toggle = toggleOf(dock)
    expect(toggle.tagName).toBe("BUTTON")
    expect(toggle.getAttribute("type")).toBe("button")
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(dock.querySelectorAll(".gh-dock-mark")).toHaveLength(0)
    expect(dock.querySelector(".gh-dock-track")).toBeNull()
    expect(dock.querySelector(".gh-dock-ticks")).toBeNull()
    expect(within(dock).queryByRole("list", { name: "Who fades and goes dark next" })).toBeNull()
  })

  it("the collapsed bar keeps the title, the date line and the slider", () => {
    const { dock } = setup({ offsetMs: 90 * DAY_MS })
    expect(dock.querySelector(".shell-time-machine-title")).not.toBeNull()
    expect(dock.querySelector(".shell-time-machine-showing")!.textContent).toContain("12 Feb 2024")
    expect(within(dock).getByRole("slider", { name: "Days ahead" })).toBeTruthy()
  })

  it('shows the hint "Drag to look ahead" only while collapsed', () => {
    const { dock } = setup()
    expect(within(dock).getByText("Drag to look ahead")).toBeTruthy()
    expand(dock)
    expect(within(dock).queryByText("Drag to look ahead")).toBeNull()
    fireEvent.click(toggleOf(dock))
    expect(within(dock).getByText("Drag to look ahead")).toBeTruthy()
  })

  it("the toggle expands and collapses the dock, keeps its name, and points at the panel it opens", () => {
    const markers = sampleMarkers()
    const { dock } = setup({ markers })
    const toggle = toggleOf(dock)
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!
    expect(dock.contains(panel)).toBe(true)
    expect(panel.children).toHaveLength(0)

    fireEvent.click(toggle)
    expect(dock.hasAttribute("data-expanded")).toBe(true)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(toggle.textContent).toBe("Coming up")
    expect(panel.querySelectorAll(".gh-dock-mark")).toHaveLength(markers.length)

    fireEvent.click(toggle)
    expect(dock.hasAttribute("data-expanded")).toBe(false)
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(toggle.textContent).toBe("Coming up")
    expect(panel.children).toHaveLength(0)
  })

  it("is a quiet button, never filled", () => {
    const { dock } = setup()
    const toggle = toggleOf(dock)
    expect(toggle.classList.contains("gh-button")).toBe(true)
    expect(toggle.classList.contains("gh-button-primary")).toBe(false)
    expect(toggle.classList.contains("shell-button-primary")).toBe(false)
  })

  it("collapsing and expanding never changes the preview offset; the banner shows in both states", () => {
    const { dock, onChange } = setup({ offsetMs: 30 * DAY_MS })
    expect(within(dock).getByRole("status").textContent).toContain("Future preview · nothing is saved")
    expand(dock)
    expect(within(dock).getByRole("status").textContent).toContain("Future preview · nothing is saved")
    fireEvent.click(toggleOf(dock))
    expect(within(dock).getByRole("status").textContent).toContain("Future preview · nothing is saved")
    expect(within(dock).getByRole("button", { name: "Back to today" })).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
    expect((within(dock).getByRole("slider") as HTMLInputElement).value).toBe(String(30 * DAY_MS))
  })

  it("the slider works while collapsed", () => {
    const { dock, onChange } = setup()
    fireEvent.change(within(dock).getByRole("slider"), { target: { value: String(45 * DAY_MS) } })
    expect(dock.hasAttribute("data-expanded")).toBe(false)
    expect(onChange).toHaveBeenLastCalledWith(45 * DAY_MS)
  })

  it("keeps the choice in the session storage and starts from it", () => {
    const session = new FakeStorage()
    const first = setup({ session })
    expand(first.dock)
    expect(session.snapshot()).toEqual({ [DOCK_EXPANDED_FLAG]: "1" })
    cleanup()

    // A reload in the same tab: expanded again.
    const second = setup({ session })
    expect(second.dock.hasAttribute("data-expanded")).toBe(true)
    fireEvent.click(toggleOf(second.dock))
    expect(session.snapshot()).toEqual({ [DOCK_EXPANDED_FLAG]: "0" })
    cleanup()

    expect(setup({ session }).dock.hasAttribute("data-expanded")).toBe(false)
  })

  it("with no session storage, the toggle still works for the page's life", () => {
    const { dock } = setup({ session: null })
    expand(dock)
    fireEvent.click(toggleOf(dock))
    expect(dock.hasAttribute("data-expanded")).toBe(false)
  })

  it("the CSS hides the shell's jumps and Play while collapsed (source check: jsdom applies no CSS)", () => {
    const dockCss = readText(join(SRC_DIR, "styles/dock.css"))
    expect(dockCss).toMatch(
      /\.gh-dock:not\(\[data-expanded\]\) \.shell-time-machine-controls,\s*\.gh-dock:not\(\[data-expanded\]\) \.gh-dock-panel\s*\{\s*display:\s*none;/
    )
    // The toggle: at least 44 × 44px.
    expect(dockCss).toMatch(/\.gh-dock-toggle\s*\{[^}]*min-inline-size:\s*44px;[^}]*min-block-size:\s*44px;/)
    // The chevron's turn moves only inside the motion block (Req 34.8).
    const motion = readText(join(SRC_DIR, "styles/motion.css"))
    const block = motion.slice(motion.indexOf("@media (prefers-reduced-motion: no-preference)"))
    expect(block).toMatch(/\.gh-dock-chevron\s*\{\s*transition:\s*transform 0\.2s;/)
  })
})

describe("the marker labels (task L2; Req 34.6)", () => {
  it('each marker holds a short label, "… in N days", hidden from screen readers (its name keeps the date)', () => {
    const markers = sampleMarkers()
    const { dock } = setup({ markers })
    expand(dock)
    const buttons = [...dock.querySelectorAll<HTMLElement>(".gh-dock-mark")]
    expect(buttons).toHaveLength(markers.length)
    buttons.forEach((button, i) => {
      const tip = button.querySelector(".gh-dock-mark-tip")!
      expect(tip.textContent).toBe(markerSoonLabel(markers[i]!))
      expect(tip.getAttribute("aria-hidden")).toBe("true")
      expect(button.getAttribute("aria-label")).toMatch(/ on \d{1,2} [A-Z][a-z]+$/)
    })
    expect(buttons[0]!.querySelector(".gh-dock-mark-tip")!.textContent).toBe("Sunita Rao starts fading in 3 days")
  })

  it("the label shows on hover and on keyboard focus, never on hover alone (source check)", () => {
    const dockCss = readText(join(SRC_DIR, "styles/dock.css"))
    expect(dockCss).toMatch(/\.gh-dock-mark-tip\s*\{[^}]*display:\s*none;/)
    expect(dockCss).toMatch(
      /\.gh-dock-mark:hover \.gh-dock-mark-tip,\s*\.gh-dock-mark:focus-visible \.gh-dock-mark-tip\s*\{\s*display:\s*block;/
    )
  })

  it("a list for screen readers names every marker in order, in the short wording", () => {
    const markers = sampleMarkers()
    const { dock } = setup({ markers })
    expand(dock)
    const list = within(dock).getByRole("list", { name: "Who fades and goes dark next" })
    expect(list.tagName).toBe("OL")
    expect(list.classList.contains("gh-sr-only")).toBe(true)
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(markers.map(markerSoonLabel))
    expect(readText(join(SRC_DIR, "styles/layout.css"))).toMatch(/\.gh-sr-only\s*\{[^}]*clip-path:\s*inset\(50%\);/)
  })

  it("with no markers there is no empty list", () => {
    const { dock } = setup()
    expand(dock)
    expect(within(dock).queryByRole("list", { name: "Who fades and goes dark next" })).toBeNull()
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

describe("the page's room for the dock (task L2; Req 34.7, 34.12)", () => {
  const root = () => document.documentElement

  it("with ResizeObserver: --dock-h on the root element follows the dock's height, and is removed with the dock", () => {
    FakeResizeObserver.instances = []
    vi.stubGlobal("ResizeObserver", FakeResizeObserver)
    const { dock, unmount } = setup()
    expect(FakeResizeObserver.instances).toHaveLength(1)
    const observer = FakeResizeObserver.instances[0]!
    expect(observer.observed).toEqual([dock])

    observer.fire(76)
    expect(root().style.getPropertyValue(DOCK_HEIGHT_PROPERTY)).toBe("76px")
    // Expanded or with the banner the dock grows; a fraction rounds up, so the room is never short.
    observer.fire(171.2)
    expect(root().style.getPropertyValue(DOCK_HEIGHT_PROPERTY)).toBe("172px")

    unmount()
    expect(observer.disconnected).toBe(true)
    expect(root().style.getPropertyValue(DOCK_HEIGHT_PROPERTY)).toBe("")
  })

  it("without ResizeObserver: nothing is set, so the CSS fallback applies", () => {
    vi.stubGlobal("ResizeObserver", undefined)
    setup()
    expect(root().style.getPropertyValue(DOCK_HEIGHT_PROPERTY)).toBe("")
  })
})

describe("the dock keeps clear of focus (Req 12.7)", () => {
  it("the dock is fixed at the bottom and never taller than --dock-max, and the page keeps its height as padding", () => {
    const dockCss = readText(join(SRC_DIR, "styles/dock.css"))
    const dockRule = /\.gh-dock\s*\{([^}]*)\}/.exec(dockCss)![1]!
    expect(dockRule).toMatch(/position:\s*fixed;/)
    expect(dockRule).toMatch(/inset-block-end:\s*var\(--badge-room, 0px\);/)
    expect(dockRule).toMatch(/max-block-size:\s*var\(--dock-max\);/)
    expect(dockRule).toMatch(/overflow-y:\s*auto;/)

    // Task L2: the room is the measured height (--dock-h), and --dock-max until it is measured.
    const layout = readText(join(SRC_DIR, "styles/layout.css"))
    expect(layout).toMatch(/html\s*\{\s*scroll-padding-bottom:\s*calc\(var\(--dock-h, var\(--dock-max\)\) \+ var\(--badge-room, 0px\) \+ 12px\);/)
    expect(layout).toMatch(/\.gh-main\s*\{\s*padding-block-end:\s*calc\(var\(--dock-h, var\(--dock-max\)\) \+ var\(--badge-room, 0px\) \+ 24px\);/)
    expect(layout).toMatch(/:root\s*\{\s*--dock-max:\s*180px;/)
  })
})
