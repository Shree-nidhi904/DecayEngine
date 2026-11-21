// The hero (task 4.5; Req 8.1-8.7, 16.1, 20.1, 20.9). People come from a real
// engine at fixed times (rhythm 30: lit while 36 days or less since the last
// contact, flickering until 81, dark after).

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createRef } from "react"
import { Hero, type HeroProps } from "./Hero"
import { InMemoryAdapter, type IdGenerator } from "@decay-engine/engine"
import type { GhostedEngine } from "../engine-instance"
import type { Person, PersonPayload } from "../policy"
import { previewBlockedText } from "../wording"
import { T0, counterIds, day, makeEngine } from "../test/fixtures"

afterEach(cleanup)

function add(engine: GhostedEngine, name: string, lastContactAt: number): string {
  const payload: PersonPayload = { name, relationship: "", rhythmDays: 30, lastContactAt }
  return engine.addItem({ payload, importance: 2, costMinutes: 10 }, T0)
}

function peopleOf(build: (engine: GhostedEngine) => void, ids: IdGenerator = counterIds()): Person[] {
  const engine = makeEngine(new InMemoryAdapter(), ids)
  build(engine)
  return engine.view(T0)
}

function renderHero(people: readonly Person[], extra: Partial<HeroProps> = {}) {
  const props = {
    onReachOut: vi.fn(),
    onGoTo: vi.fn(),
    onLoadSample: vi.fn(),
    onStartEmpty: vi.fn(),
    onAdd: vi.fn(),
  }
  const headingRef = createRef<HTMLHeadingElement>()
  const result = render(
    <Hero people={people} firstRun={false} blocked={undefined} headingRef={headingRef} {...props} {...extra} />
  )
  return { ...result, ...props, headingRef }
}

const heading = () => screen.getByRole("heading", { level: 2 })
const filled = (container: HTMLElement) => [...container.querySelectorAll<HTMLButtonElement>(".gh-button-primary")]

const mixed = (engine: GhostedEngine) => {
  add(engine, "Priya Raman", day(-12)) // lit
  add(engine, "Grace Liu", day(-50)) // flickering, 44.4
  add(engine, "Dan Okafor", day(-70)) // flickering, 22.2 (the lowest)
  add(engine, "Meera Joshi", day(-40)) // flickering, 55.6
  add(engine, "Leo Marchetti", day(-90)) // boarded up
}

