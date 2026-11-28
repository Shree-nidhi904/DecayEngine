// @vitest-environment jsdom
//
// First run (task 11.3, Requirement 13.1-13.4) and "Reset all data"
// (task 11.4, Requirement 13.6), through the App. The first-run flag lives
// in an in-memory storage passed to the App; the engine is a real
// DecayEngine on InMemoryAdapter; times are fixed.

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, screen } from "@testing-library/react"
import { MemoryStorage, makeAppKit, openSettings } from "./test/app-kit"
import { day } from "./test/fixtures"
import { expandDock } from "./test/dock"
import { previewBlockedText } from "./wording"

afterEach(cleanup)

const FLAG = "study-dungeon:started"
const ENGINE_KEY = "decay-engine:study-dungeon"

const button = (name: string) => screen.getByRole("button", { name })
const welcome = () => screen.queryByRole("heading", { name: "Welcome to the Study Dungeon" })
const tab = (list: string) => screen.getByRole("tab", { name: new RegExp(`^${list}`) })
const countOf = (list: string) => tab(list).querySelector(".sd-tab-count")!.textContent

describe("first run", () => {
  it("shows when the flag is missing and there are no facts, instead of the main screen", () => {
    const kit = makeAppKit(new MemoryStorage())
    kit.renderApp(day(60))
    expect(welcome()).not.toBeNull()
    expect(button("Load sample data")).toBeTruthy()
    expect(button("Start empty")).toBeTruthy()
    expect(screen.queryByRole("tablist")).toBeNull()
    expect(screen.queryByText("Your memory today")).toBeNull()
    // Showing it writes nothing.
    expect(kit.storage.entries()).toEqual({})
  })

  it("Start empty sets the flag and shows an empty Crypt that asks for the first fact", () => {
    const kit = makeAppKit(new MemoryStorage())
    kit.renderApp(day(60))
    fireEvent.click(button("Start empty"))

    expect(kit.storage.entries()).toEqual({ [FLAG]: "1" })
    expect(welcome()).toBeNull()
    expect(kit.engine.view(day(60))).toEqual([])
    expect([countOf("Crypt"), countOf("Dungeon"), countOf("Graveyard")]).toEqual(["0", "0", "0"])
    fireEvent.click(tab("Crypt"))
    expect(screen.getByRole("tabpanel").textContent).toContain(
      "Your Crypt has no facts yet. Use Add fact to put in your first one."
    )
    expect(screen.getByText("No facts yet. Use Add fact to put your first one in the Crypt.")).toBeTruthy()
    expect(button("Add fact")).toBeTruthy()
  })

  it("Load sample data sets the flag and fills the lists 4 / 4 / 4", () => {
    // sample-data.ts: 4 alive, 4 weak and 4 dead at the time it is loaded.
    const kit = makeAppKit(new MemoryStorage())
    kit.renderApp(day(60))
    fireEvent.click(button("Load sample data"))

    expect(kit.storage.entries()).toEqual({ [FLAG]: "1" })
    expect(welcome()).toBeNull()
    expect(kit.engine.view(day(60))).toHaveLength(12)
    expect([countOf("Crypt"), countOf("Dungeon"), countOf("Graveyard")]).toEqual(["4", "4", "4"])
    expect(screen.getByText("4 facts are weakening")).toBeTruthy()
  })

  it("after Load sample data the hero shows the loss forecast line; after Start empty there is none (task P4, Req 20.1, 20.8)", () => {
    // The worked example in design "Loss Forecast Line": binary search weakens at +6.74 days and
    // helicase dies at +5.29 days; nothing else changes state in the next 7 days.
    const kit = makeAppKit(new MemoryStorage())
    kit.renderApp(day(60))
    fireEvent.click(button("Load sample data"))
    expect(document.querySelector(".sd-hero-loss")!.textContent).toBe(
      "If you do nothing, in the next 7 days 1 fact weakens and 1 dies."
    )
    cleanup()

    const empty = makeAppKit(new MemoryStorage())
    empty.renderApp(day(60))
    fireEvent.click(button("Start empty"))
    expect(screen.getByText("No facts yet. Use Add fact to put your first one in the Crypt.")).toBeTruthy()
    expect(document.querySelector(".sd-hero-loss")).toBeNull()
  })

  it("is skipped when the flag is missing but facts already exist: the flag is set and nothing is added", () => {
    const kit = makeAppKit(new MemoryStorage())
    kit.add("old", "solid", day(0))
    kit.renderApp(day(1))

    expect(welcome()).toBeNull()
    expect(kit.storage.entries()).toEqual({ [FLAG]: "1" })
    expect(kit.engine.view(day(1)).map((f) => f.id)).toEqual(["old"])
    expect([countOf("Crypt"), countOf("Dungeon"), countOf("Graveyard")]).toEqual(["1", "0", "0"])
  })

  it("has no time dock while it shows; after Start empty the dock is there, collapsed (Req 19.1)", () => {
    const kit = makeAppKit(new MemoryStorage())
    kit.renderApp(day(60))
    expect(document.querySelector(".sd-dock")).toBeNull()
    fireEvent.click(button("Start empty"))
    expect(document.querySelector(".sd-dock")!.hasAttribute("data-open")).toBe(false)
    expect(button("Coming up").getAttribute("aria-expanded")).toBe("false")
    // Nothing about the dock is stored until the toggle is used.
    expect(kit.session).not.toBeNull()
    expect((kit.session as MemoryStorage).entries()).toEqual({})
  })

  it("is skipped when the flag is set, even with no facts", () => {
    const kit = makeAppKit(new MemoryStorage({ [FLAG]: "1" }))
    kit.renderApp(day(1))
    expect(welcome()).toBeNull()
    expect(screen.getByText("No facts yet. Use Add fact to put your first one in the Crypt.")).toBeTruthy()
  })
})

