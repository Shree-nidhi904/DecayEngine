// @vitest-environment jsdom
//
// The time bar (feedback list, points 8 and 16): "Back to today" is on the dock
// itself, with the preview line, and has no icon. The page has no banner at the
// top. "Coming up" is last in the markup (the Tab order is in TimeDock.test.tsx).

import "./test/dialog-polyfill"
import { cleanup, fireEvent, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { makeAppKit } from "./test/app-kit"
import { expandDock } from "./test/dock"
import { day } from "./test/fixtures"

afterEach(cleanup)

const dock = () => document.querySelector<HTMLElement>(".sd-dock")!

function previewing() {
  const kit = makeAppKit()
  kit.add("f1", "solid", day(0))
  kit.renderApp(day(1))
  expandDock()
  fireEvent.click(screen.getByRole("button", { name: "+7 days" }))
  return kit
}

describe("Back to today on the time bar (point 16)", () => {
  it("is not there today", () => {
    const kit = makeAppKit()
    kit.add("f1", "solid", day(0))
    kit.renderApp(day(1))
    expect(screen.queryByRole("button", { name: "Back to today" })).toBeNull()
  })

  it("while previewing it is on the dock, with the preview line and no icon, and nowhere else", () => {
    previewing()
    const bar = within(dock())
    expect(screen.getAllByRole("button", { name: "Back to today" })).toHaveLength(1)
    const back = bar.getByRole("button", { name: "Back to today" })
    expect(back.querySelector("svg, img")).toBeNull()
    expect(back.textContent).toBe("Back to today")
    const line = bar.getByRole("status")
    expect(line.textContent).toContain("Future preview · nothing is saved")
    expect(line.querySelector("svg, img")).toBeNull()
    expect(document.querySelector(".shell-preview-banner")).toBeNull()
  })

  it("brings today back: the preview line and the button go, writes work again", () => {
    previewing()
    fireEvent.click(within(dock()).getByRole("button", { name: "Back to today" }))
    expect(screen.queryByRole("button", { name: "Back to today" })).toBeNull()
    expect(screen.queryByText("Future preview · nothing is saved")).toBeNull()
    expect(screen.getByRole("button", { name: "Add fact" }).getAttribute("aria-disabled")).toBeNull()
  })
})

describe("Coming up is last on the dock (point 8)", () => {
  it("comes after the jumps and Play in the markup, and the preview row comes after it", () => {
    previewing()
    const names = [...dock().querySelectorAll<HTMLElement>("input, button")].map((el) => el.getAttribute("aria-label") ?? el.textContent)
    // The toggle's text starts with its (hidden) glyph.
    const at = (name: string) => names.findIndex((n) => n === name || (name === "Coming up" && n?.endsWith("Coming up")))
    expect(at("Days ahead")).toBe(0)
    expect(at("Play")).toBeGreaterThan(at("+7 days"))
    // "Coming up" and "Back to today" sit on the bar's own line, right after the slider.
    expect(at("Coming up")).toBe(1)
    expect(at("Back to today")).toBe(2)
    // Every marker button of the timeline comes after them.
    for (const marker of dock().querySelectorAll(".sd-marker")) {
      const i = names.indexOf(marker.getAttribute("aria-label") ?? "")
      expect(i).toBeGreaterThan(at("Back to today"))
    }
  })

  it("keeps focus on the toggle when it opens and closes the dock", () => {
    const kit = makeAppKit()
    kit.add("f1", "solid", day(0))
    kit.renderApp(day(1))
    const toggle = screen.getByRole("button", { name: "Coming up" })
    toggle.focus()
    fireEvent.click(toggle)
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Coming up" }))
    fireEvent.click(screen.getByRole("button", { name: "Coming up" }))
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Coming up" }))
  })
})
