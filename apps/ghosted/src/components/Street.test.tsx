// The Street (task 4.4; Req 10.1-10.5, 16.1, 25.1). People come from a real
// engine at fixed times. The motion rules (moths, fog, headlights) are checked
// in the CSS source, because jsdom does not animate.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { createRef } from "react"
import { Street } from "./Street"
import { houseColumns, houseWidth } from "./House"
import type { GhostedEngine } from "../engine-instance"
import type { PersonPayload } from "../policy"
import { motionBlocks, outsideMotionBlocks, readStyle, ruleBody } from "../test/css"
import { T0, day, makeEngine } from "../test/fixtures"

afterEach(cleanup)

function add(engine: GhostedEngine, name: string, relationship: string, lastContactAt: number): string {
  const payload: PersonPayload = { name, relationship, rhythmDays: 30, lastContactAt }
  return engine.addItem({ payload, importance: 2, costMinutes: 10 }, T0)
}

/** Lit, flickering, boarded up and lit again, on three houses. */
function street() {
  const engine = makeEngine()
  add(engine, "Priya Raman", "Family", T0) // lit, 100
  add(engine, "Dan Okafor", "Work", day(-70)) // flickering, 22.2
  add(engine, "Leo Marchetti", "", day(-90)) // boarded up at the add
  const nia = add(engine, "Nia Bello", "Work", day(-90)) // dark at the add …
  expect(engine.resurrect(nia, { kind: "call" }, T0)).toEqual({ ok: true }) // … then lit again
  return engine
}

function renderStreet(engine = street()) {
  const onOpen = vi.fn()
  const headingRef = createRef<HTMLHeadingElement>()
  const result = render(<Street people={engine.view(T0)} onOpen={onOpen} headingRef={headingRef} />)
  return { ...result, onOpen, headingRef }
}

