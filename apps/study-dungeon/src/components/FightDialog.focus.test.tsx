// @vitest-environment jsdom
//
// Feedback list, point 10: after an answer the dialog's own result line has focus
// (not the page behind), focus moves without scrolling, and Close is reached by Tab.

import "../test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FightDialog } from "./FightDialog"
import { day, makeEngine } from "../test/fixtures"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function open() {
  const { engine, add, viewOf } = makeEngine()
  add("f1", "solid", day(0))
  render(<FightDialog engine={engine} now={() => day(3)} fact={viewOf("f1", day(3))} onWrite={() => {}} onClose={() => {}} />)
  return userEvent.setup()
}

describe("FightDialog focus after the answer", () => {
  it.each([
    ["I knew it", "Correct"],
    ["I forgot", "Wrong"],
  ])("%s: the result line is focused, without scrolling the page", async (answerButton, _word) => {
    const user = open()
    const focus = vi.spyOn(HTMLElement.prototype, "focus")
    await user.click(screen.getByRole("button", { name: "Show answer" }))
    await user.click(screen.getByRole("button", { name: answerButton }))
    const result = screen.getByRole("status")
    expect(result.textContent).not.toBe("")
    expect(document.activeElement).toBe(result)
    expect(result.getAttribute("tabindex")).toBe("-1")
    const onResult = focus.mock.calls.findIndex((_c, i) => focus.mock.contexts[i] === result)
    expect(focus.mock.calls[onResult]![0]).toEqual({ preventScroll: true })
    // Close is the next stop for Tab.
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }))
  })
})
