// @vitest-environment jsdom
//
// Storage problems during writes, through the App (task 18.3). A real
// DecayEngine on an InMemoryAdapter whose saves can be made to throw what a
// browser throws when localStorage is full. The engine guarantees a failed
// save changes nothing, so the App shows the problem in its live region,
// closes the dialog and keeps working. Fixed times; never the real clock.
//
// Expected values (policy spec): solid half-life 10 days; health
// 100 × 0.5^(days / 10); alive ≥ 60, weak 10 to 60, dead < 10.

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { DecayEngineError } from "@decay-engine/engine"
import { MemoryStorage, makeAppKit } from "./test/app-kit"
import { day } from "./test/fixtures"
import { FailingAdapter, announced, announcer, quotaError } from "./test/round7-helpers"
import { storageProblemText } from "./storage-errors"

afterEach(cleanup)

const button = (name: string) => screen.getByRole("button", { name })
const dialogs = () => screen.queryAllByRole("dialog")
const tab = (list: string) => screen.getByRole("tab", { name: new RegExp(`^${list}`) })
const countOf = (list: string) => tab(list).querySelector(".sd-tab-count")!.textContent
const cardButton = (name: string) =>
  within(screen.getByRole("tabpanel")).getAllByRole("button").find((b) => b.textContent === name)!

function addThroughDialog(question: string, answer: string) {
  fireEvent.click(button("Add fact"))
  const dialog = screen.getByRole("dialog", { name: "Add a fact" })
  fireEvent.change(within(dialog).getByLabelText("Question"), { target: { value: question } })
  fireEvent.change(within(dialog).getByLabelText("Answer"), { target: { value: answer } })
  fireEvent.click(within(dialog).getByRole("button", { name: "Add fact" }))
}

describe("a full storage during a write", () => {
  it("addItem: shows Storage full in the form, keeps what was typed, adds nothing, and a retry works", () => {
    // Changed after round 7 (- Opus 5.5): the form used to close on a storage
    // problem and lose the typed text. It now stays open and says why, inside
    // the dialog, because the page behind a modal dialog is inert.
    const adapter = new FailingAdapter()
    const kit = makeAppKit(undefined, { adapter })
    kit.renderApp(day(0))
    const before = adapter.load()
    adapter.failWith = quotaError()

    addThroughDialog("Capital of Peru?", "Lima")

    const dialog = screen.getByRole("dialog", { name: "Add a fact" })
    const alert = within(dialog).getByRole("alert")
    expect(alert.textContent).toBe(storageProblemText.full)
    expect(alert.textContent!.startsWith("Storage full.")).toBe(true)
    expect((within(dialog).getByLabelText("Question") as HTMLInputElement).value).toBe("Capital of Peru?")
    expect((within(dialog).getByLabelText("Answer") as HTMLInputElement).value).toBe("Lima")
    expect(kit.engine.view(day(0))).toEqual([])
    expect(adapter.load()).toEqual(before)
    expect(countOf("Crypt")).toBe("0")

    // Room again: press Add fact in the same form. A new fact starts at health 100, alive.
    adapter.failWith = null
    fireEvent.click(within(dialog).getByRole("button", { name: "Add fact" }))
    expect(dialogs()).toEqual([])
    expect(announced()).toBe("Fact added to the Crypt.")
    expect(announcer().hasAttribute("data-problem")).toBe(false)
    expect(countOf("Crypt")).toBe("1")
    expect(kit.engine.view(day(0)).map((f) => f.payload.question)).toEqual(["Capital of Peru?"])
  })

  it("edit: the form stays open with the problem and the stored fact is unchanged", () => {
    const adapter = new FailingAdapter()
    const kit = makeAppKit(undefined, { adapter })
    kit.renderApp(day(0))
    addThroughDialog("Capital of Peru?", "Lima")
    adapter.failWith = quotaError()

    fireEvent.click(tab("Crypt"))
    fireEvent.click(cardButton("Edit"))
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Answer"), { target: { value: "Lima, on the coast" } })
    fireEvent.click(within(dialog).getByRole("button", { name: /save/i }))

    expect(within(dialog).getByRole("alert").textContent).toBe(storageProblemText.full)
    expect((within(dialog).getByLabelText("Answer") as HTMLInputElement).value).toBe("Lima, on the coast")
    expect(kit.engine.view(day(0))[0]!.payload.answer).toBe("Lima")
  })

  it("tend: closes the fight, records nothing, and a later fight works", () => {
    const adapter = new FailingAdapter()
    const kit = makeAppKit(undefined, { adapter })
    // Day 8: 100 × 0.5^0.8 ≈ 57.4, weak (the Dungeon is the open tab).
    kit.add("w", "solid", day(0))
    kit.renderApp(day(8))
    const history = kit.engine.history("w")
    adapter.failWith = quotaError()

    fireEvent.click(cardButton("Fight"))
    fireEvent.click(button("Show answer"))
    fireEvent.click(button("I knew it"))

    expect(dialogs()).toEqual([])
    expect(announced()).toBe(storageProblemText.full)
    expect(kit.engine.history("w")).toEqual(history)
    expect(countOf("Dungeon")).toBe("1")

    // A right answer gives health 100: back in the Crypt.
    adapter.failWith = null
    fireEvent.click(cardButton("Fight"))
    fireEvent.click(button("Show answer"))
    fireEvent.click(button("I knew it"))
    expect(announced()).toBe("You knew it. The fact is in the Crypt.")
    expect(countOf("Crypt")).toBe("1")
  })

  it("remove: the fact stays and the problem is shown", () => {
    const adapter = new FailingAdapter()
    const kit = makeAppKit(undefined, { adapter })
    kit.add("a", "solid", day(0))
    kit.renderApp(day(1))
    fireEvent.click(tab("Crypt"))
    adapter.failWith = quotaError()

    fireEvent.click(cardButton("Remove"))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }))

    expect(dialogs()).toEqual([])
    expect(announced()).toBe(storageProblemText.full)
    expect(kit.engine.view(day(1)).map((f) => f.id)).toEqual(["a"])
    expect(countOf("Crypt")).toBe("1")
  })

  it("resurrect: the fact stays dead with no new history", () => {
    const adapter = new FailingAdapter()
    const kit = makeAppKit(undefined, { adapter })
    // Day 40: 100 × 0.5^4 = 6.25, below 10: dead.
    kit.add("d", "solid", day(0))
    kit.renderApp(day(40))
    const history = kit.engine.history("d")
    fireEvent.click(tab("Graveyard"))
    adapter.failWith = quotaError()

    fireEvent.click(cardButton("Challenge"))
    fireEvent.click(button("I knew it"))

    expect(dialogs()).toEqual([])
    expect(announced()).toBe(storageProblemText.full)
    expect(kit.engine.history("d")).toEqual(history)
    expect(countOf("Graveyard")).toBe("1")
  })

  it("Load sample data: first run stays, nothing is added and the flag is not set", () => {
    const adapter = new FailingAdapter()
    const kit = makeAppKit(new MemoryStorage(), { adapter })
    kit.renderApp(day(60))
    adapter.failWith = quotaError()

    fireEvent.click(button("Load sample data"))

    expect(announced()).toBe(storageProblemText.full)
    expect(screen.getByRole("heading", { name: "Welcome to the Study Dungeon" })).toBeTruthy()
    expect(kit.engine.view(day(60))).toEqual([])
    expect(kit.storage.entries()).toEqual({})
  })
})

