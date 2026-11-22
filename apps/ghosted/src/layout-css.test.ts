// Layout source checks (task 5.9; design sections 5.4 and 9.6; Req 24.4,
// 24.5, 24.7, 12.7, 13.4). jsdom cannot lay out, so the rules are checked in
// the CSS text; the manual check at 320, 390 and 1280px confirms them on
// screen (design open issue 3.5).
//
// - Nothing sets a width or a minimum width above 288px, the content box at
//   320px with 16px gutters, so the page never scrolls sideways.
// - The dock is capped at --dock-max and scrolls inside itself; below 520px
//   its controls and the preview banner scroll sideways inside the dock.
// - The page keeps the dock's height clear: scroll-padding-bottom and the
//   bottom padding of <main> (Req 12.7).
// - A visible focus outline everywhere, never removed.
// - Tap targets of at least 44 × 44px for the app's buttons and the shell's
//   Triage and dock controls the app restyled.

import { describe, expect, it } from "vitest"
import { houseWidth } from "./components/House"
import { widthPixels } from "./test/css"
import { allRules, firstRule, px, rulesOf, styleFiles, styleText } from "./test/css-rules"

const RULES = allRules()
const rule = (file: string, selector: string) => firstRule(RULES, file, selector)

/** The body of the `@media (max-width: 520px)` block in `css`. */
function narrowBlock(css: string): string {
  const start = css.search(/@media\s*\(\s*max-width:\s*520px\s*\)\s*\{/)
  expect(start, "a max-width: 520px block").toBeGreaterThan(-1)
  const open = css.indexOf("{", start) + 1
  let depth = 1
  let i = open
  while (i < css.length && depth > 0) {
    if (css[i] === "{") depth++
    else if (css[i] === "}") depth--
    i++
  }
  return css.slice(open, i - 1)
}

describe("320px: no sideways page scroll (Req 24.4, 24.7)", () => {
  it("no width, minimum width, flex basis or grid minimum above 288px in any style file", () => {
    const wide = styleFiles().flatMap((file) => widthPixels(styleText(file)).filter((w) => w.px > 288).map((w) => `${file}: ${w.text}`))
    expect(wide).toEqual([])
  })

  it("the widest house (three window columns) is exactly 288px, and the CSS caps it at 100%", () => {
    expect(houseWidth(3)).toBe(288)
    expect(rule("street.css", ".gh-house").decls.get("inline-size")).toBe("min(100%, var(--w, 200px))")
  })

  it("the page is full width up to 1080px, with gutters of at least 16px", () => {
    const app = rule("layout.css", ".gh-app")
    expect(app.decls.get("max-inline-size")).toBe("1080px")
    expect(app.decls.get("padding-inline-start")).toMatch(/^max\(16px,/)
    expect(app.decls.get("padding-inline-end")).toMatch(/^max\(16px,/)
  })
})

describe("the dock (Req 12.7, 24.4)", () => {
  it("is fixed at the bottom, never taller than --dock-max, and scrolls inside itself", () => {
    const dock = rule("dock.css", ".gh-dock")
    expect(dock.decls.get("position")).toBe("fixed")
    expect(dock.decls.get("inset-block-end")).toBe("0")
    expect(dock.decls.get("max-block-size")).toBe("var(--dock-max)")
    expect(dock.decls.get("overflow-y")).toBe("auto")
  })

  it("below 520px, the jumps, Play and Back to today scroll sideways inside the dock", () => {
    const narrow = rulesOf(narrowBlock(styleText("dock.css")), "dock.css")
    const sideways = narrow.find(
      (r) => r.selectors.includes(".gh-dock .shell-time-machine-controls") && r.selectors.includes(".gh-dock .shell-preview-banner")
    )
    expect(sideways).toBeDefined()
    expect(sideways!.decls.get("flex-wrap")).toBe("nowrap")
    expect(sideways!.decls.get("overflow-x")).toBe("auto")
    // The buttons keep their size and their words on one line.
    const buttons = narrow.find((r) => r.selectors.includes(".gh-dock .shell-time-machine-controls .shell-button"))
    expect(buttons?.decls.get("flex")).toBe("none")
    expect(buttons?.decls.get("white-space")).toBe("nowrap")
    // The slider stays: nothing in the narrow block hides it.
    expect(narrow.filter((r) => r.decls.get("display") === "none").flatMap((r) => r.selectors).sort()).toEqual([
      ".gh-dock-ticks",
      ".gh-dock-track",
    ])
  })

  it("the page keeps the dock's height clear: scroll padding and the bottom padding of <main>", () => {
    expect(rule("layout.css", ":root").decls.get("--dock-max")).toBe("180px")
    const narrow = rulesOf(narrowBlock(styleText("layout.css")), "layout.css")
    expect(narrow.find((r) => r.selectors.includes(":root"))?.decls.get("--dock-max")).toBe("128px")
    // Task L2 (Req 34.7, 34.12): the dock's measured height, --dock-h, with --dock-max until it is measured.
    expect(rule("layout.css", "html").decls.get("scroll-padding-bottom")).toBe("calc(var(--dock-h, var(--dock-max)) + 12px)")
    expect(rule("layout.css", ".gh-main").decls.get("padding-block-end")).toBe("calc(var(--dock-h, var(--dock-max)) + 24px)")
  })

  it("the screen-reader-only class hides its content from view without removing it (task L2, Req 34.6)", () => {
    const decls = rule("layout.css", ".gh-sr-only").decls
    expect(decls.get("position")).toBe("absolute")
    expect(decls.get("inline-size")).toBe("1px")
    expect(decls.get("block-size")).toBe("1px")
    expect(decls.get("overflow")).toBe("hidden")
    expect(decls.get("clip-path")).toBe("inset(50%)")
    // Never display: none or visibility: hidden, which would hide it from screen readers too.
    expect(decls.has("display")).toBe(false)
    expect(decls.has("visibility")).toBe(false)
  })
})

describe("focus (Req 24.5)", () => {
  it("a 2px --sign outline with a 2px offset on everything that takes focus", () => {
    const focus = rule("global.css", ":focus-visible")
    expect(focus.decls.get("outline")).toBe("2px solid var(--sign)")
    expect(focus.decls.get("outline-offset")).toBe("2px")
    // The shell's own buttons, restyled by the app, keep the same outline.
    const shell = RULES.find(
      (r) => r.file === "layout.css" && r.selectors.length === 1 && r.selectors[0] === ".gh-app .shell-button:focus-visible"
    )
    expect(shell?.decls.get("outline")).toBe("2px solid var(--sign)")
    expect(shell?.decls.get("outline-offset")).toBe("2px")
  })

  it("no rule removes the outline", () => {
    const removed = RULES.filter((r) => /^(?:none|0)$/.test(r.decls.get("outline") ?? "") || r.decls.get("outline-style") === "none")
    expect(removed.map((r) => `${r.file}: ${r.selectors.join(", ")}`)).toEqual([])
  })
})

describe("tap targets of at least 44 × 44px (Req 13.4, 24.1)", () => {
  const BOTH: [string, string][] = [
    ["layout.css", ".gh-button"],
    // The shell's Triage choices, Plan, Start reaching out, the dock's jumps, Play and Back to today.
    ["layout.css", ".gh-app .shell-button"],
    ["layout.css", ".gh-app .shell-triage-choice"],
    ["layout.css", ".gh-forecast-choice"],
    ["dialogs.css", ".gh-radio"],
    ["street.css", ".gh-win"],
    // Task L2: the dock's "Coming up" toggle (Req 34.3).
    ["dock.css", ".gh-dock-toggle"],
  ]

  it.each(BOTH)("%s %s: min-inline-size and min-block-size at least 44px", (file, selector) => {
    const decls = rule(file, selector).decls
    expect(px(decls.get("min-inline-size")), "min-inline-size").toBeGreaterThanOrEqual(44)
    expect(px(decls.get("min-block-size")), "min-block-size").toBeGreaterThanOrEqual(44)
  })

  it("the contact choices in the dialogs: full width and at least 44px tall", () => {
    const decls = rule("dialogs.css", ".gh-choice").decls
    expect(decls.get("inline-size")).toBe("100%")
    expect(px(decls.get("min-block-size"))).toBeGreaterThanOrEqual(44)
  })
})

describe("the Triage saves line (task P5, Req 36.10)", () => {
  const noteRules = () => RULES.filter((r) => r.selectors.some((s) => s.includes(".shell-triage-note")))

  it("is styled in layout.css with no margin of its own, so the shell panel's 12px gap sits above and below it", () => {
    const decls = rule("layout.css", ".gh-triage .shell-triage-note").decls
    expect(decls.get("color")).toBe("var(--dim)")
    for (const name of decls.keys()) expect(name, `.gh-triage .shell-triage-note sets ${name}`).not.toMatch(/^margin/)
  })

  it("no rule in the app's CSS hides it, at any width, or gives it a margin", () => {
    expect(noteRules().length).toBeGreaterThan(0)
    for (const r of noteRules()) {
      const where = `${r.file}: ${r.selectors.join(", ")}`
      expect(r.decls.get("display"), where).not.toBe("none")
      expect(r.decls.get("visibility"), where).not.toBe("hidden")
      expect([...r.decls.keys()].filter((name) => /^margin/.test(name)), where).toEqual([])
    }
  })

  it("no rule in the app's CSS changes the shell panel's gap or display", () => {
    const panel = RULES.filter((r) => r.selectors.some((s) => /(^|\s)\.shell-triage$/.test(s)))
    expect(panel.length).toBeGreaterThan(0)
    for (const r of panel) {
      const where = `${r.file}: ${r.selectors.join(", ")}`
      expect(r.decls.has("gap"), where).toBe(false)
      expect(r.decls.has("row-gap"), where).toBe(false)
      expect(r.decls.has("display"), where).toBe(false)
    }
  })
})
