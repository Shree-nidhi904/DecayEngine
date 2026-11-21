// One primary action per region (task 5.9; design section 3.6; Req 30.4,
// 8.6, 13.3; design-tokens.md shell rules).
//
// The app's filled buttons are .gh-button-primary; the shell's are
// .shell-button-primary. Amended Req 30.4: each region has at most one filled
// button of the app's own, and where a shell control is the region's primary
// action (Triage's Plan and Start reaching out, the time machine's Play), the
// app adds no filled button there. Checked in every hero case, for every card
// state, and in each dialog.

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { App } from "./App"
import type { GhostedEngine } from "./engine-instance"
import { STARTED_FLAG } from "./first-run"
import type { PersonPayload } from "./policy"
import { loadSampleData } from "./sample-data"
import type { Scheduler } from "./ticking"
import { FakeStorage } from "./test/fake-storage"
import { T0, day, makeEngine } from "./test/fixtures"

afterEach(cleanup)

const idleScheduler: Scheduler = { setInterval: () => 1, clearInterval: () => {} }
const APP_FILLED = ".gh-button-primary"
const SHELL_FILLED = ".shell-button-primary"

function renderApp(engine: GhostedEngine, flags: Record<string, string> = { [STARTED_FLAG]: "1" }, session: FakeStorage | null = null) {
  render(
    <App
      engine={engine}
      storage={new FakeStorage(flags)}
      session={session}
      clock={() => T0}
      tickScheduler={idleScheduler}
      prefersReducedMotion={() => session === null}
      timeZone="UTC"
    />
  )
}

function add(engine: GhostedEngine, name: string, lastContactDaysAgo: number) {
  const payload: PersonPayload = { name, relationship: "", rhythmDays: 30, lastContactAt: day(-lastContactDaysAgo) }
  engine.addItem({ payload, importance: 2, costMinutes: 10 }, T0)
}

const count = (root: ParentNode, selector: string) => root.querySelectorAll(selector).length
const outsideDialogs = (selector: string) => [...document.querySelectorAll(selector)].filter((el) => el.closest("dialog") === null)

/** The regions of the page and the filled buttons each may hold (design section 3.6). */
function expectRegions() {
  const hero = document.querySelector<HTMLElement>(".gh-hero")!
  expect(count(hero, APP_FILLED), "hero").toBe(1)
  expect(count(hero, SHELL_FILLED), "hero").toBe(0)

  const triage = document.querySelector<HTMLElement>(".gh-triage")
  if (triage !== null) {
    // The shell's Plan (always) and Start reaching out (with picks) are the region's primary actions.
    expect(count(triage, APP_FILLED), "triage").toBe(0)
    const shell = [...triage.querySelectorAll(SHELL_FILLED)].map((b) => b.textContent)
    expect(shell.length, "triage").toBeGreaterThanOrEqual(1)
    for (const label of shell) expect(["Plan", "Start reaching out"]).toContain(label)
  }

  for (const selector of [".gh-section-nav", ".gh-street", ".gh-forecast", ".gh-toolbar", ".gh-privacy"]) {
    for (const region of document.querySelectorAll(selector)) {
      expect(count(region, `${APP_FILLED}, ${SHELL_FILLED}`), selector).toBe(0)
    }
  }

  // Each card: exactly one (Reach out, or Reconnect for a dark window). Still lit rows: none.
  for (const card of outsideDialogs("article.gh-card")) {
    expect(count(card, APP_FILLED), card.querySelector(".gh-card-name")?.textContent ?? "card").toBe(1)
  }
  for (const row of document.querySelectorAll(".gh-row")) expect(count(row, `${APP_FILLED}, ${SHELL_FILLED}`)).toBe(0)

  // The dock: the shell's Play is its primary action; the app adds none.
  const dock = document.querySelector<HTMLElement>(".gh-dock")!
  expect(count(dock, APP_FILLED), "dock").toBe(0)
  expect([...dock.querySelectorAll(SHELL_FILLED)].map((b) => b.textContent)).toEqual(["Play the year"])

  // Nothing filled outside those regions.
  const cards = outsideDialogs("article.gh-card").length
  expect(outsideDialogs(APP_FILLED)).toHaveLength(1 + cards)
}

describe("one primary per region, in every hero case (Req 30.4, 8.6)", () => {
  it("first run", () => {
    renderApp(makeEngine(), {})
    expect(document.querySelector(".gh-hero")!.getAttribute("data-case")).toBe("first-run")
    expectRegions()
  })

  it("an empty street after Start empty", () => {
    renderApp(makeEngine())
    expect(document.querySelector(".gh-hero")!.getAttribute("data-case")).toBe("empty")
    expectRegions()
  })

  it("windows flickering (the sample street)", () => {
    const engine = makeEngine()
    loadSampleData(engine, T0)
    renderApp(engine)
    expect(document.querySelector(".gh-hero")!.getAttribute("data-case")).toBe("fading")
    expectRegions()
  })

  it("nobody fading, a window dark", () => {
    const engine = makeEngine()
    add(engine, "Priya Raman", 12)
    add(engine, "Leo Marchetti", 90)
    renderApp(engine)
    expect(document.querySelector(".gh-hero")!.getAttribute("data-case")).toBe("dark")
    expectRegions()
  })

  it("every window lit", () => {
    const engine = makeEngine()
    add(engine, "Priya Raman", 12)
    renderApp(engine)
    expect(document.querySelector(".gh-hero")!.getAttribute("data-case")).toBe("lit")
    expectRegions()
  })

  it("during a preview the counts stay the same: the blocked buttons are still the region's one primary", () => {
    const engine = makeEngine()
    loadSampleData(engine, T0)
    renderApp(engine)
    fireEvent.click(screen.getByRole("button", { name: "+30 days" }))
    expectRegions()
  })
})

