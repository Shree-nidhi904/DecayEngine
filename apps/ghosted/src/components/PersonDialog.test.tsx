// PersonDialog (task 4.7; Req 10.4, 24.2, 24.3), through the App that wires
// it to the Street windows and the Still lit rows. A real engine on
// InMemoryAdapter, a fixed clock, a tick scheduler that never fires, and the
// dialog polyfill (showModal, close and Escape → "cancel").

import "../test/dialog-polyfill"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { App } from "../App"
import type { PersonPayload } from "../policy"
import type { Scheduler } from "../ticking"
import { FakeStorage } from "../test/fake-storage"
import { T0, day, makeEngine } from "../test/fixtures"

afterEach(cleanup)

const idleScheduler: Scheduler = { setInterval: () => 1, clearInterval: () => {} }

function renderApp() {
  const engine = makeEngine()
  const add = (name: string, relationship: string, lastContactAt: number) => {
    const payload: PersonPayload = { name, relationship, rhythmDays: 30, lastContactAt }
    engine.addItem({ payload, importance: 2, costMinutes: 10 }, T0)
  }
  add("Dan Okafor", "Work", day(-50)) // flickering, freshness 44
  add("Priya Raman", "Family", day(-12)) // lit, freshness 86
  render(
    <App engine={engine} storage={new FakeStorage()} session={null} clock={() => T0} tickScheduler={idleScheduler} timeZone="UTC" />
  )
  return engine
}

/** Focuses and activates an element, as a keyboard user would. */
function activate(element: HTMLElement) {
  element.focus()
  fireEvent.click(element)
}

describe("PersonDialog", () => {
  it("a Street window opens the person's card in a modal dialog, with focus on the card's heading", () => {
    renderApp()
    activate(screen.getByRole("button", { name: "Dan Okafor, flickering, freshness 44" }))

    const dialog = screen.getByRole("dialog", { name: "Dan Okafor" })
    expect(dialog.tagName).toBe("DIALOG")
    expect(dialog.hasAttribute("open")).toBe(true)
    const heading = within(dialog).getByRole("heading", { level: 2, name: "Dan Okafor" })
    expect(heading.getAttribute("tabindex")).toBe("-1")
    expect(document.activeElement).toBe(heading)
    // The whole card is there: the state word, the bar and its buttons, then Close.
    expect(within(dialog).getByRole("img", { name: "Freshness 44 of 100" })).toBeTruthy()
    expect(dialog.querySelector(".gh-card-state")?.textContent).toBe("flickering")
    expect(within(dialog).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Reach out",
      "Edit",
      "Remove",
      "History",
      "Close",
    ])
  })

  it("Escape closes it and focus returns to the window that opened it", () => {
    renderApp()
    const streetWindow = screen.getByRole("button", { name: "Dan Okafor, flickering, freshness 44" })
    activate(streetWindow)
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(streetWindow)
  })

  it("Close closes it and focus returns to the Still lit row's Open button", () => {
    renderApp()
    const still = screen.getByRole("region", { name: "Still lit" })
    const open = within(still).getByRole("button", { name: "Open Priya Raman" })
    activate(open)
    const dialog = screen.getByRole("dialog", { name: "Priya Raman" })
    expect(document.activeElement).toBe(within(dialog).getByRole("heading", { level: 2, name: "Priya Raman" }))

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(open)
  })

  it("Reach out on the card replaces it with the Reach out dialog, which then gives focus back to the window", () => {
    const engine = renderApp()
    const streetWindow = screen.getByRole("button", { name: "Dan Okafor, flickering, freshness 44" })
    activate(streetWindow)
    activate(within(screen.getByRole("dialog")).getByRole("button", { name: "Reach out" }))

    // One dialog at a time: the card's dialog is gone, the Reach out dialog is open.
    const dialogs = screen.getAllByRole("dialog")
    expect(dialogs.map((d) => d.getAttribute("aria-label") ?? d.querySelector("h2")?.textContent)).toEqual([
      "Reach out to Dan Okafor",
    ])
    fireEvent.click(within(dialogs[0]!).getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(engine.history("p1").map((e) => e.type)).not.toContain("tended")
    expect(document.activeElement).toBe(streetWindow)
  })
})
