// Window art, glyphs and marker shapes (task 4.1; Req 16.1, 16.3-16.5, 25.1,
// 30.3). jsdom renders the markup; the motion rules are checked in the CSS
// source, because jsdom does not animate.

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { Window, litValue } from "./Window"
import { Glyph, StateGlyph, ghostedIcons, glyphOf, renderContactMarker } from "./icons"
import type { ShownState } from "../lists"
import { MOTION_DECLARATION, motionBlocks, outsideMotionBlocks, readStyle, ruleBody, stripComments } from "../test/css"
import { litOf, one } from "../test/dom"

afterEach(cleanup)

const pane = (container: HTMLElement) => one(container, ".gh-pane")

describe("Window", () => {
  it("dead: boarded up with two boards, no silhouette, no light", () => {
    const { container } = render(<Window health={0} state="dead" size="card" />)
    const el = pane(container)
    expect(el.dataset.state).toBe("dead")
    expect(el.dataset.boards).toBe("on")
    expect(el.querySelectorAll(".gh-board")).toHaveLength(2)
    expect(el.querySelector(".gh-sil")).toBeNull()
    expect(litOf(el)).toBe("0")
  })

  it("dead stays at 0 light even if given a stale health", () => {
    const { container } = render(<Window health={37} state="dead" size="street" />)
    expect(litOf(pane(container))).toBe("0")
  })

  it('weak: data-state="weak", a silhouette, no boards, and --lit = health / 100 to 4 decimals', () => {
    const { container } = render(<Window health={44.444444} state="weak" size="street" />)
    const el = pane(container)
    expect(el.dataset.state).toBe("weak")
    expect(el.querySelector(".gh-sil")).not.toBeNull()
    expect(el.querySelector(".gh-board")).toBeNull()
    expect(el.dataset.boards).toBeUndefined()
    expect(litOf(el)).toBe("0.4444")
  })

  it("alive and lit again: a silhouette, no boards, full light at 100", () => {
    for (const state of ["alive", "litAgain"] as const) {
      const { container, unmount } = render(<Window health={100} state={state} size="card" />)
      const el = pane(container)
      expect(el.dataset.state).toBe(state)
      expect(el.querySelector(".gh-sil")).not.toBeNull()
      expect(el.querySelector(".gh-board")).toBeNull()
      expect(litOf(el)).toBe("1.0000")
      unmount()
    }
  })

  it('a reconnect: boards="falling" keeps the boards on a lit window, and relight marks the flash', () => {
    const { container } = render(<Window health={100} state="litAgain" size="dialog" boards="falling" relight />)
    const el = pane(container)
    expect(el.dataset.boards).toBe("falling")
    expect(el.querySelectorAll(".gh-board")).toHaveLength(2)
    expect(el.querySelector(".gh-sil")).not.toBeNull()
    expect(el.hasAttribute("data-relight")).toBe(true)
  })

  it("is art only: hidden from assistive technology, with its size as data", () => {
    const { container } = render(<Window health={70} state="alive" size="splash" />)
    const el = pane(container)
    expect(el.getAttribute("aria-hidden")).toBe("true")
    expect(el.dataset.size).toBe("splash")
    expect(el.hasAttribute("data-relight")).toBe(false)
  })

  it("litValue clamps to 0-1", () => {
    expect(litValue(120, "alive")).toBe("1.0000")
    expect(litValue(-3, "weak")).toBe("0.0000")
    expect(litValue(58.88889, "weak")).toBe("0.5889")
  })
})

describe("state glyphs", () => {
  it.each([
    ["alive", "circle"],
    ["litAgain", "circle"],
    ["weak", "triangle"],
    ["dead", "cross"],
  ] as const)("%s uses the %s", (state: ShownState, shape) => {
    expect(glyphOf[state]).toBe(shape)
    const { container } = render(<StateGlyph state={state} />)
    const svg = container.querySelector("svg")!
    expect(svg.getAttribute("data-glyph")).toBe(shape)
    expect(svg.getAttribute("aria-hidden")).toBe("true")
    // Drawn in currentColor only, so the word's colour (and never colour alone) carries it.
    const painted = [...svg.querySelectorAll("*")].flatMap((el) => [el.getAttribute("stroke"), el.getAttribute("fill")])
    expect(painted.filter((v) => v !== null && v !== "none" && v !== "currentColor")).toEqual([])
  })

  it("the shell icons are the circle, triangle and cross", () => {
    const { container } = render(
      <>
        {ghostedIcons.alive}
        {ghostedIcons.weak}
        {ghostedIcons.dead}
      </>
    )
    expect([...container.querySelectorAll("svg")].map((s) => s.getAttribute("data-glyph"))).toEqual([
      "circle",
      "triangle",
      "cross",
    ])
  })

  it("Glyph renders each shape as its own drawing", () => {
    const html = (["circle", "triangle", "cross"] as const).map((shape) => {
      const { container, unmount } = render(<Glyph shape={shape} />)
      const text = container.innerHTML
      unmount()
      return text
    })
    expect(new Set(html).size).toBe(3)
  })
})

