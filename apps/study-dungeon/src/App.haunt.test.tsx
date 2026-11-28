// @vitest-environment jsdom
// The haunt pass in Study Dungeon (Req 1, 2, 5, 6). Written by Claude Code
// on day 0 is weak at +30 days and dead at +34 (App.test.tsx works the
// numbers): its card is marked as it crosses, --doom follows the day shown,
// the Keeper speaks a plain line, and the Spooky level is kept.

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, screen } from "@testing-library/react"
import { DAY_MS } from "./policy"
import { SPOOKY_KEY } from "./spooky-level"
import { hauntText, keeperText } from "./wording"
import { day } from "./test/fixtures"
import { makeAppKit } from "./test/app-kit"
import { expandDock } from "./test/dock"

afterEach(cleanup)

const slider = () => screen.getByRole("slider")
const card = (container: HTMLElement) => container.querySelector<HTMLElement>("article.sd-card")

describe("haunt pass: cards crossing in the preview (Req 1)", () => {
  it("marks a waking card fades, a dying card dies, and clears both back at today", () => {
    const kit = makeAppKit()
    kit.add("s1", "solid", day(0))
    const { container } = kit.renderApp(day(0))
    const world = container.querySelector<HTMLElement>(".sd-world")!
    expect(world.style.getPropertyValue("--doom")).toBe("0.0000")

    expandDock()
    fireEvent.change(slider(), { target: { value: String(30 * DAY_MS) } })
    expect(card(container)!.dataset.crossed).toBe("fades")
    expect(world.style.getPropertyValue("--doom")).toBe("0.5000")

    fireEvent.change(slider(), { target: { value: String(34 * DAY_MS) } })
    fireEvent.click(screen.getByRole("tab", { name: /Graveyard/ }))
    expect(card(container)!.dataset.crossed).toBe("dies")
    expect(world.dataset.doom).toBe("grim")

    fireEvent.click(screen.getAllByRole("button", { name: "Back to today" })[0]!)
    fireEvent.click(screen.getByRole("tab", { name: /Crypt/ }))
    expect(card(container)!.dataset.crossed).toBeUndefined()
  })
})

describe("haunt pass: the Keeper (Req 5)", () => {
  it("speaks a plain line, and a preview death gets a preview-death line", () => {
    const kit = makeAppKit()
    kit.add("s1", "solid", day(0))
    const { container } = kit.renderApp(day(0))
    const line = () => container.querySelector(".sd-keeper-line")!
    expect(line().closest("[aria-live]")).toBeNull()
    expect(keeperText.asleep.some((l) => line().textContent!.endsWith(l))).toBe(true)
    expandDock()
    fireEvent.change(slider(), { target: { value: String(34 * DAY_MS) } })
    expect(keeperText.previewDeath.some((l) => line().textContent!.endsWith(l))).toBe(true)
  })

  it("every line is short, names an action and has no guilt words", () => {
    const ACTION = /\b(add|import|drag|peek|fight|start|pick|open|read|try|keep dragging|back to today|go back)\b/i
    const lines = Object.values(keeperText).flatMap((v) => (Array.isArray(v) ? v : []))
    expect(lines.length).toBeGreaterThan(10)
    for (const l of lines) {
      expect(l.length, l).toBeLessThanOrEqual(120)
      expect(l, l).toMatch(ACTION)
      expect(l, l).not.toMatch(/\b(forgot|overdue|late|should|fault|failed|this week)\b/i)
    }
  })
})

describe("haunt pass: the Spooky level (Req 6)", () => {
  it("starts haunted, turns calm with one press and keeps the choice", () => {
    const kit = makeAppKit()
    kit.add("s1", "solid", day(0))
    const { container } = kit.renderApp(day(0))
    const world = container.querySelector<HTMLElement>(".sd-world")!
    expect(world.dataset.spooky).toBe("haunted")
    const toggle = screen.getByRole("button", { name: hauntText.spooky.label })
    expect(toggle.getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(toggle)
    expect(world.dataset.spooky).toBe("calm")
    expect(kit.storage.getItem(SPOOKY_KEY)).toBe("calm")
  })
})
