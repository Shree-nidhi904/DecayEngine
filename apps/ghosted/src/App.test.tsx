// App (task 4.3; Req 11.5): the section navigation moves focus to the chosen
// list's heading, and the lists show the engine's people at `now`. A real
// engine on InMemoryAdapter, a fixed clock and a tick scheduler that never fires.
// Task 5.1 adds the dock's wiring; task 5.3 the privacy line after an add, an
// import and a restore.

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ANNOUNCER_ID, App } from "./App"
import { makeBackup } from "./backup"
import { ENGINE_STORAGE_KEY, OWN_PEOPLE_FLAG, STARTED_FLAG } from "./first-run"
import type { Scheduler } from "./ticking"
import type { PersonPayload } from "./policy"
import { FakeStorage } from "./test/fake-storage"
import { DAY_MS, T0, day, makeEngine } from "./test/fixtures"
import { RecordingAdapter } from "./test/recording-adapter"

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

  it("main shows the hero, then the Street, the nav, Triage and the lists (task L1, Req 33.1)", () => {
    renderApp()
    const main = screen.getByRole("main")
    const hero = main.querySelector(".gh-hero")!
    const street = within(main).getByRole("region", { name: "The Street" })
    const nav = within(main).getByRole("navigation", { name: "Sections" })
    const triage = main.querySelector(".gh-triage")!
    const fading = within(main).getByRole("region", { name: "Fading" })
    const parts = [hero, street, nav, triage, fading]
    for (const part of parts) expect(part).not.toBeNull()
    // The Street is the hero's next sibling: nothing sits between them.
    expect(hero.nextElementSibling).toBe(street)
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i - 1]!.compareDocumentPosition(parts[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `part ${i}`).toBeTruthy()
    }
    // "Street" in the nav still moves focus to the Street's heading, now above it.
    fireEvent.click(within(nav).getAllByRole("button").find((b) => b.textContent === "Street")!)
    expect(document.activeElement).toBe(within(street).getByRole("heading", { level: 2, name: "The Street" }))
  })
  it("keeps the page's one h1", () => {
    renderApp()
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Ghosted"])
  })
})

describe("App: removing a person (task 4.6; Req 13.5, 24.2, 24.3)", () => {
  const names = (engine: ReturnType<typeof renderApp>) => engine.view(T0).map((p) => p.payload.name).sort()
  const ALL = ["Dan Okafor", "Leo Marchetti", "Priya Raman", "Sunita Rao"]
  const QUESTION = "Remove Dan Okafor? This cannot be undone."

  /** Focuses and activates Dan's Remove button in the Fading list. */
  function openRemove() {
    const fading = screen.getByRole("region", { name: "Fading" })
    const remove = within(fading).getByRole("button", { name: "Remove" })
    remove.focus()
    fireEvent.click(remove)
    return remove
  }

  it("asks first, with focus on the question; Cancel removes nothing and gives focus back", () => {
    const engine = renderApp()
    const remove = openRemove()

    const dialog = screen.getByRole("dialog", { name: QUESTION })
    expect(document.activeElement).toBe(within(dialog).getByText(QUESTION))
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(names(engine)).toEqual(ALL)
    expect(document.activeElement).toBe(remove)
  })

  it("Escape removes nothing", () => {
    const engine = renderApp()
    const remove = openRemove()
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(names(engine)).toEqual(ALL)
    expect(document.activeElement).toBe(remove)
  })

  it("confirming removes the person; with the card gone, focus goes to the hero heading", () => {
    const engine = renderApp()
    openRemove()
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }))

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(names(engine)).toEqual(["Leo Marchetti", "Priya Raman", "Sunita Rao"])
    // The page shows it too: Dan's card and window are gone.
    expect(screen.queryByRole("heading", { level: 3, name: "Dan Okafor" })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Dan Okafor,/ })).toBeNull()
    // Nobody is fading now, and the hero heading has focus.
    const hero = within(screen.getByRole("main")).getAllByRole("heading", { level: 2 })[0]!
    expect(hero.textContent).toBe("Nobody is fading.")
    expect(document.activeElement).toBe(hero)
  })
})

