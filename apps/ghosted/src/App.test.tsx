// App (task 4.3; Req 11.5): the section navigation moves focus to the chosen
// list's heading, and the lists show the engine's people at `now`. A real
// engine on InMemoryAdapter, a fixed clock and a tick scheduler that never fires.
// Task 5.1 adds the dock's wiring; task 5.3 the privacy line after an add, an
// import and a restore.

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ANNOUNCER_ID, App } from "./App"
import { makeBackup } from "./backup"
import { loadSampleData } from "./sample-data"
import { ENGINE_STORAGE_KEY, OWN_PEOPLE_FLAG, STARTED_FLAG } from "./first-run"
import type { Scheduler } from "./ticking"
import type { PersonPayload } from "./policy"
import { FakeStorage } from "./test/fake-storage"
import { DAY_MS, MINUTE_MS, T0, day, makeEngine } from "./test/fixtures"
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
  const dockToggle = () => screen.getByRole("button", { name: "Coming up" })
  /** The dock starts collapsed (task L2, Req 34.1); the jumps and markers show once it is expanded. */
  const expandDock = () => {
    fireEvent.click(dockToggle())
    expect(dockToggle().getAttribute("aria-expanded")).toBe("true")
  }

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

    expandDock()
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
    expandDock()
    const track = () => screen.getByRole("group", { name: "Who fades and goes dark in the next year" })
    const before = within(track()).getAllByRole("button").map((b) => b.getAttribute("aria-label"))
    // Priya (lit, last contact 12 days ago, rhythm 30) starts fading 24 days after T0: 8 December.
    expect(before).toContain("Priya Raman starts fading on 8 December")
    fireEvent.click(screen.getByRole("button", { name: "+180 days" }))
    expect(within(track()).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(before)
  })

  it("activating a marker previews its day", () => {
    renderApp()
    expandDock()
    const marker = screen.getByRole("button", { name: "Priya Raman starts fading on 8 December" })
    fireEvent.click(marker)
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe(String(Number(marker.dataset.day) * DAY_MS))
    expect(appRoot().hasAttribute("data-previewing")).toBe(true)
  })

  it("starts collapsed: no markers on the page until the toggle expands the dock (task L2, Req 34.1, 34.2)", () => {
    renderApp()
    const dock = document.querySelector<HTMLElement>(".gh-dock")!
    expect(dock.hasAttribute("data-expanded")).toBe(false)
    expect(dockToggle().getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByRole("group", { name: "Who fades and goes dark in the next year" })).toBeNull()
    expandDock()
    expect(screen.getByRole("group", { name: "Who fades and goes dark in the next year" })).toBeTruthy()
  })

  it("collapsing during a preview keeps --age, the banner and the blocked writes; the slider still previews (task L2, Req 34.4)", () => {
    const engine = renderApp()
    const tick = vi.spyOn(engine, "tick")
    expandDock()
    fireEvent.click(screen.getByRole("button", { name: "+90 days" }))
    fireEvent.click(dockToggle())
    expect(dockToggle().getAttribute("aria-expanded")).toBe("false")

    expect(appRoot().style.getPropertyValue("--age")).toBe("0.2466")
    expect(appRoot().hasAttribute("data-previewing")).toBe(true)
    const dock = document.querySelector<HTMLElement>(".gh-dock")!
    expect(within(dock).getByRole("status").textContent).toContain("Future preview · nothing is saved")
    expect(within(dock).getByRole("button", { name: "Back to today" })).toBeTruthy()
    expect(toolbarAdd().getAttribute("aria-disabled")).toBe("true")
    expect(tick).not.toHaveBeenCalled()

    // The slider moves the preview while collapsed: 180 days is --age 180 / 365.
    fireEvent.change(screen.getByRole("slider"), { target: { value: String(180 * DAY_MS) } })
    expect(appRoot().style.getPropertyValue("--age")).toBe("0.4932")
    expect(toolbarAdd().getAttribute("aria-disabled")).toBe("true")
    expect(tick).not.toHaveBeenCalled()
  })
})