describe("Street", () => {
  it("is a section named by its focusable h2, with the freshness note under it (Req 10.5)", () => {
    const { headingRef } = renderStreet()
    const heading = screen.getByRole("heading", { level: 2, name: "The Street" })
    expect(heading.getAttribute("tabindex")).toBe("-1")
    expect(headingRef.current).toBe(heading)
    const region = screen.getByRole("region", { name: "The Street" })
    expect(within(region).getByText("The light shows how recently you were in touch. It does not measure how much anyone matters.")).toBeTruthy()
  })

  it('shows houses by relationship, "Others" last, each person once as a window (Req 10.1, 10.2)', () => {
    const { container } = renderStreet()
    const houses = [...container.querySelectorAll<HTMLElement>(".gh-house")]
    expect(houses.map((h) => h.querySelector("h3")?.textContent)).toEqual(["Family", "Work", "Others"])
    expect(houses.map((h) => [...h.querySelectorAll(".gh-win-name")].map((n) => n.textContent))).toEqual([
      ["Priya"],
      ["Dan", "Nia"],
      ["Leo"],
    ])
    expect(container.querySelectorAll("button.gh-win")).toHaveLength(4)
  })

  it('names each window "<name>, <state word>, freshness <n>" and shows light, glyph and word (Req 10.1, 16.1)', () => {
    const { container } = renderStreet()
    const cases = [
      ["Priya Raman, lit, freshness 100", "alive", "circle", "lit"],
      ["Dan Okafor, flickering, freshness 22", "weak", "triangle", "flickering"],
      ["Nia Bello, lit again, freshness 100", "litAgain", "circle", "lit again"],
      ["Leo Marchetti, boarded up, freshness 0", "dead", "cross", "boarded up"],
    ] as const
    for (const [name, state, glyph, word] of cases) {
      const button = screen.getByRole("button", { name })
      expect(button.querySelector(".gh-pane")?.getAttribute("data-state"), name).toBe(state)
      const meta = button.querySelector<HTMLElement>(".gh-win-meta")!
      expect(meta.querySelector("[data-glyph]")?.getAttribute("data-glyph"), name).toBe(glyph)
      expect(meta.textContent, name).toBe(word)
    }
    // Every window is a real button, so Enter and Space work without extra code.
    for (const b of container.querySelectorAll("button.gh-win")) expect(b.getAttribute("type")).toBe("button")
  })

  it("activating a window calls onOpen with that person (Req 10.4)", () => {
    const { onOpen } = renderStreet()
    fireEvent.click(screen.getByRole("button", { name: "Dan Okafor, flickering, freshness 22" }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen.mock.calls[0]![0].payload.name).toBe("Dan Okafor")
  })

  it('shows a legend: circle "lit", triangle "flickering", cross "boarded up" (Req 10.3)', () => {
    const { container } = renderStreet()
    const items = [...container.querySelectorAll(".gh-legend li")]
    expect(items.map((li) => [li.querySelector("[data-glyph]")?.getAttribute("data-glyph"), li.textContent])).toEqual([
      ["circle", "lit"],
      ["triangle", "flickering"],
      ["cross", "boarded up"],
    ])
  })

  it("puts moths only beside lit windows, hidden from assistive technology", () => {
    const { container } = renderStreet()
    const moths = [...container.querySelectorAll<HTMLElement>(".gh-moths")]
    expect(moths.map((m) => m.closest("button")?.getAttribute("aria-label"))).toEqual([
      "Priya Raman, lit, freshness 100",
      "Nia Bello, lit again, freshness 100",
    ])
    for (const m of moths) {
      expect(m.getAttribute("aria-hidden")).toBe("true")
      expect(m.querySelectorAll("i")).toHaveLength(3)
    }
    expect(container.querySelector(".gh-fog")?.getAttribute("aria-hidden")).toBe("true")
    expect(container.querySelector(".gh-headlights")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("an empty street shows no houses", () => {
    const { container } = renderStreet(makeEngine())
    expect(container.querySelectorAll(".gh-house")).toHaveLength(0)
  })
})

describe("Street window labels (source checks: jsdom does not lay out; Req 16.1, 24.4)", () => {
  const css = readStyle("street.css")
  const px = (value: string | undefined) => Number(/(\d+(?:\.\d+)?)px/.exec(value ?? "")?.[1])
  const declaration = (body: string, property: string) =>
    new RegExp(`(?:^|[\\s;{])${property}\\s*:\\s*([^;]+)`).exec(body)?.[1]?.trim()

  it("the state word never breaks inside a word, and the glyph may wrap above it", () => {
    const meta = ruleBody(css, ".gh-win-meta")!
    expect(declaration(meta, "overflow-wrap")).toBe("normal")
    expect(declaration(meta, "word-break")).toBe("normal")
    expect(declaration(meta, "hyphens")).toBe("none")
    expect(declaration(meta, "flex-wrap")).toBe("wrap")
    // No uppercase or extra spacing that would widen the word.
    expect(declaration(meta, "text-transform")).toBe("none")
    expect(declaration(meta, "letter-spacing")).toBe("normal")
    // The word stays the word: the label still holds the full state word (Req 16.1).
    const { container } = renderStreet()
    const words = [...container.querySelectorAll(".gh-win-meta")].map((m) => m.textContent)
    expect(words).toEqual(expect.arrayContaining(["flickering", "boarded up"]))
  })

  it('every window column is wide enough for "flickering" on one line, even squeezed at 320px', () => {
    const fontPx = px(declaration(ruleBody(css, ".gh-win-meta")!, "font-size"))
    expect(fontPx).toBe(11)
    // IBM Plex Mono (and the monospace fallbacks) advance 0.6em per character.
    const longestWord = Math.max(...["lit", "lit again", "flickering", "boarded up"].flatMap((w) => w.split(" ").map((p) => p.length)))
    const wordPx = longestWord * 0.6 * fontPx // 66px

    const body = ruleBody(css, ".gh-house-body")!
    const bodyInline = px(declaration(body, "padding")?.split(/\s+/)[1]) // "8px 8px 12px": 8px each side
    const wallBorder = px(declaration(body, "border"))
    const columnGap = px(declaration(ruleBody(css, ".gh-wins")!, "gap"))
    const buttonInline = px(declaration(ruleBody(css, ".gh-win")!, "padding")?.split(/\s+/)[1]) // "4px 2px"
    expect([bodyInline, wallBorder, columnGap, buttonInline].every(Number.isFinite)).toBe(true)

    // The Street's content box at 320px: 320 − 2 × 16 gutter − 2 × 14 plot padding − 2 × 1 border (layout.css, under 760px).
    const streetAt320 = 320 - 32 - 28 - 2
    expect(ruleBody(css, ".gh-house")).toMatch(/inline-size:\s*min\(100%,\s*var\(--w/)
    // houseColumns gives 1, 2 or 3 columns.
    expect([1, 2, 3, 4, 9].map(houseColumns)).toEqual([1, 2, 2, 3, 3])
    for (const columns of [1, 2, 3]) {
      for (const houseOuter of [houseWidth(columns), Math.min(houseWidth(columns), streetAt320)]) {
        const inner = houseOuter - 2 * bodyInline - 2 * wallBorder
        const column = (inner - (columns - 1) * columnGap) / columns
        expect(column - 2 * buttonInline, `${columns} columns at ${houseOuter}px`).toBeGreaterThanOrEqual(wordPx)
      }
    }
    // The widest house is the 288px content box at 320px, so the street never scrolls sideways.
    expect(houseWidth(3)).toBeLessThanOrEqual(288)
  })
})

describe("Street motion (source checks, Req 25.1)", () => {
  const street = readStyle("street.css")
  const motion = readStyle("motion.css")
  const inside = motionBlocks(motion).join("\n")

  it("moths, fog and headlights move only inside prefers-reduced-motion: no-preference", () => {
    expect(inside).toMatch(/\.gh-moths i\s*\{[^}]*animation:\s*gh-moth\b/)
    expect(inside).toMatch(/\.gh-fog\s*\{[^}]*animation:\s*gh-fog\b/)
    expect(inside).toMatch(/\.gh-headlights\s*\{[^}]*animation:\s*gh-headlights\b/)
    expect(outsideMotionBlocks(motion)).not.toMatch(/gh-moth|gh-fog|gh-headlights/)
  })

  it("under reduced motion, moths and headlights are not shown and the fog stays still", () => {
    expect(ruleBody(street, ".gh-moths")).toMatch(/display:\s*none/)
    expect(ruleBody(street, ".gh-headlights")).toMatch(/display:\s*none/)
    expect(ruleBody(street, ".gh-fog")).not.toMatch(/display:\s*none/)
    // The motion block shows them again.
    expect(inside).toMatch(/\.gh-moths\s*\{[^}]*display:\s*block/)
    expect(inside).toMatch(/\.gh-headlights\s*\{[^}]*display:\s*block/)
  })
})
