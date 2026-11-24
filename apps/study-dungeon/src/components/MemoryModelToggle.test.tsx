// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryModelToggle } from "./MemoryModelToggle"
import { memoryModelText } from "../wording"

describe("MemoryModelToggle", () => {
  it("is a labelled switch with a description, and reports the new value", () => {
    const onChange = vi.fn()
    render(<MemoryModelToggle enabled={false} onChange={onChange} />)
    const sw = screen.getByRole("switch", { name: "Memory model" }) as HTMLInputElement
    expect(sw.checked).toBe(false)
    const help = document.getElementById(sw.getAttribute("aria-describedby")!)
    expect(help?.textContent).toBe(memoryModelText.help)
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  // Extensions spec, Requirements 4.1 and 15.1: the help text is honest about what the model is.
  it("says the numbers are hand-picked, that it is not FSRS and not fitted to data, and that the page reloads", () => {
    expect(memoryModelText.help).toBe(
      "Off: each right answer doubles a fact's half-life. On: a right answer helps more the later it comes, " +
        "and hard facts gain less. The numbers are hand-picked. This is not FSRS and is not fitted to anyone's data. " +
        "Your facts are kept; the page reloads."
    )
  })

  it("makes no claim about research, proof or how memory works", () => {
    for (const text of Object.values(memoryModelText)) {
      expect(text).not.toMatch(/research|proven|scientific|clinical|optimal|guarantee/i)
    }
  })
})
