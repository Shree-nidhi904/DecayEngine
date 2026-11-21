// ConfirmDialog (task 4.6; Req 13.5, 20.7, 24.2, 24.3). jsdom with the
// dialog polyfill (showModal, close and Escape → "cancel"). No engine here:
// the App's removal is tested in App.test.tsx.

import "../test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { ConfirmDialog } from "./ConfirmDialog"

afterEach(cleanup)

const MESSAGE = "Remove Mira Castell? This cannot be undone."

function renderDialog() {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(<ConfirmDialog message={MESSAGE} confirmLabel="Remove" onConfirm={onConfirm} onCancel={onCancel} />)
  return { onConfirm, onCancel, dialog: screen.getByRole("dialog") }
}

/** An opener button and the dialog it opens, closed by Cancel, Escape or confirm. */
function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Remove
      </button>
      {open && (
        <ConfirmDialog
          message={MESSAGE}
          confirmLabel="Remove for good"
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            onConfirm()
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

describe("ConfirmDialog", () => {
  it("is a modal dialog named by its message, with Cancel first and nothing filled", () => {
    const { dialog } = renderDialog()
    expect(dialog.tagName).toBe("DIALOG")
    expect(dialog.hasAttribute("open")).toBe(true)
    expect(screen.getByRole("dialog", { name: MESSAGE })).toBe(dialog)
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Cancel", "Remove"])
    expect(dialog.querySelectorAll(".gh-button-primary")).toHaveLength(0)
  })

  it("opens with focus on the message, not on a button (Req 24.2)", () => {
    renderDialog()
    const message = screen.getByText(MESSAGE)
    expect(document.activeElement).toBe(message)
    expect(message.tagName).toBe("P")
    expect(message.getAttribute("tabindex")).toBe("-1")
  })

  it("Cancel calls onCancel only", () => {
    const { onConfirm, onCancel } = renderDialog()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("Escape cancels", () => {
    const { onConfirm, onCancel } = renderDialog()
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("the confirm button calls onConfirm only", () => {
    const { onConfirm, onCancel } = renderDialog()
    fireEvent.click(screen.getByRole("button", { name: "Remove" }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it("on close, focus goes back to the button that opened it (Req 24.3)", () => {
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    const opener = screen.getByRole("button", { name: "Remove" })

    for (const close of [
      () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })),
      () => fireEvent.keyDown(document.activeElement!, { key: "Escape" }),
      () => fireEvent.click(screen.getByRole("button", { name: "Remove for good" })),
    ]) {
      opener.focus()
      fireEvent.click(opener)
      expect(document.activeElement).toBe(screen.getByText(MESSAGE))
      close()
      expect(screen.queryByRole("dialog")).toBeNull()
      expect(document.activeElement).toBe(opener)
    }
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
