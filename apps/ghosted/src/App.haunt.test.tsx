// The haunt pass in the App (Req 1-6). Written by Claude Code (Opus 5.5)
// outside Kiro, from .kiro/specs/haunt-pass. The sample street on a real
// engine with a fixed clock: looking 30 days ahead marks exactly the windows
// that cross, sets --doom and its band, and Wisp says the dark-preview line;
// "Back to today" clears it all. The Spooky level is kept.

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { App } from "./App"
import { doom, doomBand } from "./doom"
import { STARTED_FLAG } from "./first-run"
import { previewCrossings } from "./preview-crossings"
import { loadSampleData } from "./sample-data"
import { SPOOKY_KEY } from "./spooky-level"
import type { Scheduler } from "./ticking"
import { hauntText, wispText } from "./wording"
import { FakeStorage } from "./test/fake-storage"
import { DAY_MS, T0, makeEngine } from "./test/fixtures"

afterEach(cleanup)

const idleScheduler: Scheduler = { setInterval: () => 1, clearInterval: () => {} }
const AHEAD = T0 + 30 * DAY_MS

function renderSample(storage = new FakeStorage({ [STARTED_FLAG]: "1" })) {
  const engine = makeEngine()
  loadSampleData(engine, T0)
  const { container } = render(
    <App
      engine={engine}
      storage={storage}
      session={null}
      clock={() => T0}
      tickScheduler={idleScheduler}
      prefersReducedMotion={() => true}
      timeZone="UTC"
    />
  )
  return { engine, storage, app: container.querySelector<HTMLElement>(".gh-app")! }
}

function jumpAhead() {
  fireEvent.click(screen.getByRole("button", { name: "Coming up" }))
  fireEvent.click(screen.getByRole("button", { name: "+30 days" }))
}

const marked = (app: HTMLElement) =>
  new Map([...app.querySelectorAll<HTMLElement>("button.gh-win[data-crossed]")].map((b) => [b.getAttribute("aria-label")!, b.dataset.crossed]))

describe("haunt pass: the App (Req 1, 2, 5)", () => {
  it("today: no window is marked, and --doom matches the street", () => {
    const { engine, app } = renderSample()
    expect(marked(app).size).toBe(0)
    expect(app.style.getPropertyValue("--doom")).toBe(doom(engine.view(T0)).toFixed(4))
    expect(app.dataset.doom).toBe(doomBand(doom(engine.view(T0))))
  })

  it("30 days ahead: exactly the crossing windows are marked, and Back to today clears them", () => {
    const { engine, app } = renderSample()
    const expected = previewCrossings(engine.view(T0), engine.view(AHEAD))
    expect(expected.size).toBeGreaterThan(0)
    jumpAhead()
    const shown = [...app.querySelectorAll<HTMLElement>("button.gh-win[data-crossed]")]
    expect(shown).toHaveLength(expected.size)
    const kinds = shown.map((b) => b.dataset.crossed).sort()
    expect(kinds).toEqual([...expected.values()].sort())
    expect(app.style.getPropertyValue("--doom")).toBe(doom(engine.view(AHEAD)).toFixed(4))
    // The state is still said in words on every marked window.
    for (const b of shown) expect(b.querySelector(".gh-win-meta")!.textContent).not.toBe("")

    fireEvent.click(screen.getAllByRole("button", { name: "Back to today" })[0]!)
    expect(marked(app).size).toBe(0)
  })

  it("Wisp speaks a plain line, and a dark preview gets a dark-preview line", () => {
    const { engine, app } = renderSample()
    const line = () => app.querySelector(".gh-wisp-line")!
    expect(line().closest("[aria-live]")).toBeNull()
    const dies = [...previewCrossings(engine.view(T0), engine.view(AHEAD)).values()].some((k) => k === "dies")
    jumpAhead()
    const pool: readonly string[] = dies ? wispText.previewDark : [...wispText.previewCalm, ...wispText.previewUneasy]
    expect(pool.some((l) => line().textContent!.endsWith(l))).toBe(true)
  })

  it("the street pulse says its state in a word", () => {
    const { app } = renderSample()
    const word = app.querySelector(".gh-pulse-word")!.textContent
    expect(Object.values(hauntText.pulse)).toContain(word)
  })
})

describe("haunt pass: the Spooky level (Req 6)", () => {
  it("starts haunted, turns calm with one press and keeps the choice", () => {
    const storage = new FakeStorage({ [STARTED_FLAG]: "1" })
    const { app } = renderSample(storage)
    expect(app.dataset.spooky).toBe("haunted")
    const toggle = screen.getByRole("button", { name: hauntText.spooky.label })
    expect(toggle.getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(toggle)
    expect(app.dataset.spooky).toBe("calm")
    expect(toggle.getAttribute("aria-pressed")).toBe("false")
    expect(storage.getItem(SPOOKY_KEY)).toBe("calm")
  })

  it("works while previewing: a preference, not a write", () => {
    const { app } = renderSample()
    jumpAhead()
    fireEvent.click(screen.getByRole("button", { name: hauntText.spooky.label }))
    expect(app.dataset.spooky).toBe("calm")
  })
})