describe("Hero cases (Req 8.1-8.3, 8.6, 8.7, 20.1)", () => {
  it('first run: "Welcome to the street.", primary "Load sample street", quiet "Start empty"', () => {
    const { container, onLoadSample, onStartEmpty } = renderHero([], { firstRun: true })
    expect(heading().textContent).toBe("Welcome to the street.")
    expect(filled(container).map((b) => b.textContent)).toEqual(["Load sample street"])
    const startEmpty = screen.getByRole("button", { name: "Start empty" })
    expect(startEmpty.className).not.toContain("gh-button-primary")
    fireEvent.click(screen.getByRole("button", { name: "Load sample street" }))
    expect(onLoadSample).toHaveBeenCalledTimes(1)
    fireEvent.click(startEmpty)
    expect(onStartEmpty).toHaveBeenCalledTimes(1)
  })

  it('N fading: "N windows are flickering" and "Reach out to <first name>" for the lowest freshness', () => {
    const people = peopleOf(mixed)
    const { container, onReachOut } = renderHero(people)
    expect(heading().textContent).toBe("3 windows are flickering")
    expect(filled(container).map((b) => b.textContent)).toEqual(["Reach out to Dan"])
    fireEvent.click(filled(container)[0]!)
    expect(onReachOut).toHaveBeenCalledTimes(1)
    expect(onReachOut.mock.calls[0]![0].payload.name).toBe("Dan Okafor")
  })

  it('one fading: "1 window is flickering"', () => {
    const people = peopleOf((e) => {
      add(e, "Grace Liu", day(-50))
      add(e, "Priya Raman", day(-12))
    })
    renderHero(people)
    expect(heading().textContent).toBe("1 window is flickering")
    expect(screen.getByRole("button", { name: "Reach out to Grace" })).toBeTruthy()
  })

  it("equal freshness: the tie goes to the lower id", () => {
    // Same last contact, so the same freshness; ids b1 then a2 make the second added the lower id.
    let n = 0
    const ids: IdGenerator = () => (++n === 1 ? "b1" : "a2")
    const people = peopleOf((e) => {
      add(e, "Joel Kim", day(-50))
      add(e, "Ayesha Khan", day(-50))
    }, ids)
    const { onReachOut } = renderHero(people)
    fireEvent.click(screen.getByRole("button", { name: "Reach out to Ayesha" }))
    expect(onReachOut.mock.calls[0]![0].id).toBe("a2")
  })

  it('nobody fading, some dark: "Nobody is fading." and "See the empty windows" goes to that list', () => {
    const people = peopleOf((e) => {
      add(e, "Priya Raman", day(-12))
      add(e, "Leo Marchetti", day(-90))
    })
    const { container, onGoTo } = renderHero(people)
    expect(heading().textContent).toBe("Nobody is fading.")
    expect(filled(container).map((b) => b.textContent)).toEqual(["See the empty windows"])
    fireEvent.click(filled(container)[0]!)
    expect(onGoTo).toHaveBeenCalledWith("empty")
  })

  it('everyone lit: "Every window is lit." and "Look at the street" goes to the Street', () => {
    const people = peopleOf((e) => {
      add(e, "Priya Raman", day(-12))
      add(e, "Sunita Rao", T0)
    })
    const { container, onGoTo } = renderHero(people)
    expect(heading().textContent).toBe("Every window is lit.")
    expect(filled(container).map((b) => b.textContent)).toEqual(["Look at the street"])
    fireEvent.click(filled(container)[0]!)
    expect(onGoTo).toHaveBeenCalledWith("street")
  })

  it('no people after the first run: "No windows yet." and "Add a person" (Req 8.7, 20.9)', () => {
    const { container, onAdd } = renderHero([])
    expect(heading().textContent).toBe("No windows yet.")
    expect(filled(container).map((b) => b.textContent)).toEqual(["Add a person"])
    fireEvent.click(filled(container)[0]!)
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it("has exactly one filled button in every case (Req 8.6)", () => {
    const cases: [readonly Person[], boolean][] = [
      [[], true],
      [[], false],
      [peopleOf(mixed), false],
      [peopleOf((e) => add(e, "Leo Marchetti", day(-90))), false],
      [peopleOf((e) => add(e, "Priya Raman", T0)), false],
    ]
    const seen = new Set<string>()
    for (const [people, firstRun] of cases) {
      const { container, unmount } = renderHero(people, { firstRun })
      expect(filled(container), heading().textContent ?? "").toHaveLength(1)
      seen.add(container.querySelector(".gh-hero")!.getAttribute("data-case")!)
      unmount()
    }
    expect(seen).toEqual(new Set(["first-run", "empty", "fading", "dark", "lit"]))
  })

  it("the message is a focusable h2 held by headingRef", () => {
    const { headingRef } = renderHero(peopleOf(mixed))
    expect(headingRef.current).toBe(heading())
    expect(heading().getAttribute("tabindex")).toBe("-1")
  })
})

describe("Hero counters (Req 8.4, 16.1)", () => {
  it("shows the shell's three counters, each with its glyph, its count and the list name", () => {
    const { container } = renderHero(peopleOf(mixed))
    const counters = [...container.querySelectorAll<HTMLElement>(".shell-counter")]
    expect(
      counters.map((c) => [
        c.getAttribute("data-state"),
        c.querySelector("[data-glyph]")?.getAttribute("data-glyph"),
        c.querySelector(".shell-counter-count")?.textContent,
        c.querySelector(".shell-counter-label")?.textContent,
      ])
    ).toEqual([
      ["alive", "circle", "1", "Still lit"],
      ["weak", "triangle", "3", "Fading"],
      ["dead", "cross", "1", "Empty windows"],
    ])
  })

  it("counts the people it is given, so a preview's people change them", () => {
    // The same person, seen today (lit) and 40 days later (flickering).
    const engine = makeEngine()
    add(engine, "Priya Raman", day(-12))
    const r = renderHero(engine.view(T0))
    const count = (state: string) => r.container.querySelector(`.shell-counter[data-state="${state}"] .shell-counter-count`)?.textContent
    expect([count("alive"), count("weak")]).toEqual(["1", "0"])
    r.rerender(
      <Hero
        people={engine.view(day(40))}
        firstRun={false}
        blocked={undefined}
        headingRef={r.headingRef}
        onReachOut={r.onReachOut}
        onGoTo={r.onGoTo}
        onLoadSample={r.onLoadSample}
        onStartEmpty={r.onStartEmpty}
        onAdd={r.onAdd}
      />
    )
    expect([count("alive"), count("weak")]).toEqual(["0", "1"])
    expect(heading().textContent).toBe("1 window is flickering")
  })
})

describe("Hero during a preview (Req 8.5)", () => {
  it('shows "Future preview · <date>" and blocks the primary button with the reason', () => {
    const { container, onReachOut } = renderHero(peopleOf(mixed), { previewDate: "3 Mar 2027", blocked: previewBlockedText })
    expect(container.querySelector(".gh-hero-eyebrow")?.textContent).toBe("Future preview · 3 Mar 2027")
    const primary = filled(container)[0]!
    expect(primary.textContent).toBe("Reach out to Dan")
    expect(primary.getAttribute("aria-disabled")).toBe("true")
    expect(primary.getAttribute("title")).toBe("Future preview · nothing is saved")
    const reason = document.getElementById(primary.getAttribute("aria-describedby")!)
    expect(reason?.textContent).toBe("Future preview · nothing is saved")
    // Still focusable, and activation does nothing.
    expect(primary.hasAttribute("disabled")).toBe(false)
    fireEvent.click(primary)
    expect(onReachOut).not.toHaveBeenCalled()
  })

  it("blocks both first-run buttons, which write", () => {
    const { onLoadSample, onStartEmpty } = renderHero([], { firstRun: true, previewDate: "3 Mar 2027", blocked: previewBlockedText })
    for (const name of ["Load sample street", "Start empty"]) {
      const b = screen.getByRole("button", { name })
      expect(b.getAttribute("aria-disabled"), name).toBe("true")
      fireEvent.click(b)
    }
    expect(onLoadSample).not.toHaveBeenCalled()
    expect(onStartEmpty).not.toHaveBeenCalled()
  })

  it("today: no eyebrow, nothing blocked", () => {
    const { container } = renderHero(peopleOf(mixed))
    expect(container.querySelector(".gh-hero-eyebrow")).toBeNull()
    expect(filled(container)[0]!.hasAttribute("aria-disabled")).toBe(false)
    expect(container.querySelector(".gh-hero-blocked")).toBeNull()
  })
})