describe("contact marker shapes", () => {
  it("message, call and meet-up are an envelope, a diamond and two dots, all different from the state glyphs", () => {
    const { container } = render(
      <svg>
        {renderContactMarker("text")}
        {renderContactMarker("call")}
        {renderContactMarker("meetup")}
        {renderContactMarker("other")}
      </svg>
    )
    const shapes = [...container.querySelectorAll("g[data-shape]")].map((g) => g.getAttribute("data-shape"))
    expect(shapes).toEqual(["envelope", "diamond", "two-dots", "dot"])
    for (const glyph of ["circle", "triangle", "cross"]) expect(shapes).not.toContain(glyph)
    // Drawn in currentColor, which .gh-marker sets to --sign.
    for (const g of container.querySelectorAll("g[data-shape]")) expect(g.getAttribute("class")).toBe("gh-marker")
    for (const el of container.querySelectorAll("g[data-shape] > *")) {
      const paints = [el.getAttribute("fill"), el.getAttribute("stroke")].filter((v) => v !== null && v !== "none")
      expect(paints.length).toBeGreaterThan(0)
      expect(paints.every((v) => v === "currentColor")).toBe(true)
    }
    expect(ruleBody(readStyle("window.css"), ".gh-marker")).toMatch(/color:\s*var\(--sign\)/)
  })
})

describe("window CSS (source checks: jsdom does not lay out or animate)", () => {
  const windowCss = readStyle("window.css")
  const streetCss = readStyle("street.css")
  const motionCss = readStyle("motion.css")

  it("background, glow and silhouette opacity read --lit (Req 16.3)", () => {
    const pane = ruleBody(windowCss, ".gh-pane")!
    expect(pane).toMatch(/background:[^;]*var\(--lit\)/)
    expect(pane).toMatch(/box-shadow:[^;]*var\(--lit\)/)
    expect(ruleBody(windowCss, ".gh-sil")).toMatch(/opacity:[^;]*var\(--lit\)/)
  })

  it("a dead pane is dark with no silhouette (Req 16.5)", () => {
    expect(ruleBody(windowCss, '.gh-pane[data-state="dead"]')).toMatch(/background:\s*var\(--bg\)/)
    expect(ruleBody(windowCss, '.gh-pane[data-state="dead"] .gh-sil')).toMatch(/display:\s*none/)
  })

  it("window.css and street.css declare no animation or transition (Req 25.1)", () => {
    expect(stripComments(windowCss)).not.toMatch(MOTION_DECLARATION)
    expect(stripComments(streetCss)).not.toMatch(MOTION_DECLARATION)
  })

  it("every animation and transition in motion.css is inside prefers-reduced-motion: no-preference", () => {
    const blocks = motionBlocks(motionCss)
    expect(blocks).toHaveLength(1)
    expect(outsideMotionBlocks(motionCss)).not.toMatch(MOTION_DECLARATION)
    const inside = blocks[0]!
    // The four motions of this task are all there.
    expect(inside).toMatch(/\.gh-pane\[data-state="weak"\]\s*\{[^}]*animation:\s*gh-flicker/)
    expect(inside).toMatch(/\.gh-pane\s*\{[^}]*transition:/)
    expect(inside).toMatch(/data-boards="falling"\][^{]*\.gh-board\s*\{[^}]*animation:\s*gh-boards-fall/)
    expect(inside).toMatch(/\.gh-pane\[data-relight\]\s*\{[^}]*animation:\s*gh-relight/)
  })

  it("under reduced motion, falling boards are gone at once: the static rule hides them outside the block", () => {
    expect(outsideMotionBlocks(motionCss)).toMatch(/\.gh-pane\[data-boards="falling"\] \.gh-boards\s*\{\s*display:\s*none;?\s*\}/)
  })

  it("the motion check itself finds a planted animation outside the block", () => {
    const planted = `.x { animation: spin 1s; }\n@media (prefers-reduced-motion: no-preference) { .y { transition: color .2s; } }`
    expect(outsideMotionBlocks(planted)).toMatch(MOTION_DECLARATION)
    expect(motionBlocks(planted)[0]).toMatch(MOTION_DECLARATION)
    expect(outsideMotionBlocks(`.a { transition-duration: 1s }`)).toMatch(MOTION_DECLARATION)
    expect(outsideMotionBlocks(`.a { color: red }`)).not.toMatch(MOTION_DECLARATION)
  })
})
