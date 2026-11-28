// First run (task 5.4; Req 20.1, 20.2, 20.6, 20.9, 15.1). A real engine on
// InMemoryAdapter, an in-memory FlagStorage, a fixed clock and a tick
// scheduler that never fires.
//
// Task 4.10 added "Start empty opens the Add dialog" and the privacy line
// after an add; task 4.14 added the splash cases (two clicks through "Walk
// in", focus after the splash, no splash after a reload in the same tab).
//
// Reset all data (task 4.6, Req 20.7) is at the end: it runs on jsdom's real
// localStorage with the real createEngine, so "after the reload" is a new
// engine loaded from what the reset left behind.

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ANNOUNCER_ID, App } from "./App"
import { createEngine, type GhostedEngine } from "./engine-instance"
import { ENGINE_STORAGE_KEY, OWN_PEOPLE_FLAG, RESET_KEYS, STARTED_FLAG, type FlagStorage } from "./first-run"
import type { Scheduler } from "./ticking"
import { FakeStorage } from "./test/fake-storage"
import { T0, makeEngine } from "./test/fixtures"
import { listPanel, openSettings } from "./test/ui"

afterEach(cleanup)

const idleScheduler: Scheduler = { setInterval: () => 1, clearInterval: () => {} }

function renderApp(
  engine: GhostedEngine = makeEngine(),
  storage: FlagStorage = new FakeStorage(),
  reload: () => void = () => {}
) {
  const result = render(
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
  return { ...result, engine, storage }
}

const heroHeading = () => within(screen.getByRole("main")).getAllByRole("heading", { level: 2 })[0]!
const filledButtons = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>(".gh-button-primary")]

/** No section navigation, Street or list beside the hero (Req 20.9, 11.6). */
function expectHeroOnly() {
  expect(screen.queryByRole("navigation", { name: "Sections" })).toBeNull()
  for (const name of ["The Street", "Fading", "Empty windows", "Still lit"]) {
    expect(screen.queryByRole("region", { name }), name).toBeNull()
  }
}

