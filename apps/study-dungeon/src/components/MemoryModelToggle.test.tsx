// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryModelToggle } from "./MemoryModelToggle"
import { memoryModelText } from "../wording"

afterEach(cleanup)

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
    expect(memoryModelText.honest).toBe("The numbers are hand-picked. This is not FSRS and is not fitted to anyone's data.")
    expect(memoryModelText.help).toContain("Your facts are kept; the page reloads.")
    render(<MemoryModelToggle enabled={false} onChange={() => {}} />)
    expect(screen.getByText(memoryModelText.honest)).toBeTruthy()
  })
  // Feedback list, point 15: both rules in plain words, and the one in use is marked.
  it("shows both rules side by side and marks the one in use", () => {
    const { container, rerender } = render(<MemoryModelToggle enabled={false} onChange={() => {}} />)
    for (const line of [...memoryModelText.standard, ...memoryModelText.memory]) expect(screen.getByText(line)).toBeTruthy()
    const current = () => container.querySelector(".sd-model-col[data-current] .sd-model-title")?.textContent
    expect(current()).toBe(memoryModelText.standardTitle)
    rerender(<MemoryModelToggle enabled onChange={() => {}} />)
    expect(current()).toBe(memoryModelText.memoryTitle)
  })
  it("shows a worked example computed from the real rule: 20 days standard, 23 when nearly forgotten, 11 straight away", () => {
    render(<MemoryModelToggle enabled={false} onChange={() => {}} />)
    expect(screen.getByText(memoryModelText.exampleStandard(20))).toBeTruthy()
    expect(screen.getByText(memoryModelText.exampleLate(23))).toBeTruthy()
    expect(screen.getByText(memoryModelText.exampleEarly(11))).toBeTruthy()
  })
  it("uses no jargon in the plain-words lines", () => {
    for (const line of [...memoryModelText.standard, ...memoryModelText.memory, memoryModelText.help, memoryModelText.exampleTitle]) {
      expect(line).not.toMatch(/half-life|spacing|difficulty|lapse/i)
    }
  })
  it("makes no claim about research, proof or how memory works", () => {
    const shown = Object.values(memoryModelText).flat().map((t) => (typeof t === "function" ? t(20) : t))
    for (const text of shown) {
      expect(text).not.toMatch(/research|proven|scientific|clinical|optimal|guarantee/i)
    }
  })
})
