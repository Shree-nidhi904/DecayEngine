// @vitest-environment jsdom
//
// Accessibility through the App (tasks 16.1 and 16.4): Escape closes every
// dialog and gives focus back to the button that opened it; the polite live
// region says what changed; landmarks; every button has a name; Tab reaches
// everything and Enter or Space works it.
//
// A real DecayEngine on InMemoryAdapter, fixed times, the in-memory storage
// from app-kit. Escape is a real keydown: the dialog polyfill turns it into
// the browser's "cancel" event, as a browser does for a modal dialog.
//
// The facts, at day 10 (policy spec: health 100 × 0.5^(days / half-life);
// solid 10 days, new 2; alive ≥ 60, weak 10 to 60, dead < 10):
//   alive  solid, added day 10  → 100, the Crypt
//   weak   solid, added day 2   → 100 × 0.5^0.8 ≈ 57.4, the Dungeon (open first)
//   dead   new, added day 0     → 100 × 0.5^5 ≈ 3.1, the Graveyard
// After a right answer health is 100 (alive); after a wrong one, 45 (weak);
// a resurrected fact comes back at 100 (alive).

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { makeAppKit } from "./test/app-kit"
import { day } from "./test/fixtures"
import { announced, announcer } from "./test/round7-helpers"
import { dockToggle, expandDock } from "./test/dock"
import { landmarkText } from "./wording"

afterEach(cleanup)

const button = (name: string) => screen.getByRole("button", { name })
const tab = (list: string) => screen.getByRole("tab", { name: new RegExp(`^${list}`) })
const cardButton = (name: string) =>
  within(screen.getByRole("tabpanel")).getAllByRole("button").find((b) => b.textContent === name)!

function setup() {
  const kit = makeAppKit()
  kit.add("alive", "solid", day(10))
  kit.add("weak", "solid", day(2))
  kit.add("dead", "new", day(0))
  kit.renderApp(day(10))
  return kit
}

/** Focuses the opener and clicks it, as a keyboard or mouse user would. */
function open(opener: HTMLElement): HTMLElement {
  opener.focus()
  fireEvent.click(opener)
  return opener
}

/** Presses Escape inside the open dialog. */
function escape() {
  const dialog = screen.getByRole("dialog")
  fireEvent.keyDown(dialog, { key: "Escape" })
}

describe("the hero's loss forecast line (task P4, Req 20.10)", () => {
  it("is a plain paragraph: not inside any live region and not in the Tab order", () => {
    // At day 10: the alive fact weakens 7.37 days later, the weak one dies at day 35.22, so nothing changes.
    setup()
    const line = document.querySelector<HTMLElement>(".sd-hero-loss")!
    expect(line.textContent).toBe("Nothing will weaken or die in the next 7 days.")
    expect(line.tagName).toBe("P")
    expect(line.closest("[aria-live]")).toBeNull()
    expect(line.closest("[role='status'], [role='alert']")).toBeNull()
    expect(line.hasAttribute("role")).toBe(false)
    expect(line.hasAttribute("tabindex")).toBe(false)
    expect(line.querySelector("a, button, input, select, textarea, summary, [tabindex]")).toBeNull()
  })
})

describe("Escape closes each dialog and returns focus to its opener", () => {
  const cases: [string, () => HTMLElement, string][] = [
    ["Add fact", () => button("Add fact"), "Add a fact"],
    ["Edit on a card", () => cardButton("Edit"), "Edit fact"],
    ["Fight on a card", () => cardButton("Fight"), "Fight"],
    ["Fight the weakest (hero)", () => button("Fight the weakest"), "Fight"],
    ["Remove on a card", () => cardButton("Remove"), "Remove this fact? This cannot be undone."],
    ["Reset all data", () => button("Reset all data"), "Reset all data? This cannot be undone."],
  ]

  it.each(cases)("%s", (_label, findOpener, dialogName) => {
    setup()
    const opener = open(findOpener())
    expect(screen.getByRole("dialog", { name: dialogName })).toBeTruthy()

    escape()

    expect(screen.queryAllByRole("dialog")).toEqual([])
    expect(document.activeElement).toBe(opener)
  })

  it("Challenge on a grave", () => {
    setup()
    fireEvent.click(tab("Graveyard"))
    const opener = open(cardButton("Challenge"))
    expect(screen.getByRole("dialog", { name: "Challenge" })).toBeTruthy()
    escape()
    expect(screen.queryAllByRole("dialog")).toEqual([])
    expect(document.activeElement).toBe(opener)
  })

  it("Autopsy on a grave", () => {
    setup()
    fireEvent.click(tab("Graveyard"))
    const opener = open(cardButton("Autopsy"))
    expect(screen.getByRole("dialog", { name: "Autopsy" })).toBeTruthy()
    escape()
    expect(screen.queryAllByRole("dialog")).toEqual([])
    expect(document.activeElement).toBe(opener)
  })

  it("a Challenge opened from the autopsy returns focus to the Autopsy button on the card", () => {
    setup()
    fireEvent.click(tab("Graveyard"))
    const opener = open(cardButton("Autopsy"))
    const challenge = within(screen.getByRole("dialog", { name: "Autopsy" })).getByRole("button", {
      name: "Challenge",
    })
    open(challenge)
    expect(screen.getByRole("dialog", { name: "Challenge" })).toBeTruthy()

    escape()

    expect(screen.queryAllByRole("dialog")).toEqual([])
    expect(document.activeElement).toBe(opener)
  })

  it("Escape changes nothing in the engine", () => {
    const kit = setup()
    const before = ["alive", "weak", "dead"].map((id) => kit.engine.history(id))
    open(cardButton("Fight"))
    fireEvent.click(button("Show answer"))
    escape()
    expect(["alive", "weak", "dead"].map((id) => kit.engine.history(id))).toEqual(before)
  })
})

