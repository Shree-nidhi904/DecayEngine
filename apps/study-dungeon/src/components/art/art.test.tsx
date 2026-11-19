// @vitest-environment jsdom
// The visual pass's art components: Creature moods, the HealthBar marks and
// lost segment, and the candle melting with age.

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Creature } from "./Creature"
import { HealthBar } from "./Health"
import { Candle } from "./Scenery"
import { CREATURE_KINDS } from "../../creatures"

afterEach(cleanup)

describe("Creature", () => {
  it("draws every kind in every mood, hidden from screen readers", () => {
    for (const kind of CREATURE_KINDS) {
      for (const mood of ["sleep", "worried", "feral", "happy"] as const) {
        const { container, unmount } = render(<Creature kind={kind} mood={mood} />)
        const svg = container.querySelector("svg")!
        expect(svg.getAttribute("aria-hidden")).toBe("true")
        expect(svg.getAttribute("data-creature")).toBe(kind)
        expect(svg.getAttribute("data-mood")).toBe(mood)
        // The mood class drives the idle motion in animations.css.
        expect(svg.querySelector(`g.sd-mood-${mood}`)).not.toBeNull()
        expect(svg.querySelectorAll("path, circle, ellipse").length).toBeGreaterThanOrEqual(3)
        // No data-icon: the state icon is the only data-icon on a card.
        expect(svg.querySelector("[data-icon]")).toBeNull()
        unmount()
      }
    }
  })

  it("sleeping eyes are closed curves; feral eyes have brows and small pupils", () => {
    const sleep = render(<Creature kind="slime" mood="sleep" />).container
    expect(sleep.querySelectorAll('circle[fill="#f4efe0"]')).toHaveLength(0)
    cleanup()
    const feral = render(<Creature kind="slime" mood="feral" />).container
    expect(feral.querySelectorAll('circle[fill="#f4efe0"]')).toHaveLength(2)
  })
})

describe("HealthBar", () => {
  it("puts the dead mark at 10% and the weak mark at 60%", () => {
    const { container } = render(<HealthBar health={42} />)
    expect((container.querySelector('[data-mark="dead"]') as HTMLElement).style.left).toBe("10%")
    expect((container.querySelector('[data-mark="weak"]') as HTMLElement).style.left).toBe("60%")
  })

  it("fills to the health and hatches what was lost since the last review", () => {
    const { container } = render(<HealthBar health={42} base={100} />)
    expect((container.querySelector(".sd-bar-fill") as HTMLElement).style.width).toBe("42%")
    const loss = screen.getByTestId("bar-loss")
    expect(loss.style.left).toBe("42%")
    expect(loss.style.width).toBe("58%")
  })

  it("has no lost segment without a base, and says it all in words", () => {
    render(<HealthBar health={42.7} />)
    expect(screen.queryByTestId("bar-loss")).toBeNull()
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Health 42 of 100. Weak below 60, dead below 10.")
  })
})

describe("Candle", () => {
  it("melts as the time machine looks further ahead", () => {
    const wax = (age: number) => {
      const { container, unmount } = render(<Candle age={age} />)
      const h = Number(container.querySelector("rect[fill='#e8dec4']")!.getAttribute("height"))
      unmount()
      return h
    }
    expect(wax(0)).toBe(44)
    expect(wax(0.5)).toBe(22)
    expect(wax(1)).toBe(8) // never fully gone
  })
})
