// @vitest-environment jsdom
// Feedback list, point 13: the (i) notes beside importance, minutes and rhythm.
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useFieldHelp } from "./FieldHelp"
import { fieldHelpText } from "../wording"

afterEach(cleanup)

function Field() {
  const help = useFieldHelp("Importance", fieldHelpText.importance)
  return (
    <div>
      <span>Importance</span>
      {help.button}
      {help.text}
    </div>
  )
}

describe("useFieldHelp", () => {
  it("is a named button that shows and hides the note", () => {
    render(<Field />)
    const button = screen.getByRole("button", { name: "What is importance?" })
    expect(button.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByText(fieldHelpText.importance)).toBeNull()
    fireEvent.click(button)
    expect(button.getAttribute("aria-expanded")).toBe("true")
    const note = screen.getByText(fieldHelpText.importance)
    expect(button.getAttribute("aria-controls")).toBe(note.id)
    fireEvent.click(button)
    expect(screen.queryByText(fieldHelpText.importance)).toBeNull()
  })

  it("explains each field in plain words, with no blame", () => {
    for (const note of [fieldHelpText.importance, fieldHelpText.cost, fieldHelpText.rhythm]) {
      expect(note.length).toBeGreaterThan(20)
      expect(note).not.toMatch(/doesn't care|ignored you|ghosted you|\bdead\b|\bdie/i)
    }
  })
})
