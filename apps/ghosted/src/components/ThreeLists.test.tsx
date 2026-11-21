// ThreeLists and SectionNav (task 4.3; Req 11.1-11.6, 16.1, 24.4, 24.7).
// People are built through the real engine at fixed times. Layout rules jsdom
// cannot measure (no sideways scroll at 320px, one column under 760px) are
// checked in the CSS source.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { createRef } from "react"
import { MAX_FORECAST_HORIZON_MS } from "@decay-engine/engine"
import { SectionNav, ThreeLists } from "./ThreeLists"
import type { PersonActions } from "./PersonCard"
import type { GhostedEngine } from "../engine-instance"
import type { StreetView } from "../lists"
import type { PersonPayload } from "../policy"
import { previewBlockedText } from "../wording"
import { T0, day, makeEngine } from "../test/fixtures"
import { MOTION_DECLARATION, readStyle, ruleBody, stripComments, widthPixels } from "../test/css"

afterEach(cleanup)

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const noActions: PersonActions = {
  onReachOut: () => {},
  onReconnect: () => {},
  onAutopsy: () => {},
  onEdit: () => {},
  onRemove: () => {},
}

function add(engine: GhostedEngine, name: string, lastContactAt: number, relationship = ""): string {
  const payload: PersonPayload = { name, relationship, rhythmDays: 30, lastContactAt }
  return engine.addItem({ payload, importance: 2, costMinutes: 10 }, T0)
}

function viewAt(engine: GhostedEngine, now = T0): StreetView {
  return {
    now,
    realNow: now,
    people: engine.view(now),
    darkAt: new Map(engine.forecast(now, MAX_FORECAST_HORIZON_MS).map((e) => [e.item.id, e.diesAt] as const)),
    version: 0,
  }
}

function renderLists(engine: GhostedEngine, extra: { blocked?: string } = {}) {
  const headingRefs = { fading: createRef<HTMLHeadingElement>(), empty: createRef<HTMLHeadingElement>(), still: createRef<HTMLHeadingElement>() }
  const onOpen = vi.fn()
  const result = render(
    <ThreeLists
      view={viewAt(engine)}
      engine={engine}
      blocked={extra.blocked}
      headingRefs={headingRefs}
      onOpen={onOpen}
      actions={noActions}
      formatDate={isoDay}
    />
  )
  return { ...result, headingRefs, onOpen }
}

/** A street at T0: two fading, two dark, two lit. */
function street(): GhostedEngine {
  const engine = makeEngine()
  add(engine, "Dan Okafor", day(-70)) // weak 22.2
  add(engine, "Grace Liu", day(-50), "Neighbours") // weak 44.4
  add(engine, "Leo Marchetti", day(-90)) // dark at the add
  add(engine, "Tomas Novak", day(-120)) // dark at the add
  add(engine, "Priya Raman", day(-12), "Family") // lit, fades on day 24
  add(engine, "Sunita Rao", day(-30)) // lit, fades on day 6
  return engine
}

const section = (container: HTMLElement, id: string) => container.querySelector<HTMLElement>(`section[data-section="${id}"]`)!