describe("App: the hero's loss forecast line (task P4; Req 35.1, 35.9, design section 12.6)", () => {
  const ONE_FLICKERS = "If you do nothing, in the next 7 days 1 window starts to flicker."
  const NOTHING = "No window will start to flicker or go dark in the next 7 days."
  const line = () => document.querySelector<HTMLElement>(".gh-hero-loss")
  const heroTitle = () => document.querySelector<HTMLElement>(".gh-hero-title")!

  it("after Load sample street at T0 the line shows under the heading; a call to Sunita changes it (the version dependency)", () => {
    const engine = makeEngine()
    render(
      <App
        engine={engine}
        storage={new FakeStorage()}
        session={null}
        clock={() => T0}
        tickScheduler={idleScheduler}
        prefersReducedMotion={() => true}
        timeZone="UTC"
      />
    )
    // The first run has no line (Req 35.8).
    expect(line()).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Load sample street" }))

    // Sunita (rhythm 7, last contact 6 days ago) starts to flicker at +2.4 days; nobody goes dark (section 12.5).
    expect(line()!.textContent).toBe(ONE_FLICKERS)
    expect(heroTitle().textContent).toBe("4 windows are flickering")
    expect(heroTitle().nextElementSibling).toBe(line())

    // A call at T0 sets her last contact to T0: she starts to flicker at +8.4 days, outside the 7 days.
    fireEvent.click(screen.getByRole("button", { name: "Open Sunita Rao" }))
    fireEvent.click(within(screen.getByRole("dialog", { name: "Sunita Rao" })).getByRole("button", { name: "Reach out" }))
    // The person dialog hands over to the Reach out dialog, so it is the only one open.
    const reachOut = screen.getByRole("dialog")
    fireEvent.click(reachOut.querySelector<HTMLElement>('.gh-choice[data-kind="call"]')!)
    fireEvent.click(within(reachOut).getByRole("button", { name: "Done" }))

    const sunita = engine.view(T0).find((p) => p.payload.name === "Sunita Rao")!
    expect(sunita.policyData.lastContactAt).toBe(T0)
    expect(sunita.health).toBe(100)
    expect(line()!.textContent).toBe(NOTHING)
  })

  it("a settle tick moves the line (the realNow dependency)", () => {
    const engine = makeEngine()
    // Rhythm 10 (T = 30 days), last contact T0: starts to flicker at exactly T0 + 12 days.
    engine.addItem({ payload: { name: "Mira Castell", relationship: "", rhythmDays: 10, lastContactAt: T0 }, importance: 2, costMinutes: 10 }, T0)
    let at = day(5) - MINUTE_MS
    const clock = () => at
    let runTick: (() => void) | undefined
    const scheduler: Scheduler = {
      setInterval: (callback) => {
        runTick = callback
        return 1
      },
      clearInterval: () => {},
    }
    render(
      <App
        engine={engine}
        storage={new FakeStorage({ [STARTED_FLAG]: "1" })}
        session={null}
        clock={clock}
        tickScheduler={scheduler}
        prefersReducedMotion={() => true}
        timeZone="UTC"
      />
    )
    // T0 + 12 days is 7 days and 1 minute away.
    expect(line()!.textContent).toBe(NOTHING)

    at = day(5) + MINUTE_MS
    act(() => runTick!())
    // Now it is 7 days less 1 minute away.
    expect(line()!.textContent).toBe(ONE_FLICKERS)
  })

  it("is hidden when every window is dark (Req 35.8)", () => {
    const engine = makeEngine()
    engine.addItem({ payload: { name: "Mira Castell", relationship: "", rhythmDays: 1, lastContactAt: day(-10) }, importance: 2, costMinutes: 10 }, T0)
    render(
      <App
        engine={engine}
        storage={new FakeStorage({ [STARTED_FLAG]: "1" })}
        session={null}
        clock={() => T0}
        tickScheduler={idleScheduler}
        prefersReducedMotion={() => true}
        timeZone="UTC"
      />
    )
    expect(heroTitle().textContent).toBe("Nobody is fading.")
    expect(line()).toBeNull()
  })

  it("on the mixed street of renderApp: Sunita (last contact 30 days ago, rhythm 30) starts to flicker on day 6", () => {
    renderApp()
    // Priya fades at +24 days, Dan is already flickering and goes dark at +11 days, Leo is dark.
    expect(line()!.textContent).toBe(ONE_FLICKERS)
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

describe("App: what this session saves, under the Triage picks (task P5; Req 36.1, 36.6, 36.7, design section 13.8)", () => {
  const ONE = "A call or meet-up with these people keeps 1 window from going dark in the next 7 days."
  const triage = () => document.querySelector<HTMLElement>(".gh-triage")!
  const line = () => triage().querySelector<HTMLElement>(".shell-triage-note")
  function choose(minutes: number) {
    fireEvent.click(within(triage()).getByRole("radio", { name: `${minutes} min` }))
    fireEvent.click(within(triage()).getByRole("button", { name: "Plan" }))
  }

  /**
   * Ada Fenn: rhythm 10 (T 30 days), last contact 22 days ago: freshness 26.67, dark at T0 + 5 days;
   * a call keeps her lit. 20 minutes. Cy Moss: rhythm 30, last contact 50 days ago: freshness 44.44,
   * dark at T0 + 31 days. 10 minutes.
   */
  function renderAdaAndCy() {
    const engine = makeEngine()
    const add = (name: string, rhythmDays: number, lastContactAt: number, costMinutes: number) => {
      const payload: PersonPayload = { name, relationship: "", rhythmDays, lastContactAt }
      engine.addItem({ payload, importance: 2, costMinutes }, T0)
    }
    add("Ada Fenn", 10, day(-22), 20)
    add("Cy Moss", 30, day(-50), 10)
    render(
      <App
        engine={engine}
        storage={new FakeStorage({ [STARTED_FLAG]: "1" })}
        session={null}
        clock={() => T0}
        tickScheduler={idleScheduler}
        prefersReducedMotion={() => true}
        timeZone="UTC"
      />
    )
    return engine
  }

  it("follows the budget field: the line at 30 minutes, none at 15, back at 30", () => {
    renderAdaAndCy()
    // 30 minutes is run straight away: Ada (20) and Cy (10) both fit, and only Ada is at risk.
    expect(line()!.textContent).toBe(ONE)
    choose(15)
    // Only Cy (10 minutes) fits, and he goes dark in 31 days.
    expect(line()).toBeNull()
    choose(30)
    expect(line()!.textContent).toBe(ONE)
  })

  it("follows the picks after a write: a call to Ada lights her, so the picks are Cy only and the line goes (the version dependency)", () => {
    const engine = renderAdaAndCy()
    expect(line()!.textContent).toBe(ONE)

    const fading = screen.getByRole("region", { name: "Fading" })
    fireEvent.click(within(within(fading).getByRole("article", { name: "Ada Fenn" })).getByRole("button", { name: "Reach out" }))
    const reachOut = screen.getByRole("dialog", { name: "Reach out to Ada Fenn" })
    fireEvent.click(reachOut.querySelector<HTMLElement>('.gh-choice[data-kind="call"]')!)
    fireEvent.click(within(reachOut).getByRole("button", { name: "Done" }))

    const ada = engine.view(T0).find((p) => p.payload.name === "Ada Fenn")!
    expect(ada.health).toBe(100)
    expect(ada.state).toBe("alive")
    expect(engine.triage(30, T0).picks.map((p) => p.item.payload.name)).toEqual(["Cy Moss"])
    expect(line()).toBeNull()
  })

  it("on the mixed street of renderApp there is no line: Dan, the only pick, goes dark in 11 days", () => {
    renderApp()
    expect(triage().querySelectorAll(".shell-triage-picks > li")).toHaveLength(1)
    expect(line()).toBeNull()
  })
})
