// House (task 4.1; Req 10.1, 10.4, 16.1): a roof and a wall around one
// window button per person, each shown by light, glyph and word. People are
// built through the real engine at fixed times.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { House, houseColumns, windowName } from "./House"
import type { Person } from "../policy"
import { T0, day, makeEngine } from "../test/fixtures"

afterEach(cleanup)

/** Three people at T0 on a 30-day rhythm: lit (last contact today), flickering (50 days), boarded up (90 days). */
function threePeople(): Person[] {
  const engine = makeEngine()
  const add = (name: string, lastContactAt: number) =>
    engine.addItem({ payload: { name, relationship: "Family", rhythmDays: 30, lastContactAt }, importance: 2, costMinutes: 10 }, T0)
  add("Priya Raman", T0)
  add("Sam Rivera", day(-50))
  add("Leo Marchetti", day(-90))
  return engine.view(T0)
}

describe("House", () => {
  it("draws a roof, the house name and one window button per person, named by person, state word and freshness", () => {
    const people = threePeople()
    const { container } = render(<House name="Family" people={people} onOpen={() => {}} />)

    expect(container.querySelector(".gh-house-roof")).not.toBeNull()
    expect(screen.getByRole("heading", { name: "Family" })).toBeTruthy()
    // 100 × (90 − 50) / 90 = 44.4, shown as 44.
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Priya Raman, lit, freshness 100",
      "Sam Rivera, flickering, freshness 44",
      "Leo Marchetti, boarded up, freshness 0",
    ])
    expect(windowName(people[1]!)).toBe("Sam Rivera, flickering, freshness 44")
  })

  it("each window shows its light, its glyph and its word, with the first name", () => {
    const people = threePeople()
    const { container } = render(<House name="Family" people={people} onOpen={() => {}} />)
    const wins = [...container.querySelectorAll<HTMLElement>(".gh-win")]
    expect(wins.map((w) => w.querySelector(".gh-pane")?.getAttribute("data-state"))).toEqual(["alive", "weak", "dead"])
    expect(wins.map((w) => w.querySelector("[data-glyph]")?.getAttribute("data-glyph"))).toEqual(["circle", "triangle", "cross"])
    expect(wins.map((w) => w.querySelector(".gh-win-meta")?.textContent)).toEqual(["lit", "flickering", "boarded up"])
    expect(wins.map((w) => w.querySelector(".gh-win-name")?.textContent)).toEqual(["Priya", "Sam", "Leo"])
  })

  it("activating a window (click or keyboard) opens that person", () => {
    const people = threePeople()
    const onOpen = vi.fn()
    render(<House name="Family" people={people} onOpen={onOpen} />)
    const sam = screen.getByRole("button", { name: /^Sam Rivera/ })
    fireEvent.click(sam)
    expect(onOpen).toHaveBeenCalledWith(people[1])
    // A native <button>, so Enter and Space activate it too.
    expect(sam.tagName).toBe("BUTTON")
    expect(sam.getAttribute("type")).toBe("button")
  })

  it("flashes only the window of relitId", () => {
    const people = threePeople()
    const { container } = render(<House name="Family" people={people} onOpen={() => {}} relitId={people[0]!.id} />)
    const flashing = [...container.querySelectorAll(".gh-pane")].map((p) => p.hasAttribute("data-relight"))
    expect(flashing).toEqual([true, false, false])
  })

  it("uses the wireframe's columns: 1, 2 for two or three, 3 for more", () => {
    expect([1, 2, 3, 4, 7].map(houseColumns)).toEqual([1, 2, 2, 3, 3])
  })
})
