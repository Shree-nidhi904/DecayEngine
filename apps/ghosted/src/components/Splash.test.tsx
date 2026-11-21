// Splash (task 4.14; Req 6.1, 6.4, 7.4, 24.2, 25.1). The markup in jsdom
// with the dialog polyfill, and the CSS source for the light-up, which jsdom
// cannot play.

import "../test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { SPLASH_WINDOWS, Splash } from "./Splash"
import { motionBlocks, outsideMotionBlocks, readStyle, stripComments } from "../test/css"

afterEach(cleanup)

function setup() {
  const onDone = vi.fn()
  render(<Splash onDone={onDone} />)
  const dialog = screen.getByRole("dialog", { name: "Ghosted" })
  return { onDone, dialog }
}

describe("Splash", () => {
  it("is a modal dialog with six window panes, lit, in a row (Req 6.1)", () => {
    const { dialog } = setup()
    expect(dialog.tagName).toBe("DIALOG")
    expect(dialog.hasAttribute("open")).toBe(true)
    expect(SPLASH_WINDOWS).toBe(6)
    const row = dialog.querySelector(".gh-splash-windows")!
    expect(row.getAttribute("aria-hidden")).toBe("true")
    const panes = [...row.querySelectorAll<HTMLElement>(":scope > .gh-pane")]
    expect(panes).toHaveLength(6)
    for (const pane of panes) {
      expect(pane.dataset.state).toBe("alive")
      expect(pane.dataset.size).toBe("splash")
      expect(pane.style.getPropertyValue("--lit")).toBe("1.0000")
    }
  })

  it('shows "Ghosted" as a hidden paragraph, never a second h1 (Req 7.4)', () => {
    const { dialog } = setup()
    const word = dialog.querySelector(".gh-splash-word")!
    expect(word.tagName).toBe("P")
    expect(word.textContent).toBe("Ghosted")
    expect(word.getAttribute("aria-hidden")).toBe("true")
    expect(within(dialog).queryAllByRole("heading")).toHaveLength(0)
  })

  it("opens with focus on the tagline, not the button (Req 24.2)", () => {
    const { dialog } = setup()
    const tagline = within(dialog).getByText("Some windows are going dark. Let's see whose.")
    expect(tagline.getAttribute("tabindex")).toBe("-1")
    expect(document.activeElement).toBe(tagline)
  })

  it('has one button, the filled "Walk in", which calls onDone (Req 6.1, 6.4)', () => {
    const { dialog, onDone } = setup()
    const buttons = within(dialog).getAllByRole("button")
    expect(buttons.map((b) => b.textContent)).toEqual(["Walk in"])
    expect(buttons[0]!.classList.contains("gh-button-primary")).toBe(true)
    fireEvent.click(buttons[0]!)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("Escape does the same as Walk in (Req 6.4)", () => {
    const { onDone } = setup()
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

describe("Splash light-up styles (Req 6.1, 25.1)", () => {
  const motion = readStyle("motion.css")
  const inside = motionBlocks(motion).join("\n")

  it("each pane lights up in turn, at the wireframe's delays, only inside prefers-reduced-motion: no-preference", () => {
    expect(inside).toMatch(/\.gh-splash-windows \.gh-pane\s*\{[^}]*animation:\s*gh-lightup\s+0\.5s\s+both/)
    const delays = [0.3, 0.7, 1.1, 1.4, 1.9, 2.3]
    delays.forEach((delay, i) => {
      const rule = new RegExp(
        `\\.gh-splash-windows \\.gh-pane:nth-child\\(${i + 1}\\)\\s*\\{[^}]*animation-delay:\\s*${delay}s`
      )
      expect(inside, `pane ${i + 1}`).toMatch(rule)
    })
    expect(inside).toMatch(/@keyframes gh-lightup\b/)
    expect(outsideMotionBlocks(motion)).not.toMatch(/gh-lightup/)
  })

  it("the splash's own stylesheet moves nothing", () => {
    expect(stripComments(readStyle("sign.css"))).not.toMatch(/animation|transition|@keyframes/)
  })
})