describe("the polite live region", () => {
  it("is on the page from the start, polite and empty", () => {
    setup()
    expect(announcer().getAttribute("aria-live")).toBe("polite")
    expect(announced()).toBe("")
  })

  it("after adding a fact: Fact added to the Crypt.", () => {
    setup()
    fireEvent.click(button("Add fact"))
    const dialog = screen.getByRole("dialog", { name: "Add a fact" })
    fireEvent.change(within(dialog).getByLabelText("Question"), { target: { value: "Capital of Peru?" } })
    fireEvent.change(within(dialog).getByLabelText("Answer"), { target: { value: "Lima" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Add fact" }))
    expect(announced()).toBe("Fact added to the Crypt.")
  })

  it("after a right answer in a fight: the fact is in the Crypt", () => {
    setup()
    open(cardButton("Fight")) // the weak fact
    fireEvent.click(button("Show answer"))
    fireEvent.click(button("I knew it"))
    expect(announced()).toBe("You knew it. The fact is in the Crypt.")
  })

  it("after a wrong answer in a fight: the fact is in the Dungeon", () => {
    setup()
    fireEvent.click(tab("Crypt"))
    open(cardButton("Fight")) // the alive fact
    fireEvent.click(button("Show answer"))
    fireEvent.click(button("I forgot"))
    expect(announced()).toBe("You forgot it. The fact is in the Dungeon.")
  })

  it("after a won challenge: back in the Crypt; after a lost one: stays in the Graveyard", () => {
    setup()
    fireEvent.click(tab("Graveyard"))
    open(cardButton("Challenge"))
    fireEvent.click(button("I forgot"))
    expect(announced()).toBe("You got it wrong. The fact stays in the Graveyard.")
    fireEvent.click(button("Close"))

    open(cardButton("Challenge"))
    fireEvent.click(button("I knew it"))
    expect(announced()).toBe("Resurrected. The fact is back in the Crypt.")
  })

  it("after removing a fact: Fact removed.", () => {
    setup()
    open(cardButton("Remove"))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }))
    expect(announced()).toBe("Fact removed.")
  })
})

describe("landmarks and names", () => {
  it("has a header, a main, and a nav around the list tabs", () => {
    setup()
    expect(within(screen.getByRole("banner")).getByRole("heading", { name: "Study Dungeon" })).toBeTruthy()
    expect(screen.getByRole("main")).toBeTruthy()
    const nav = screen.getByRole("navigation", { name: landmarkText.lists })
    expect(within(nav).getByRole("tablist")).toBeTruthy()
  })

  it("every button has a name in words (icons are hidden from screen readers)", () => {
    setup()
    const unnamed: string[] = []
    for (const list of ["Crypt", "Dungeon", "Graveyard"]) {
      fireEvent.click(tab(list))
      for (const b of screen.getAllByRole("button")) {
        const copy = b.cloneNode(true) as HTMLElement
        copy.querySelectorAll('[aria-hidden="true"]').forEach((el) => el.remove())
        const name = (b.getAttribute("aria-label") ?? copy.textContent ?? "").trim()
        if (name === "") unnamed.push(b.outerHTML)
      }
    }
    expect(unnamed).toEqual([])
  })
})

describe("keyboard", () => {
  it("Tab reaches every control on the main screen", async () => {
    setup()
    // The jumps and Play are in the expanded dock (task 21.4).
    expandDock()
    const user = userEvent.setup({ delay: null })
    const reached = new Set<Element>()
    for (let i = 0; i < 200; i++) {
      await user.tab()
      if (document.activeElement === document.body || reached.has(document.activeElement!)) break
      reached.add(document.activeElement!)
    }
    const names = [...reached].map((el) => el.getAttribute("aria-label") ?? el.textContent ?? "")
    for (const expected of ["Add fact", "Fight the weakest", "+7 days", "Play", "Triage", "Reset all data"]) {
      expect(names).toContain(expected)
    }
    // The dock's toggle is reached too, named in words (its glyph is hidden from screen readers).
    expect(reached.has(dockToggle())).toBe(true)
    const toggleCopy = dockToggle().cloneNode(true) as HTMLElement
    toggleCopy.querySelectorAll('[aria-hidden="true"]').forEach((el) => el.remove())
    expect(toggleCopy.textContent).toBe("Coming up")
    expect(reached.has(screen.getByRole("slider", { name: "Days ahead" }))).toBe(true)
    expect(reached.has(screen.getByRole("switch", { name: "Sound effects" }))).toBe(true)
    // The selected tab is the one in the Tab order (arrow keys move between tabs).
    expect(reached.has(tab("Dungeon"))).toBe(true)
  })

  it("Enter opens Add fact and Space opens Fight the weakest", async () => {
    setup()
    const user = userEvent.setup({ delay: null })
    button("Add fact").focus()
    await user.keyboard("{Enter}")
    expect(screen.getByRole("dialog", { name: "Add a fact" })).toBeTruthy()
    escape()

    button("Fight the weakest").focus()
    await user.keyboard(" ")
    expect(screen.getByRole("dialog", { name: "Fight" })).toBeTruthy()
  })
})
