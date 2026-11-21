// MoonDock (task 5.1; Req 12.1, 12.3, 12.4, 12.5, 12.6, 12.7, 25.3, 26).
// The shell TimeMachine and PreviewBanner rendered through the dock, with a
// fixed `today`, a fake frame scheduler and clock, and timeZone "UTC".
// Never the real clock.

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { join } from "node:path"
import type { FrameScheduler } from "@decay-engine/shell"
import { DOCK_JUMP_DAYS, MoonDock } from "./MoonDock"
import { loadSampleData } from "../sample-data"
import { DOCK_DAYS, dockMarkers, type DockMarker } from "../timeline"
import { DAY_MS, T0, makeEngine } from "../test/fixtures"
import { readText, SRC_DIR } from "../test/source-files"

afterEach(cleanup)

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

type Options = { offsetMs?: number; markers?: readonly DockMarker[]; reducedMotion?: boolean }

function setup({ offsetMs = 0, markers = [], reducedMotion = false }: Options = {}) {
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
    fireEvent.click(within(dock).getByRole("button", { name: "Play the year" }))
    expect(onChange.mock.calls).toEqual([[365 * DAY_MS]])
    runNext() // no frame was asked for
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("with motion, Play ends at +1 year after its 5 seconds", () => {
    const { dock, onChange, runNext, setTime } = setup()
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

  it("Back to today comes after the slider, the markers, the jumps and Play in the Tab order", () => {
    const { dock } = setup({ offsetMs: 30 * DAY_MS, markers: sampleMarkers() })
    const order = [...dock.querySelectorAll<HTMLElement>("input, button")].map(
      (el) => el.getAttribute("aria-label") ?? el.textContent
    )
    expect(order[0]).toBe("Days ahead")
    expect(order[order.length - 2]).toBe("Play the year")
    expect(order[order.length - 1]).toBe("Back to today")
    expect(order.indexOf("+30 days")).toBeGreaterThan(order.indexOf("Sunita Rao starts fading on 17 November"))
  })

  it("adds no filled button of its own: Play is the dock's one primary", () => {
    const { dock } = setup({ offsetMs: 30 * DAY_MS, markers: sampleMarkers() })
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
    const passed = [...dock.querySelectorAll<HTMLElement>(".gh-dock-mark")].map((b) => b.hasAttribute("data-passed"))
    expect(passed).toEqual(markers.map((m) => m.day <= 30))
  })
})

describe("the dock keeps clear of focus (Req 12.7)", () => {
  it("the dock is fixed at the bottom and never taller than --dock-max, and the page keeps that much padding", () => {
    const dockCss = readText(join(SRC_DIR, "styles/dock.css"))
    const dockRule = /\.gh-dock\s*\{([^}]*)\}/.exec(dockCss)![1]!
    expect(dockRule).toMatch(/position:\s*fixed;/)
    expect(dockRule).toMatch(/inset-block-end:\s*0;/)
    expect(dockRule).toMatch(/max-block-size:\s*var\(--dock-max\);/)
    expect(dockRule).toMatch(/overflow-y:\s*auto;/)

    const layout = readText(join(SRC_DIR, "styles/layout.css"))
    expect(layout).toMatch(/html\s*\{\s*scroll-padding-bottom:\s*calc\(var\(--dock-max\) \+ 12px\);/)
    expect(layout).toMatch(/\.gh-main\s*\{\s*padding-block-end:\s*calc\(var\(--dock-max\) \+ 24px\);/)
    expect(layout).toMatch(/:root\s*\{\s*--dock-max:\s*180px;/)
  })
})
