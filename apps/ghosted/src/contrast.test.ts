// Contrast (task 5.8; design section 7.6; Req 24.6, 24.5). WCAG relative
// luminance and contrast ratios worked out from the Ghosted tokens in
// styles/tokens.css, checked against the table in design section 7.6.
//
// The CSS is checked too: --dark (3.32 to 3.90, large text only) is used for
// text only in the Empty windows list's head, whose heading is 26px; and the
// shell's own controls that the app restyled (Triage, the time machine and
// the preview banner in the dock) use token pairs that pass AA on the panels
// they sit on.

import { describe, expect, it } from "vitest"
import { allRules, firstRule, styleText, varName } from "./test/css-rules"

/** The hex colour tokens declared in tokens.css. */
const TOKENS: ReadonlyMap<string, string> = new Map(
  [...styleText("tokens.css").matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1]!, m[2]!.toLowerCase()])
)

function token(name: string): string {
  const hex = TOKENS.get(name)
  if (hex === undefined) throw new Error(`tokens.css has no colour --${name}`)
  return hex
}

/** WCAG 2 relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** WCAG 2 contrast ratio between two token colours. */
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(token(a)), luminance(token(b))].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const BACKGROUNDS = ["bg", "panel", "panel-hi", "wall"] as const

describe("the formula", () => {
  it("gives the known extremes", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1, 10)
    expect(luminance("#000000")).toBe(0)
    expect((1 + 0.05) / (0 + 0.05)).toBe(21)
  })
})

describe("token pairs (design section 7.6)", () => {
  it("--bone on every background", () => {
    const expected = [16.95, 16.04, 14.76, 14.43]
    BACKGROUNDS.forEach((bg, i) => expect(ratio("bone", bg), bg).toBeCloseTo(expected[i]!, 1))
    for (const bg of BACKGROUNDS) expect(ratio("bone", bg)).toBeGreaterThanOrEqual(4.5)
  })

  it("--dim on every background", () => {
    const expected = [8.84, 8.36, 7.69, 7.52]
    BACKGROUNDS.forEach((bg, i) => expect(ratio("dim", bg), bg).toBeCloseTo(expected[i]!, 1))
    for (const bg of BACKGROUNDS) expect(ratio("dim", bg)).toBeGreaterThanOrEqual(4.5)
  })

  it("--glow, --flick, --sign, --rust and --mint on every background", () => {
    const lowest = [7.99, 7.56, 6.96, 6.8]
    BACKGROUNDS.forEach((bg, i) => {
      for (const text of ["glow", "flick", "sign", "rust", "mint"]) {
        const r = ratio(text, bg)
        expect(r, `${text} on ${bg}`).toBeGreaterThanOrEqual(lowest[i]! - 0.01)
        expect(r, `${text} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    })
  })

  it("--dark passes only for large text (at least 3.0, below 4.5)", () => {
    const expected = [3.9, 3.69, 3.39, 3.32]
    BACKGROUNDS.forEach((bg, i) => {
      expect(ratio("dark", bg), bg).toBeCloseTo(expected[i]!, 1)
      expect(ratio("dark", bg)).toBeGreaterThanOrEqual(3)
      expect(ratio("dark", bg)).toBeLessThan(4.5)
    })
  })

  it("--bg on --glow, the primary button's text", () => {
    expect(ratio("bg", "glow")).toBeCloseTo(14.36, 1)
  })

  it("the --sign focus outline stands out from every background (Req 24.5: 3:1 for non-text)", () => {
    for (const bg of BACKGROUNDS) expect(ratio("sign", bg), bg).toBeGreaterThanOrEqual(7.1)
  })
})

const RULES = allRules()
const rule = (file: string, selector: string) => firstRule(RULES, file, selector)
const varOf = varName

describe("--dark in the CSS (design section 7.6)", () => {
  it("is used as a text colour only in the Empty windows list's head, whose heading is large text", () => {
    const users = RULES.filter((r) => r.decls.get("color") === "var(--dark)")
    expect(users.length).toBeGreaterThan(0)
    for (const r of users) {
      for (const selector of r.selectors) expect(selector, r.file).toMatch(/^\.gh-plot-empty-windows /)
    }
    expect(users.flatMap((r) => r.selectors)).toContain(".gh-plot-empty-windows .gh-plot-title")
    // The heading: 26px at weight 600, which is large text (at least 24px, or 18.66px bold).
    const title = rule("layout.css", ".gh-plot-title")
    expect(title.decls.get("font-size")).toBe("26px")
    expect(title.decls.get("font-weight")).toBe("600")
  })
})

describe("the shell controls the app restyled (Triage, the dock's time machine and banner)", () => {
  // The panels they sit on: Triage and the dock are gradients from --panel-hi to --panel.
  const PANELS = ["panel-hi", "panel"] as const

  it("sit on --panel-hi to --panel", () => {
    for (const [file, selector] of [
      ["layout.css", ".gh-triage"],
      ["dock.css", ".gh-dock-in"],
    ] as const) {
      const background = rule(file, selector).decls.get("background") ?? ""
      expect(background, selector).toContain("var(--panel-hi)")
      expect(background, selector).toContain("var(--panel)")
    }
  })

  const TEXT: readonly { file: string; selector: string; text: string; on: readonly string[] }[] = [
    { file: "layout.css", selector: ".gh-app .shell-button", text: "bone", on: PANELS },
    { file: "layout.css", selector: ".gh-app .shell-button-primary", text: "bg", on: ["glow"] },
    { file: "layout.css", selector: ".gh-app .shell-preview-banner .shell-button", text: "bone", on: ["bg"] },
    { file: "layout.css", selector: ".gh-triage .shell-triage-title", text: "glow", on: PANELS },
    { file: "layout.css", selector: ".gh-triage-steps", text: "dim", on: PANELS },
    { file: "layout.css", selector: ".gh-pick-state", text: "flick", on: PANELS },
    { file: "dock.css", selector: ".gh-dock .shell-time-machine-title", text: "bone", on: PANELS },
    { file: "dock.css", selector: ".gh-dock .shell-time-machine-showing", text: "glow", on: PANELS },
    { file: "dock.css", selector: ".gh-dock .shell-preview-banner", text: "glow", on: PANELS },
    { file: "dock.css", selector: ".gh-dock-ticks", text: "dim", on: PANELS },
  ]

  it.each(TEXT)("$selector: --$text passes AA (4.5) on its background", ({ file, selector, text, on }) => {
    const r = rule(file, selector)
    expect(varOf(r.decls.get("color"))).toBe(text)
    // Where the rule sets its own background, it is the one checked.
    const own = varOf(r.decls.get("background"))
    if (own !== undefined) expect(on).toEqual([own])
    for (const bg of on) expect(ratio(text, bg), `${selector} on --${bg}`).toBeGreaterThanOrEqual(4.5)
  })

  it("the dock's marker glyphs pass 3:1 for graphics on the dock", () => {
    for (const [selector, colour] of [
      ['.gh-dock-mark[data-type="fades"]', "flick"],
      ['.gh-dock-mark[data-type="dark"]', "rust"],
    ] as const) {
      expect(varOf(rule("dock.css", selector).decls.get("color")), selector).toBe(colour)
      for (const bg of PANELS) expect(ratio(colour, bg)).toBeGreaterThanOrEqual(3)
    }
  })
})
