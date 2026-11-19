// @vitest-environment jsdom
//
// The candle, monster and tombstone through the App (tasks 17.1-17.3): the
// icons in the hero's counters, in the three lists and in the autopsy carry
// the data-icon attributes that animations.css targets, and the tombstone
// is the one from icons.tsx in both the Graveyard and the autopsy.
// (animations.css itself, and that it is off under reduced motion, is
// checked by its own test; App.tsx importing it is checked in motion.test.ts.)
//
// Facts at day 10 (health 100 × 0.5^(days / half-life); alive ≥ 60, weak 10-60, dead < 10):
//   alive  solid, added day 10 → 100;  weak  solid, added day 2 → ≈ 57.4;  dead  new, added day 0 → ≈ 3.1

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, screen, within } from "@testing-library/react"
import { makeAppKit } from "./test/app-kit"
import { day } from "./test/fixtures"

afterEach(cleanup)

const tab = (list: string) => screen.getByRole("tab", { name: new RegExp(`^${list}`) })
const panel = () => screen.getByRole("tabpanel")

function setup() {
  const kit = makeAppKit()
  kit.add("alive", "solid", day(10))
  kit.add("weak", "solid", day(2))
  kit.add("dead", "new", day(0))
  kit.renderApp(day(10))
  return kit
}

/** The data-icon of each icon inside the elements matching the selector. */
const iconsIn = (root: ParentNode, selector: string) =>
  [...root.querySelectorAll(selector)].map((el) => el.querySelector("[data-icon]")?.getAttribute("data-icon"))

describe("state icons", () => {
  it("the hero's counters show candle, monster and tombstone", () => {
    setup()
    const stats = screen.getByRole("group", { name: "Your stats" })
    expect(iconsIn(stats, ".shell-counter")).toEqual(["candle", "monster", "tombstone"])
  })

  it("each list's cards show their state's icon", () => {
    setup()
    fireEvent.click(tab("Crypt"))
    expect(iconsIn(panel(), ".shell-item-card")).toEqual(["candle"])
    fireEvent.click(tab("Dungeon"))
    expect(iconsIn(panel(), ".shell-item-card")).toEqual(["monster"])
    fireEvent.click(tab("Graveyard"))
    expect(iconsIn(panel(), ".shell-item-card")).toEqual(["tombstone"])
  })

  it("the autopsy's title shows the same tombstone as the Graveyard card", () => {
    setup()
    fireEvent.click(tab("Graveyard"))
    const cardTombstone = panel().querySelector('[data-icon="tombstone"]')!.outerHTML
    fireEvent.click(within(panel()).getByRole("button", { name: "Autopsy" }))
    const dialog = screen.getByRole("dialog", { name: "Autopsy" })
    expect(dialog.querySelector("h2 [data-icon]")!.outerHTML).toBe(cardTombstone)
  })

  it("icons are hidden from screen readers; the state is also in words", () => {
    setup()
    for (const icon of document.querySelectorAll("[data-icon]")) {
      expect(icon.closest('[aria-hidden="true"]'), icon.getAttribute("data-icon")!).not.toBeNull()
    }
    fireEvent.click(tab("Dungeon"))
    expect(panel().querySelector(".shell-state")!.textContent).toBe("monster")
  })
})

describe("what animations.css will move", () => {
  it("the candle's flame (its first path) in the counters and on Crypt cards", () => {
    setup()
    fireEvent.click(tab("Crypt"))
    const flames = document.querySelectorAll('[data-icon="candle"] > path:first-child')
    // One in the hero's counter, one on the Crypt card.
    expect(flames).toHaveLength(2)
  })

  it("the monster shakes only on cards, so the hero's counter stays still", () => {
    setup()
    expect(document.querySelectorAll('.shell-item-card [data-icon="monster"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-icon="monster"]')).toHaveLength(2)
  })
})
