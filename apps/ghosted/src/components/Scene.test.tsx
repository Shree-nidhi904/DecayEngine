
//
// The scenery is art only: it is hidden from screen readers, adds no button,
// and never changes what each window says. The porch light is the mean
// light of a house's windows, with a dark window counting as 0. People are
// built through the real engine at fixed times.

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { House, ROOFS, porchValue } from "./House"
import { Street } from "./Street"
import type { Person } from "../policy"
import { T0, day, makeEngine } from "../test/fixtures"

afterEach(cleanup)

function people(lastContacts: readonly number[]): Person[] {
  const engine = makeEngine()
  lastContacts.forEach((lastContactAt, i) =>
    engine.addItem(
      { payload: { name: `Person ${i}`, relationship: i % 2 === 0 ? "Family" : "Work", rhythmDays: 30, lastContactAt },
      importance: 2, costMinutes: 10 },
      T0
    )
  )
  return engine.view(T0)
}

describe("porchValue", () => {
  it("is 0 for no people and for a house where everyone has gone dark", () => {
    expect(porchValue([])).toBe("0")
    expect(porchValue(people([day(-200), day(-300)]))).toBe("0.00")
  })

  it("is the mean light of the windows, a dark window counting as 0", () => {
    const [lit, dark] = people([T0, day(-300)])
    expect(lit!.state).toBe("alive")
    expect(dark!.state).toBe("dead")
    expect(porchValue([lit!])).toBe((Math.min(1, lit!.health / 100)).toFixed(2))
    expect(porchValue([lit!, dark!])).toBe((Math.min(1, lit!.health / 100) / 2).toFixed(2))
  })
})

describe("House scenery", () => {
  it("takes its roof from its place on the street and smokes only while someone inside is lit", () => {
    const { container, rerender } = render(<House name="Family" people={people([T0])} onOpen={() => {}} variant={5} />)
    const house = container.querySelector<HTMLElement>(".gh-house")!
    expect(house.dataset.roof).toBe(ROOFS[5 % ROOFS.length])
    expect(house.hasAttribute("data-warm")).toBe(true)

    rerender(<House name="Family" people={people([day(-300)])} onOpen={() => {}} variant={5} />)
    expect(container.querySelector(".gh-house")!.hasAttribute("data-warm")).toBe(false)
  })

  it("hides the roof, lamp and door from screen readers and adds no button", () => {
    const list = people([T0, day(-50)])
    const { container } = render(<House name="Family" people={list} onOpen={() => {}} />)
    for (const art of container.querySelectorAll(".gh-house-roof, .gh-lamp, .gh-door")) {
      expect(art.getAttribute("aria-hidden")).toBe("true")
    }
    expect(container.querySelectorAll("button")).toHaveLength(list.length)
  })
})

describe("Street scenery", () => {
  it("draws the skyline, road and branch as hidden art", () => {
    const ref = { current: null }
    const { container } = render(<Street people={people([T0, day(-50), day(-300)])} onOpen={() => {}} headingRef={ref} />)
    for (const selector of [".gh-skyline", ".gh-road", ".gh-branch", ".gh-groundfog"]) {
      const art = container.querySelector(selector)
      expect(art, selector).not.toBeNull()
      expect(art!.getAttribute("aria-hidden"), selector).toBe("true")
    }
  })
})