describe("reset all data", () => {
  function setup() {
    const storage = new MemoryStorage({
      [FLAG]: "1",
      [ENGINE_KEY]: "{\"schemaVersion\":1}",
      "decay-engine:ghosted": "other app",
      "unrelated": "keep me",
    })
    const kit = makeAppKit(storage)
    kit.add("f", "solid", day(0))
    kit.renderApp(day(1))
    return kit
  }

  it("asks with the words of Requirement 13.6", () => {
    setup()
    openSettings()
    fireEvent.click(button("Reset all data"))
    expect(screen.getByRole("dialog", { name: "Reset all data? This cannot be undone." })).toBeTruthy()
  })

  it("confirming removes exactly the snapshot and the flag, then reloads", () => {
    const kit = setup()
    openSettings()
    fireEvent.click(button("Reset all data"))
    fireEvent.click(button("Reset"))
    expect(kit.storage.entries()).toEqual({ "decay-engine:ghosted": "other app", unrelated: "keep me" })
    expect(kit.reload).toHaveBeenCalledTimes(1)
  })

  it("cancelling removes nothing and does not reload", () => {
    const kit = setup()
    const before = kit.storage.entries()
    openSettings()
    fireEvent.click(button("Reset all data"))
    fireEvent.click(button("Cancel"))
    expect(screen.queryByRole("dialog", { name: /^Reset all data/ })).toBeNull()
    expect(kit.storage.entries()).toEqual(before)
    expect(kit.reload).not.toHaveBeenCalled()
  })

  it("is disabled while previewing: it says why and opens nothing", () => {
    const kit = setup()
    const before = kit.storage.entries()
    expandDock()
    fireEvent.click(button("+7 days"))
    openSettings()
    const reset = button("Reset all data")
    expect(reset.getAttribute("aria-disabled")).toBe("true")
    expect(reset.getAttribute("title")).toBe(previewBlockedText)
    fireEvent.click(reset)
    expect(screen.queryByRole("dialog", { name: /^Reset all data/ })).toBeNull()
    expect(kit.storage.entries()).toEqual(before)
    expect(kit.reload).not.toHaveBeenCalled()
  })
})