describe("first run", () => {
  it("with no stored data, lands on the hero: Load sample street is the one primary, Start empty is quiet (Req 20.1)", () => {
    const { container } = renderApp()
    expect(heroHeading().textContent).toBe("Welcome to the street.")
    expect(filledButtons(container).map((b) => b.textContent)).toEqual(["Load sample street"])
    expect(screen.getByRole("button", { name: "Start empty" }).className).not.toContain("gh-button-primary")
    expectHeroOnly()
    expect(screen.getByText("Everything stays in this browser. Names here are made up.")).toBeTruthy()
  })

  it("one click on Load sample street shows the sample street when there is no splash (Req 20.2)", () => {
    const { engine, storage } = renderApp()
    fireEvent.click(screen.getByRole("button", { name: "Load sample street" }))

    expect(engine.view(T0)).toHaveLength(12)
    expect(storage.getItem(STARTED_FLAG)).not.toBeNull()
    expect(heroHeading().textContent).toBe("4 windows are flickering")
    expect(screen.getByRole("button", { name: "Reach out to Dan" })).toBeTruthy()
    const street = screen.getByRole("region", { name: "The Street" })
    expect(street.querySelectorAll("button.gh-win")).toHaveLength(12)
    const fading = listPanel("Fading")
    expect([...fading.querySelectorAll(".gh-card-name")].map((h) => h.textContent)).toEqual([
      "Dan Okafor",
      "Grace Liu",
      "Meera Joshi",
      "Joel Kim",
    ])
    // Sample people are made up, so the privacy line still says so (Req 15.1).
    expect(storage.getItem(OWN_PEOPLE_FLAG)).toBeNull()
    expect(screen.getByText("Everything stays in this browser. Names here are made up.")).toBeTruthy()
  })

  it('Start empty marks the app as started and sets the open dialog to "add" (Req 20.6)', () => {
    const { container, storage } = renderApp()
    const app = container.querySelector<HTMLElement>(".gh-app")!
    expect(app.hasAttribute("data-dialog")).toBe(false)

    fireEvent.click(screen.getByRole("button", { name: "Start empty" }))

    expect(storage.getItem(STARTED_FLAG)).not.toBeNull()
    expect(app.getAttribute("data-dialog")).toBe("add")
  })

  it('after Start empty, the empty-street hero: "No windows yet.", one primary "Add a person", and no lists (Req 8.7, 20.9)', () => {
    const { container, engine } = renderApp()
    fireEvent.click(screen.getByRole("button", { name: "Start empty" }))

    expect(engine.view(T0)).toEqual([])
    expect(heroHeading().textContent).toBe("No windows yet.")
    // The hero's one primary. Start empty also opens the Add dialog (task 4.10), which has its own
    // filled Save, so only buttons outside any dialog count here (Req 8.6 is about the hero).
    expect(filledButtons(container).filter((b) => b.closest("dialog") === null).map((b) => b.textContent)).toEqual([
      "Add a person",
    ])
    expect(screen.queryByRole("button", { name: "Load sample street" })).toBeNull()
    expectHeroOnly()
    expect(screen.getByText("Everything stays in this browser. Names here are made up.")).toBeTruthy()
  })

  it("no loss forecast line on the first run, nor on the empty street after Start empty (task P4, Req 35.8)", () => {
    const { container } = renderApp()
    expect(heroHeading().textContent).toBe("Welcome to the street.")
    expect(container.querySelector(".gh-hero-loss")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Start empty" }))

    expect(heroHeading().textContent).toBe("No windows yet.")
    expect(container.querySelector(".gh-hero-loss")).toBeNull()
  })

  it("the empty-street hero stays after a reload with the same storage: the first run is over", () => {
    const engine = makeEngine()
    const storage = new FakeStorage()
    renderApp(engine, storage)
    fireEvent.click(screen.getByRole("button", { name: "Start empty" }))
    cleanup()

    renderApp(engine, storage)
    expect(heroHeading().textContent).toBe("No windows yet.")
    expect(screen.queryByRole("button", { name: "Start empty" })).toBeNull()
  })

  it("people of the user's own change the privacy line (Req 15.2)", () => {
    // The flag is set by add, import and restore (tasks 4.10 and 5.3); here it is already stored.
    renderApp(makeEngine(), new FakeStorage({ [STARTED_FLAG]: "1", [OWN_PEOPLE_FLAG]: "1" }))
    expect(screen.getByText("Everything stays in this browser.")).toBeTruthy()
    expect(screen.queryByText(/Names here are made up/)).toBeNull()
  })
})

describe("Start empty and the first add (task 4.10; Req 20.6, 17.2, 15.2)", () => {
  const PRIVACY_SAMPLE = "Everything stays in this browser. Names here are made up."
  const PRIVACY_OWN = "Everything stays in this browser."

  it("Start empty opens the Add dialog, with focus on its title", () => {
    renderApp()
    fireEvent.click(screen.getByRole("button", { name: "Start empty" }))
    const dialog = screen.getByRole("dialog", { name: "Add a person" })
    expect(document.activeElement).toBe(within(dialog).getByRole("heading", { level: 2, name: "Add a person" }))
    expect(within(dialog).getByLabelText("Name")).toBeTruthy()
  })

  it("adding a person of the user's own changes the privacy line and puts them on the street", () => {
    const { engine, storage } = renderApp()
    fireEvent.click(screen.getByRole("button", { name: "Start empty" }))
    expect(screen.getByText(PRIVACY_SAMPLE)).toBeTruthy()

    const dialog = screen.getByRole("dialog", { name: "Add a person" })
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Mira Castell" } })
    fireEvent.change(within(dialog).getByLabelText("Usual rhythm in days"), { target: { value: "30" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }))

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(engine.view(T0).map((p) => p.payload.name)).toEqual(["Mira Castell"])
    expect(storage.getItem(OWN_PEOPLE_FLAG)).not.toBeNull()
    expect(screen.getByText(PRIVACY_OWN)).toBeTruthy()
    expect(screen.queryByText(PRIVACY_SAMPLE)).toBeNull()
    expect(heroHeading().textContent).toBe("Every window is lit.")
    // Last contact at today's start (00:00 UTC), seen at 22:13:20: 100 × (1 − 80 000 s / 90 days) = 98.97.
    expect(screen.getByRole("button", { name: "Mira Castell, lit, freshness 98" })).toBeTruthy()
    expect(document.getElementById(ANNOUNCER_ID)!.textContent).toBe("Mira Castell was added to the street.")
  })

  it("Cancel on the Add dialog adds nobody and leaves the privacy line as it was", () => {
    const { engine, storage } = renderApp()
    fireEvent.click(screen.getByRole("button", { name: "Start empty" }))
    fireEvent.click(within(screen.getByRole("dialog", { name: "Add a person" })).getByRole("button", { name: "Cancel" }))
    expect(engine.view(T0)).toEqual([])
    expect(storage.getItem(OWN_PEOPLE_FLAG)).toBeNull()
    expect(screen.getByText(PRIVACY_SAMPLE)).toBeTruthy()
  })
})

describe("the splash on first load (task 4.14; Req 6.1-6.4, 20.2)", () => {
  /** A first load in a tab where motion is fine: the splash shows. */
  function renderWithSplash(session: FakeStorage, engine: GhostedEngine = makeEngine()) {
    render(
      <App
        engine={engine}
        storage={new FakeStorage()}
        session={session}
        clock={() => T0}
        tickScheduler={idleScheduler}
        prefersReducedMotion={() => false}
        timeZone="UTC"
      />
    )
    return engine
  }
  const splash = () => screen.queryByRole("dialog", { name: "Ghosted" })

  it("a loaded sample street in two clicks from first load: Walk in, then Load sample street", () => {
    const engine = renderWithSplash(new FakeStorage())
    expect(splash()).not.toBeNull()
    // The header sign stays the page's one h1 while the splash is open.
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Ghosted"])

    fireEvent.click(within(splash()!).getByRole("button", { name: "Walk in" })) // click 1
    expect(splash()).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Load sample street" })) // click 2

    expect(engine.view(T0)).toHaveLength(12)
    expect(heroHeading().textContent).toBe("4 windows are flickering")
  })

  it("Walk in moves focus to the hero heading", () => {
    renderWithSplash(new FakeStorage())
    fireEvent.click(within(splash()!).getByRole("button", { name: "Walk in" }))
    expect(document.activeElement).toBe(heroHeading())
    expect(heroHeading().textContent).toBe("Welcome to the street.")
  })

  it("Escape closes the splash and moves focus to the hero heading", () => {
    renderWithSplash(new FakeStorage())
    expect(document.activeElement).toBe(within(splash()!).getByText("Some windows are going dark. Let's see whose."))
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(splash()).toBeNull()
    expect(document.activeElement).toBe(heroHeading())
  })

  it("no splash after a reload in the same tab, once it was dismissed", () => {
    const session = new FakeStorage()
    renderWithSplash(session)
    fireEvent.click(within(splash()!).getByRole("button", { name: "Walk in" }))
    cleanup()

    renderWithSplash(session)
    expect(splash()).toBeNull()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("no splash after a reload in the same tab, even when it was never dismissed", () => {
    const session = new FakeStorage()
    renderWithSplash(session)
    expect(splash()).not.toBeNull()
    cleanup()

    renderWithSplash(session)
    expect(splash()).toBeNull()
  })

  it("a new tab (its own session storage) shows the splash again", () => {
    renderWithSplash(new FakeStorage())
    fireEvent.click(within(splash()!).getByRole("button", { name: "Walk in" }))
    cleanup()

    renderWithSplash(new FakeStorage())
    expect(splash()).not.toBeNull()
  })

  it("under reduced motion there is no splash, and the sample street is one click away (Req 6.3, 20.2)", () => {
    const engine = makeEngine()
    render(
      <App
        engine={engine}
        storage={new FakeStorage()}
        session={new FakeStorage()}
        clock={() => T0}
        tickScheduler={idleScheduler}
        prefersReducedMotion={() => true}
        timeZone="UTC"
      />
    )
    expect(splash()).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Load sample street" }))
    expect(engine.view(T0)).toHaveLength(12)
  })
})

describe("Reset all data (task 4.6; Req 20.7)", () => {
  afterEach(() => localStorage.clear())

  const CONFIRM = "Reset all data? This cannot be undone."
  /** Another app's data, which a Ghosted reset must leave alone. */
  const OTHER_APP = { "decay-engine:study-dungeon": '{"kept":true}', "study-dungeon:started": "1" }

  function openReset() {
    // Reset all data is in the Settings sheet (feedback list, point 7); the confirmation opens over it.
    if (document.querySelector("#gh-settings[open]") === null) openSettings()
    const toolbarButton = within(document.getElementById("gh-settings")!).getByRole("button", { name: "Reset all data" })
    expect(toolbarButton.className).toBe("gh-button")
    fireEvent.click(toolbarButton)
    return screen.getByRole("dialog", { name: CONFIRM })
  }

  it("asks first; Cancel and Escape clear nothing and do not reload", () => {
    const storage = new FakeStorage({ [STARTED_FLAG]: "1", ...OTHER_APP })
    const reload = vi.fn()
    const engine = makeEngine()
    renderApp(engine, storage, reload)
    const before = storage.snapshot()

    const dialog = openReset()
    expect(document.activeElement).toBe(within(dialog).getByText(CONFIRM))
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    openReset()
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })

    expect(screen.queryByRole("dialog", { name: CONFIRM })).toBeNull()
    expect(storage.removed).toEqual([])
    expect(storage.snapshot()).toEqual(before)
    expect(reload).not.toHaveBeenCalled()
  })

  it("confirming removes exactly Ghosted's keys, then reloads", () => {
    const storage = new FakeStorage({ [STARTED_FLAG]: "1", [OWN_PEOPLE_FLAG]: "1", ...OTHER_APP })
    const reload = vi.fn()
    renderApp(makeEngine(), storage, reload)

    fireEvent.click(within(openReset()).getByRole("button", { name: "Reset all data" }))

    expect(storage.removed).toEqual([...RESET_KEYS])
    expect(storage.snapshot()).toEqual(OTHER_APP)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("on the real localStorage: the saved street and flags are cleared, other apps' keys stay, and the first run starts again", () => {
    localStorage.clear()
    for (const [key, value] of Object.entries(OTHER_APP)) localStorage.setItem(key, value)
    const reload = vi.fn()
    renderApp(createEngine(), localStorage, reload)

    fireEvent.click(screen.getByRole("button", { name: "Load sample street" }))
    localStorage.setItem(OWN_PEOPLE_FLAG, "1") // as after an add of the user's own
    expect(JSON.parse(localStorage.getItem(ENGINE_STORAGE_KEY)!).items).toHaveLength(12)
    expect(localStorage.getItem(STARTED_FLAG)).not.toBeNull()

    fireEvent.click(within(openReset()).getByRole("button", { name: "Reset all data" }))

    expect(reload).toHaveBeenCalledTimes(1)
    expect(Object.keys(localStorage).sort()).toEqual(Object.keys(OTHER_APP).sort())
    for (const [key, value] of Object.entries(OTHER_APP)) expect(localStorage.getItem(key)).toBe(value)

    // The reload: a new engine loads what the reset left, and the first run shows again.
    cleanup()
    const { container, engine } = renderApp(createEngine(), localStorage)
    expect(engine.view(T0)).toEqual([])
    expect(heroHeading().textContent).toBe("Welcome to the street.")
    expect(filledButtons(container).map((b) => b.textContent)).toEqual(["Load sample street"])
    expect(screen.getByText("Everything stays in this browser. Names here are made up.")).toBeTruthy()
  })
})