describe("every card state has one primary (Req 13.3)", () => {
  it("lit, lit again, flickering and boarded up", () => {
    const engine = makeEngine()
    loadSampleData(engine, T0)
    renderApp(engine)
    const states = new Set<string>()
    for (const name of ["Priya Raman", "Nia Bello"]) {
      fireEvent.click(screen.getByRole("button", { name: `Open ${name}` }))
      const dialog = screen.getByRole("dialog", { name })
      const card = dialog.querySelector<HTMLElement>("article.gh-card")!
      states.add(card.getAttribute("data-state")!)
      expect([...card.querySelectorAll(APP_FILLED)].map((b) => b.textContent)).toEqual(["Reach out"])
      fireEvent.click(within(dialog).getByRole("button", { name: "Close" }))
    }
    for (const card of outsideDialogs("article.gh-card")) {
      states.add(card.getAttribute("data-state")!)
      const expected = card.getAttribute("data-state") === "dead" ? "Reconnect" : "Reach out"
      expect([...card.querySelectorAll(APP_FILLED)].map((b) => b.textContent)).toEqual([expected])
    }
    expect([...states].sort()).toEqual(["alive", "dead", "litAgain", "weak"])
  })
})

describe("each dialog has at most one filled button (Req 30.4)", () => {
  const filledIn = (dialog: Element) =>
    [...dialog.querySelectorAll(`${APP_FILLED}, ${SHELL_FILLED}`)].map((b) => b.textContent)

  function sample() {
    const engine = makeEngine()
    loadSampleData(engine, T0)
    renderApp(engine)
  }
  const card = (list: string, name: string) =>
    within(screen.getByRole("region", { name: list })).getByRole("article", { name })

  it("Reach out: none before the pick (the choices are outlined), Done after it", () => {
    sample()
    fireEvent.click(within(card("Fading", "Dan Okafor")).getByRole("button", { name: "Reach out" }))
    const dialog = screen.getByRole("dialog", { name: "Reach out to Dan Okafor" })
    expect(filledIn(dialog)).toEqual([])
    fireEvent.click(within(dialog).getByRole("button", { name: /^Had a call/ }))
    expect(filledIn(dialog)).toEqual(["Done"])
  })

  it("Reconnect: none before the pick, Done after it", () => {
    sample()
    fireEvent.click(within(card("Empty windows", "Leo Marchetti")).getByRole("button", { name: "Reconnect" }))
    const dialog = screen.getByRole("dialog", { name: "Reconnect with Leo Marchetti" })
    expect(filledIn(dialog)).toEqual([])
    fireEvent.click(within(dialog).getByRole("button", { name: "Met up" }))
    expect(filledIn(dialog)).toEqual(["Done"])
  })

  it("the autopsy: the shell's Reconnect", () => {
    sample()
    fireEvent.click(within(card("Empty windows", "Leo Marchetti")).getByRole("button", { name: "Autopsy" }))
    expect(filledIn(screen.getByRole("dialog", { name: "How the window went dark" }))).toEqual(["Reconnect"])
  })

  it("add, edit and import: Save or Import; Remove and Reset confirmations: none (outlined in --rust)", () => {
    sample()
    fireEvent.click(screen.getByRole("button", { name: "Add a person" }))
    expect(filledIn(screen.getByRole("dialog", { name: "Add a person" }))).toEqual(["Save"])
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }))

    fireEvent.click(within(card("Fading", "Grace Liu")).getByRole("button", { name: "Edit" }))
    expect(filledIn(screen.getByRole("dialog", { name: "Edit Grace Liu" }))).toEqual(["Save"])
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }))

    fireEvent.click(screen.getByRole("button", { name: "Import people" }))
    expect(filledIn(screen.getByRole("dialog", { name: "Import people" }))).toEqual(["Import"])
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }))

    fireEvent.click(within(card("Fading", "Grace Liu")).getByRole("button", { name: "Remove" }))
    expect(filledIn(screen.getByRole("dialog", { name: "Remove Grace Liu? This cannot be undone." }))).toEqual([])
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }))

    fireEvent.click(screen.getByRole("button", { name: "Reset all data" }))
    expect(filledIn(screen.getByRole("dialog", { name: "Reset all data? This cannot be undone." }))).toEqual([])
  })

  it("the person dialog: the card's one primary, and a quiet Close", () => {
    sample()
    fireEvent.click(screen.getByRole("button", { name: "Open Sunita Rao" }))
    expect(filledIn(screen.getByRole("dialog", { name: "Sunita Rao" }))).toEqual(["Reach out"])
  })

  it("the splash: Walk in", () => {
    renderApp(makeEngine(), {}, new FakeStorage())
    expect(filledIn(screen.getByRole("dialog", { name: "Ghosted" }))).toEqual(["Walk in"])
  })
})