describe("ThreeLists", () => {
  it("stacks Fading, Empty windows and Still lit in that order, each with a focusable h2", () => {
    const { container, headingRefs } = renderLists(street())
    const sections = [...container.querySelectorAll("section.gh-plot")]
    expect(sections.map((s) => s.getAttribute("data-section"))).toEqual(["fading", "empty", "still"])
    const headings = screen.getAllByRole("heading", { level: 2 })
    expect(headings.map((h) => h.textContent)).toEqual(["Fading", "Empty windows", "Still lit"])
    for (const h of headings) expect(h.getAttribute("tabindex")).toBe("-1")
    expect(headingRefs.fading.current).toBe(headings[0])
    expect(headingRefs.empty.current).toBe(headings[1])
    expect(headingRefs.still.current).toBe(headings[2])
    // Each section is named by its heading.
    expect(screen.getByRole("region", { name: "Fading" })).toBe(sections[0])
  })

  it("gives each list its own light and a count badge (Req 11.4)", () => {
    const { container } = renderLists(street())
    expect(section(container, "fading").className).toContain("gh-plot-fading")
    expect(section(container, "empty").className).toContain("gh-plot-empty-windows")
    expect(section(container, "still").className).toContain("gh-plot-still")
    const badges = ["fading", "empty", "still"].map((id) => section(container, id).querySelector(".gh-badge")!)
    expect(badges.map((b) => b.getAttribute("data-count"))).toEqual(["2", "2", "2"])
    expect(badges[0]!.querySelector(".gh-visually-hidden")?.textContent).toBe("2 people")

    const css = readStyle("layout.css")
    expect(ruleBody(css, ".gh-plot-fading")).toMatch(/var\(--flick\)/)
    expect(css).toMatch(/\.gh-plot-empty-windows \.gh-plot-title\s*\{[^}]*color:\s*var\(--dark\)/)
    expect(css).toMatch(/\.gh-plot-empty-windows \.gh-badge\s*\{[^}]*color:\s*var\(--dim\)/)
    expect(ruleBody(css, ".gh-plot-still")).toMatch(/var\(--glow\)/)
  })

  it("Fading: weak people as cards, lowest freshness first (Req 11.1)", () => {
    const { container } = renderLists(street())
    const names = [...section(container, "fading").querySelectorAll(".gh-card-name")].map((h) => h.textContent)
    expect(names).toEqual(["Dan Okafor", "Grace Liu"])
  })

  it("Empty windows: dead people as cards, most recently dark first, ties by id (Req 11.2)", () => {
    const { container } = renderLists(street())
    // Both went dark at the add (T0): the tie goes by id, p3 before p4.
    const names = [...section(container, "empty").querySelectorAll(".gh-card-name")].map((h) => h.textContent)
    expect(names).toEqual(["Leo Marchetti", "Tomas Novak"])
    expect(section(container, "empty").querySelectorAll(".gh-button-primary")).toHaveLength(2)
  })

  it('Still lit: compact rows, soonest to fade first, with light, glyph, word and "starts fading in N days" (Req 11.3, 16.1)', () => {
    const { container, onOpen } = renderLists(street())
    const rows = [...section(container, "still").querySelectorAll<HTMLElement>(".gh-row")]
    expect(rows.map((r) => r.querySelector(".gh-row-name")?.textContent)).toEqual(["Sunita Rao", "Priya Raman"])
    expect(rows.map((r) => r.querySelector('[data-fact="fades"]')?.textContent)).toEqual([
      "starts fading in 6 days",
      "starts fading in 24 days",
    ])
    for (const r of rows) {
      expect(r.querySelector(".gh-pane")?.getAttribute("data-state")).toBe("alive")
      expect(r.querySelector("[data-glyph]")?.getAttribute("data-glyph")).toBe("circle")
      expect(r.querySelector(".gh-row-state")?.textContent).toBe("lit")
    }
    expect(rows[1]!.textContent).toContain("Family")

    fireEvent.click(within(rows[1]!).getByRole("button", { name: "Open Priya Raman" }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen.mock.calls[0]![0].payload.name).toBe("Priya Raman")
    // Open is quiet: the list's cards hold the region's primary buttons.
    expect(within(rows[1]!).getByRole("button", { name: "Open Priya Raman" }).className).toBe("gh-button")
  })

  it("an empty list shows one line in its own words and no empty grid (Req 11.6)", () => {
    const engine = makeEngine()
    add(engine, "Priya Raman", T0)
    const { container } = renderLists(engine)
    expect(section(container, "fading").querySelector(".gh-plot-empty")?.textContent).toBe("Nobody is fading.")
    expect(section(container, "fading").querySelector("ul")).toBeNull()
    expect(section(container, "empty").querySelector(".gh-plot-empty")?.textContent).toBe("No empty windows.")
    expect(section(container, "still").querySelector(".gh-plot-empty")).toBeNull()

    cleanup()
    const dark = makeEngine()
    add(dark, "Leo Marchetti", day(-90))
    const second = renderLists(dark)
    expect(section(second.container, "still").querySelector(".gh-plot-empty")?.textContent).toBe("No window is lit right now.")
  })

  it("passes the preview block to every card", () => {
    const { container } = renderLists(street(), { blocked: previewBlockedText })
    const writes = [...container.querySelectorAll('[data-action="reach-out"], [data-action="reconnect"]')]
    expect(writes).toHaveLength(4)
    for (const b of writes) expect(b.getAttribute("aria-disabled")).toBe("true")
  })
})

describe("SectionNav (Req 11.5)", () => {
  it("lists the Street and the three lists with their counts, in a Sections landmark", () => {
    const onGoTo = vi.fn()
    render(<SectionNav counts={{ alive: 4, weak: 3, dead: 1 }} onGoTo={onGoTo} />)
    const nav = screen.getByRole("navigation", { name: "Sections" })
    const buttons = within(nav).getAllByRole("button")
    expect(buttons.map((b) => b.textContent)).toEqual(["Street", "Fading3", "Empty windows1", "Still lit4"])

    for (const [i, id] of (["street", "fading", "empty", "still"] as const).entries()) {
      fireEvent.click(buttons[i]!)
      expect(onGoTo).toHaveBeenLastCalledWith(id)
    }
  })
})

describe("list and card CSS (source checks: jsdom does not lay out)", () => {
  const files = ["layout.css", "window.css", "street.css"] as const

  it("nothing sets a width or minimum above 288px, so 320px never scrolls sideways (Req 24.4)", () => {
    for (const file of files) {
      const wide = widthPixels(readStyle(file)).filter((w) => w.px > 288)
      expect(wide, file).toEqual([])
    }
    // The check itself finds a planted wide minimum, and lets min(100%, …) through.
    expect(widthPixels(".a { min-width: 320px }").map((w) => w.px)).toEqual([320])
    expect(widthPixels(".a { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)) }").map((w) => w.px)).toEqual([300])
    expect(widthPixels(".a { inline-size: min(100%, 400px); max-inline-size: 1080px }")).toEqual([])
  })

  it("the card grid shrinks to the screen, and everything is one column under 760px (Req 24.7)", () => {
    const css = stripComments(readStyle("layout.css"))
    expect(ruleBody(css, ".gh-cards")).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(100%,\s*280px\),\s*1fr\)\)/)
    expect(css).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*\.gh-cards\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);?\s*\}/)
    expect(ruleBody(css, ".gh-app")).toMatch(/max-inline-size:\s*1080px/)
    expect(ruleBody(css, ".gh-app")).toMatch(/padding-inline-start:\s*max\(16px/)
  })

  it("layout.css declares no animation or transition (Req 25.1)", () => {
    expect(stripComments(readStyle("layout.css"))).not.toMatch(MOTION_DECLARATION)
  })
})
