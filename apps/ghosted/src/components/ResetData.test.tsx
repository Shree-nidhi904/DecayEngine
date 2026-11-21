// ResetData (task 4.6, from task 5.4; Req 20.7, 12.5, 24.2, 24.3). The App
// wiring, with real storage keys and the first run starting again, is in
// App.first-run.test.tsx.

import "../test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ResetData } from "./ResetData"
import { previewBlockedText } from "../wording"

afterEach(cleanup)

const CONFIRM = "Reset all data? This cannot be undone."

function renderReset(blocked?: string) {
  const onConfirm = vi.fn()
  render(<ResetData onConfirm={onConfirm} blocked={blocked} />)
  return { onConfirm, button: screen.getByRole("button", { name: "Reset all data" }) }
}

describe("ResetData", () => {
  it("is a quiet button that opens the confirmation, with focus on its message", () => {
    const { button, onConfirm } = renderReset()
    expect(button.className).toBe("gh-button")
    expect(screen.queryByRole("dialog")).toBeNull()

    button.focus()
    fireEvent.click(button)

    const dialog = screen.getByRole("dialog", { name: CONFIRM })
    expect(document.activeElement).toBe(within(dialog).getByText(CONFIRM))
    expect(within(dialog).getAllByRole("button").map((b) => b.textContent)).toEqual(["Cancel", "Reset all data"])
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("Cancel and Escape close the confirmation without resetting, and focus returns to the button", () => {
    const { button, onConfirm } = renderReset()
    for (const close of [
      () => fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" })),
      () => fireEvent.keyDown(document.activeElement!, { key: "Escape" }),
    ]) {
      button.focus()
      fireEvent.click(button)
      close()
      expect(screen.queryByRole("dialog")).toBeNull()
      expect(document.activeElement).toBe(button)
    }
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("confirming calls onConfirm once and closes the confirmation", () => {
    const { button, onConfirm } = renderReset()
    fireEvent.click(button)
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reset all data" }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("during a preview: aria-disabled with the reason, and it opens nothing (Req 12.5)", () => {
    const { button, onConfirm } = renderReset(previewBlockedText)
    expect(button.getAttribute("aria-disabled")).toBe("true")
    expect(button.getAttribute("title")).toBe(previewBlockedText)
    expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toBe(previewBlockedText)
    fireEvent.click(button)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
