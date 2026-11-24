// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryModelToggle } from "./MemoryModelToggle"

describe("MemoryModelToggle", () => {
  it("is a labelled switch with a description, and reports the new value", () => {
    const onChange = vi.fn()
    render(<MemoryModelToggle enabled={false} onChange={onChange} />)
    const sw = screen.getByRole("switch", { name: "Memory model" }) as HTMLInputElement
    expect(sw.checked).toBe(false)
    const help = document.getElementById(sw.getAttribute("aria-describedby")!)
    expect(help?.textContent).toMatch(/half-life/)
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