describe("a full storage during a settle tick", () => {
  // Added after round 7 (- Opus 5.5). A tick saves deaths, so it can hit
  // the quota too; before, that reached the crash screen at load and was
  // uncaught every minute after.
  // A solid fact dies 10 × log2(10) ≈ 33.2 days after it was added, so a tick
  // on day 40 has a death to save.
  const liveParagraph = () => announcer().querySelector("p")

  it("at load: no crash; Storage full is said once, and the death still shows", () => {
    const adapter = new FailingAdapter()
    const kit = makeAppKit(undefined, { adapter })
    kit.add("s", "solid", day(0))
    adapter.failWith = quotaError()

    kit.renderApp(day(40))

    expect(screen.queryByRole("heading", { name: "Something went wrong in the dungeon" })).toBeNull()
    expect(announced()).toBe(storageProblemText.full)
    expect(announcer().hasAttribute("data-problem")).toBe(true)
    // Not saved, but reads settle in memory: the fact is shown dead.
    expect(kit.engine.history("s").some((e) => e.type === "died")).toBe(false)
    expect(countOf("Graveyard")).toBe("1")
  })

  it("every minute: says it once while saves keep failing, and again after a save has worked", () => {
    const adapter = new FailingAdapter()
    const kit = makeAppKit(undefined, { adapter })
    kit.add("s", "solid", day(0))
    adapter.failWith = quotaError()
    kit.renderApp(day(40))
    const first = liveParagraph()
    expect(first?.textContent).toBe(storageProblemText.full)

    // Still full a minute later: no new announcement (the same paragraph stays).
    act(() => kit.fireTick())
    expect(liveParagraph()).toBe(first)

    // Room again: the tick saves the death.
    adapter.failWith = null
    act(() => kit.fireTick())
    expect(kit.engine.history("s").filter((e) => e.type === "died")).toHaveLength(1)

    // Full again later, with a new death to save: said again.
    kit.add("t", "solid", day(0))
    adapter.failWith = quotaError()
    act(() => kit.fireTick())
    expect(liveParagraph()).not.toBe(first)
    expect(announced()).toBe(storageProblemText.full)
  })

  it("rethrows a tick error that is not about storage", () => {
    const adapter = new FailingAdapter()
    const kit = makeAppKit(undefined, { adapter })
    kit.add("s", "solid", day(0))
    adapter.failWith = new TypeError("a real bug")
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {})
    const swallow = (event: ErrorEvent) => event.preventDefault()
    window.addEventListener("error", swallow)
    expect(() => kit.renderApp(day(40))).toThrow("a real bug")
    window.removeEventListener("error", swallow)
    quiet.mockRestore()
  })
})

describe("storage that cannot be used during a write", () => {
  it("shows the unavailable sentence", () => {
    const adapter = new FailingAdapter()
    const kit = makeAppKit(undefined, { adapter })
    kit.add("a", "solid", day(0))
    kit.renderApp(day(1))
    fireEvent.click(tab("Crypt"))
    adapter.failWith = new DecayEngineError("STORAGE_UNAVAILABLE", "localStorage is not available")

    fireEvent.click(cardButton("Remove"))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }))

    expect(announced()).toBe(storageProblemText.unavailable)
    expect(kit.engine.view(day(1))).toHaveLength(1)
  })
})
