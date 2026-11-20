// App (task 4.3; Req 11.5): the section navigation moves focus to the chosen
// list's heading, and the lists show the engine's people at `now`. A real
// engine on InMemoryAdapter, a fixed clock and a tick scheduler that never fires.

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { App } from "./App"
import type { Scheduler } from "./ticking"
import type { PersonPayload } from "./policy"
import { FakeStorage } from "./test/fake-storage"
import { T0, day, makeEngine } from "./test/fixtures"

afterEach(cleanup)

const idleScheduler: Scheduler = { setInterval: () => 1, clearInterval: () => {} }

function renderApp() {
  const engine = makeEngine()
  const add = (name: string, lastContactAt: number) => {
    const payload: PersonPayload = { name, relationship: "", rhythmDays: 30, lastContactAt }
    engine.addItem({ payload, importance: 2, costMinutes: 10 }, T0)
  }
  add("Dan Okafor", day(-70)) // flickering
  add("Leo Marchetti", day(-90)) // boarded up
  add("Priya Raman", day(-12)) // lit
  add("Sunita Rao", day(-30)) // lit
  render(
    <App engine={engine} storage={new FakeStorage()} session={null} clock={() => T0} tickScheduler={idleScheduler} timeZone="UTC" />
  )
  return engine
}

describe("App: section navigation", () => {
  it("each list entry moves focus to that list's heading", () => {
    renderApp()
    const nav = screen.getByRole("navigation", { name: "Sections" })
    const cases = [
      ["Fading1", "Fading"],
      ["Empty windows1", "Empty windows"],
      ["Still lit2", "Still lit"],
    ] as const
    for (const [entry, heading] of cases) {
      const button = within(nav).getAllByRole("button").find((b) => b.textContent === entry)!
      fireEvent.click(button)
      expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: heading }))
    }
  })

  it("the nav comes before the lists, and the lists show the engine's people at now", () => {
    renderApp()
    const main = screen.getByRole("main")
    const nav = within(main).getByRole("navigation", { name: "Sections" })
    const fading = within(main).getByRole("region", { name: "Fading" })
    expect(nav.compareDocumentPosition(fading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(fading).getByRole("heading", { level: 3, name: "Dan Okafor" })).toBeTruthy()
    const empty = within(main).getByRole("region", { name: "Empty windows" })
    expect(within(empty).getByRole("heading", { level: 3, name: "Leo Marchetti" })).toBeTruthy()
    const still = within(main).getByRole("region", { name: "Still lit" })
    expect(within(still).getAllByRole("button", { name: /^Open / }).map((b) => b.textContent)).toEqual([
      "Open Sunita Rao",
      "Open Priya Raman",
    ])
  })

  it("keeps the page's one h1", () => {
    renderApp()
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Ghosted"])
  })
})