describe("App: editing a person (task 4.10; Req 17.4, 17.6)", () => {
  it("a rhythm change shows the new freshness right after saving", () => {
    const engine = renderApp()
    // Priya: last contact 12 days ago with a 30-day rhythm, freshness 86.67.
    expect(screen.getByRole("button", { name: "Priya Raman, lit, freshness 86" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Open Priya Raman" }))
    const card = screen.getByRole("dialog", { name: "Priya Raman" })
    fireEvent.click(within(card).getByRole("button", { name: "Edit" }))
    const form = screen.getByRole("dialog", { name: "Edit Priya Raman" })
    fireEvent.change(within(form).getByLabelText("Usual rhythm in days"), { target: { value: "20" } })
    fireEvent.click(within(form).getByRole("button", { name: "Save" }))

    expect(screen.queryByRole("dialog")).toBeNull()
    // 12 days into a 60-day span: 100 × 48 / 60 = 80.
    const priya = engine.view(T0).find((p) => p.payload.name === "Priya Raman")!
    expect(priya.payload.rhythmDays).toBe(20)
    expect(priya.health).toBeCloseTo(80, 9)
    expect(screen.getByRole("button", { name: "Priya Raman, lit, freshness 80" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Priya Raman, lit, freshness 86" })).toBeNull()
  })

  it("the toolbar's Add a person is quiet and opens the Add dialog", () => {
    renderApp()
    const add = screen.getByRole("button", { name: "Add a person" })
    expect(add.className).toBe("gh-button")
    fireEvent.click(add)
    expect(screen.getByRole("dialog", { name: "Add a person" })).toBeTruthy()
  })
})

describe("App: autopsy, then reconnect (task 4.11; Req 19.1, 19.5, 24.3)", () => {
  it("Autopsy on a dark card opens the autopsy; Reconnect replaces it with the reconnect dialog", () => {
    const engine = renderApp()
    const empty = screen.getByRole("region", { name: "Empty windows" })
    const autopsy = within(empty).getByRole("button", { name: "Autopsy" })
    autopsy.focus()
    fireEvent.click(autopsy)

    const report = screen.getByRole("dialog", { name: "How the window went dark" })
    expect(document.activeElement).toBe(within(report).getByRole("heading", { level: 2 }))
    // Leo was dark when added: his last contact was 90 days before T0.
    expect(report.textContent).toContain("Already dark when added: no contact for 90 days")
    fireEvent.click(within(report).getByRole("button", { name: "Reconnect" }))

    expect(screen.queryByRole("dialog", { name: "How the window went dark" })).toBeNull()
    const reconnect = screen.getByRole("dialog", { name: "Reconnect with Leo Marchetti" })
    fireEvent.click(within(reconnect).getByRole("button", { name: "Met up" }))
    fireEvent.click(within(reconnect).getByRole("button", { name: "Done" }))

    expect(screen.queryByRole("dialog")).toBeNull()
    const leo = engine.view(T0).find((p) => p.payload.name === "Leo Marchetti")!
    expect(leo.state).toBe("alive")
    expect(leo.timesResurrected).toBe(1)
    // Leo's dark card, and the button that opened the chain, are gone: focus goes to the hero heading.
    expect(autopsy.isConnected).toBe(false)
    expect(document.activeElement).toBe(within(screen.getByRole("main")).getAllByRole("heading", { level: 2 })[0])
  })

  it("Escape closes the autopsy and gives focus back to the Autopsy button", () => {
    renderApp()
    const autopsy = within(screen.getByRole("region", { name: "Empty windows" })).getByRole("button", { name: "Autopsy" })
    autopsy.focus()
    fireEvent.click(autopsy)
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(autopsy)
  })
})

describe("App: the moon-clock dock (task 5.1; Req 12.1, 12.2, 12.5, 12.6)", () => {
  const appRoot = () => document.querySelector<HTMLElement>(".gh-app")!
  const toolbarAdd = () => screen.getByRole("button", { name: "Add a person" })

  it("is after <main>, so it comes last in the Tab order", () => {
    renderApp()
    const main = screen.getByRole("main")
    const dock = document.querySelector(".gh-dock")!
    expect(main.contains(dock)).toBe(false)
    expect(main.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("a jump previews that day: --age is D / 365, the banner shows, writes are blocked; Back to today undoes it", () => {
    const engine = renderApp()
    const tick = vi.spyOn(engine, "tick")
    expect(appRoot().style.getPropertyValue("--age")).toBe("0.0000")

    fireEvent.click(screen.getByRole("button", { name: "+90 days" }))

    expect(appRoot().style.getPropertyValue("--age")).toBe("0.2466")
    expect(appRoot().hasAttribute("data-previewing")).toBe(true)
    const dock = document.querySelector<HTMLElement>(".gh-dock")!
    expect(within(dock).getByRole("status").textContent).toContain("Future preview · nothing is saved")
    // The hero shows the previewed day (T0 + 90 days is 12 Feb 2024) and the views read it:
    // Priya (last contact 12 days before T0, rhythm 30) is 102 days out by then, past 81: dark.
    expect(screen.getByText("Future preview · 12 Feb 2024")).toBeTruthy()
    expect(screen.getByRole("button", { name: /^Priya Raman, boarded up/ })).toBeTruthy()
    expect(toolbarAdd().getAttribute("aria-disabled")).toBe("true")
    expect(screen.getByRole("button", { name: "Import people" }).getAttribute("aria-disabled")).toBe("true")
    // No settle tick while previewing.
    expect(tick).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Back to today" }))

    expect(appRoot().style.getPropertyValue("--age")).toBe("0.0000")
    expect(appRoot().hasAttribute("data-previewing")).toBe(false)
    expect(screen.queryByRole("button", { name: "Back to today" })).toBeNull()
    expect(toolbarAdd().hasAttribute("aria-disabled")).toBe(false)
    expect(screen.getByRole("button", { name: "Priya Raman, lit, freshness 86" })).toBeTruthy()
    // Back to today ticks straight away, at the real time.
    expect(tick).toHaveBeenCalledWith(T0)
  })

  it("the markers are worked out at the real time and stay put while previewing", () => {
    renderApp()
    const track = () => screen.getByRole("group", { name: "Who fades and goes dark in the next year" })
    const before = within(track()).getAllByRole("button").map((b) => b.getAttribute("aria-label"))
    // Priya (lit, last contact 12 days ago, rhythm 30) starts fading 24 days after T0: 8 December.
    expect(before).toContain("Priya Raman starts fading on 8 December")
    fireEvent.click(screen.getByRole("button", { name: "+180 days" }))
    expect(within(track()).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(before)
  })

  it("activating a marker previews its day", () => {
    renderApp()
    const marker = screen.getByRole("button", { name: "Priya Raman starts fading on 8 December" })
    fireEvent.click(marker)
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe(String(Number(marker.dataset.day) * DAY_MS))
    expect(appRoot().hasAttribute("data-previewing")).toBe(true)
  })
})

describe("App: the privacy line after the user's own people (task 5.3; Req 15.2)", () => {
  const SAMPLE = "Everything stays in this browser. Names here are made up."
  const OWN = "Everything stays in this browser."

  function renderEmptyStreet(storage = new FakeStorage({ [STARTED_FLAG]: "1" }), reload = vi.fn()) {
    const engine = makeEngine()
    render(
      <App
        engine={engine}
        storage={storage}
        session={null}
        clock={() => T0}
        tickScheduler={idleScheduler}
        prefersReducedMotion={() => true}
        timeZone="UTC"
        reload={reload}
      />
    )
    expect(screen.getByText(SAMPLE)).toBeTruthy()
    return { engine, storage, reload }
  }

  it("after an add", () => {
    const { engine, storage } = renderEmptyStreet()
    fireEvent.click(within(screen.getByRole("main")).getAllByRole("button", { name: "Add a person" })[0]!)
    const dialog = screen.getByRole("dialog", { name: "Add a person" })
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Mira Castell" } })
    fireEvent.change(within(dialog).getByLabelText("Usual rhythm in days"), { target: { value: "30" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }))

    expect(engine.view(T0).map((p) => p.payload.name)).toEqual(["Mira Castell"])
    expect(storage.getItem(OWN_PEOPLE_FLAG)).not.toBeNull()
    expect(screen.getByText(OWN)).toBeTruthy()
    expect(screen.queryByText(SAMPLE)).toBeNull()
  })

  it("after an import", () => {
    const { engine, storage } = renderEmptyStreet()
    fireEvent.click(screen.getByRole("button", { name: "Import people" }))
    const dialog = screen.getByRole("dialog", { name: "Import people" })
    fireEvent.change(within(dialog).getByLabelText("People, one per line"), {
      target: { value: "Mira Castell | Cousin | 30\nAna Ruiz | Work | 14" },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Import" }))

    expect(screen.queryByRole("dialog")).toBeNull()
    const people = engine.view(T0)
    expect(people.map((p) => [p.payload.name, p.importance, p.costMinutes])).toEqual([
      ["Mira Castell", 2, 10],
      ["Ana Ruiz", 2, 10],
    ])
    expect(storage.getItem(OWN_PEOPLE_FLAG)).not.toBeNull()
    expect(screen.getByText(OWN)).toBeTruthy()
    expect(screen.queryByText(SAMPLE)).toBeNull()
    expect(document.getElementById(ANNOUNCER_ID)!.textContent).toBe("2 people were added to the street.")
  })

  it("after a restore", async () => {
    const adapter = new RecordingAdapter()
    const other = makeEngine(adapter)
    other.addItem(
      { payload: { name: "Ana Ruiz", relationship: "", rhythmDays: 14, lastContactAt: day(-3) }, importance: 2, costMinutes: 10 },
      T0
    )
    const backup = makeBackup(new FakeStorage({ [ENGINE_STORAGE_KEY]: adapter.lastSnapshotJson! }), new Date(T0))!
    const { storage, reload } = renderEmptyStreet()

    const input = document.querySelector<HTMLInputElement>('input[data-input="restore"]')!
    fireEvent.change(input, { target: { files: [new File([backup], "ghosted-backup.json", { type: "application/json" })] } })
    const dialog = await screen.findByRole("dialog", {
      name: "Replace your street with 1 person from this file? This cannot be undone.",
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Replace my street" }))

    expect(reload).toHaveBeenCalledTimes(1)
    expect(storage.getItem(OWN_PEOPLE_FLAG)).not.toBeNull()
    expect(screen.getByText(OWN)).toBeTruthy()
    expect(screen.queryByText(SAMPLE)).toBeNull()
  })
})
