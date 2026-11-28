// layout.css (task 18.1): parsed as text, the same way global-css.test.ts
// reads global.css. Checks the two-column layout, that below 640px the hero,
// the lists and the side panels stack and the dialogs and the tour fit the
// screen, and that no width any app or shell style sets is wider than a
// 320px screen's content area.

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

type Rule = { selectors: string[]; declarations: Record<string, string> }

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8")

const layout = read("./layout.css")

const MOBILE_QUERY = "(max-width: 639.98px)"

/** Removes comments. */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "")

/** Splits text into its @-blocks (with their prelude and body) and everything else. */
function splitAtBlocks(css: string): { outside: string; blocks: { prelude: string; body: string }[] } {
  const blocks: { prelude: string; body: string }[] = []
  let outside = ""
  let i = 0
  while (i < css.length) {
    const at = css.indexOf("@", i)
    if (at === -1) {
      outside += css.slice(i)
      break
    }
    outside += css.slice(i, at)
    const open = css.indexOf("{", at)
    let depth = 1
    let j = open + 1
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++
      else if (css[j] === "}") depth--
      j++
    }
    blocks.push({ prelude: css.slice(at, open).trim(), body: css.slice(open + 1, j - 1) })
    i = j
  }
  return { outside, blocks }
}

/** Plain rules (no nesting). */
function rulesOf(css: string): Rule[] {
  const rules: Rule[] = []
  const pattern = /(?<=^|\})\s*([^{}@]+?)\s*\{([^{}]*)\}/g
  for (const match of css.matchAll(pattern)) {
    const declarations: Record<string, string> = {}
    for (const part of match[2]!.split(";")) {
      const colon = part.indexOf(":")
      if (colon === -1) continue
      const name = part.slice(0, colon).trim()
      if (name !== "") declarations[name] = part.slice(colon + 1).trim()
    }
    rules.push({ selectors: match[1]!.split(",").map((s) => s.trim()), declarations })
  }
  return rules
}

/** Top-level rules and the rules inside one @media block. */
function parse(css: string) {
  const { outside, blocks } = splitAtBlocks(stripComments(css))
  return { top: rulesOf(outside), blocks: blocks.map((b) => ({ prelude: b.prelude, rules: rulesOf(b.body) })) }
}

function declarationsFor(rules: Rule[], selector: string): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const rule of rules) if (rule.selectors.includes(selector)) Object.assign(merged, rule.declarations)
  return merged
}

const parsedLayout = parse(layout)
const mobileBlocks = parsedLayout.blocks.filter((b) => b.prelude === `@media ${MOBILE_QUERY}`)
const mobile = mobileBlocks[0]?.rules ?? []

describe("layout.css: wide screens", () => {
  it("stacks the raid planner and the scenes in one full-width column (visual pass)", () => {
    const grid = declarationsFor(parsedLayout.top, ".sd-layout")
    expect(grid.display).toBe("grid")
    expect(grid["grid-template-columns"]).toBe("minmax(0, 1fr)")
  })

  it("lets both columns shrink below their content (no overflow from long words)", () => {
    expect(declarationsFor(parsedLayout.top, ".sd-layout-main")["min-width"]).toBe("0")
    expect(declarationsFor(parsedLayout.top, ".sd-layout-side")["min-width"]).toBe("0")
  })
})

describe("layout.css: below 640px", () => {
  it("has exactly one narrow-screen block, for widths below 640px", () => {
    expect(mobileBlocks).toHaveLength(1)
    expect(parsedLayout.blocks.map((b) => b.prelude)).toEqual([`@media ${MOBILE_QUERY}`])
  })

  it("stacks the lists and the side panels in one column", () => {
    expect(declarationsFor(mobile, ".sd-layout")["grid-template-columns"]).toBe("minmax(0, 1fr)")
  })

  it("stacks the hero's stat cards", () => {
    const stats = declarationsFor(mobile, ".sd-hero-stats")
    expect(stats["flex-direction"]).toBe("column")
    expect(stats["align-items"]).toBe("stretch")
  })

  it("shows the cards in one column", () => {
    expect(declarationsFor(mobile, ".sd-cards")["grid-template-columns"]).toBe("minmax(0, 1fr)")
  })

  it("fits the app's dialogs to the screen, scrolling inside when tall", () => {
    for (const selector of [".sd-dialog", ".sd-confirm"]) {
      const d = declarationsFor(mobile, selector)
      expect(d.width, selector).toBe("calc(100vw - 1rem)")
      expect(d["max-width"], selector).toBe("calc(100vw - 1rem)")
      expect(d["max-height"], selector).toBe("calc(100dvh - 1rem)")
      expect(d["overflow-y"], selector).toBe("auto")
    }
  })

  it("stretches the tour across the bottom of the screen", () => {
    const t = declarationsFor(mobile, ".sd-tour")
    expect([t.left, t.right, t.bottom, t.width]).toEqual(["0.5rem", "0.5rem", "0.5rem", "auto"])
  })

  it("narrows the page padding to 0.75rem and wraps long words", () => {
    const page = declarationsFor(mobile, "main.sd-app")
    expect(page.padding).toBe("0.75rem")
    expect(page["overflow-wrap"]).toBe("anywhere")
  })
})

describe("the compact time dock (task 21, Req 19.1-19.3, 19.7, 19.8, 19.13)", () => {
  // jsdom applies no CSS, so what is shown and the page's bottom room are
  // checked in the source; the browser check at 320, 390 and 1280px is task 21.5.
  const dock = parse(read("./dock.css"))
  const world = parse(read("./world.css"))
  const NARROW = "@media (max-width: 520px)"
  const narrowRules = (parsed: ReturnType<typeof parse>) =>
    parsed.blocks.filter((b) => b.prelude === NARROW).flatMap((b) => b.rules)
  const allDockRules = [...dock.top, ...dock.blocks.flatMap((b) => b.rules)]

  it("hides the shell's jumps while collapsed, and keeps Play on the bar (as in Ghosted)", () => {
    expect(declarationsFor(dock.top, ".sd-dock:not([data-open]) .shell-time-machine-controls .shell-button-quiet").display).toBe("none")
  })

  it("never hides the slider, and no longer hides the timeline on narrow screens", () => {
    const hidden = allDockRules
      .filter((r) => r.declarations.display === "none")
      .flatMap((r) => r.selectors)
      .filter((s) => /shell-time-machine-slider|sd-timeline/.test(s))
    expect(hidden).toEqual([])
  })

  it("shows the toggle at every width, at least 44 × 44px, in the flow", () => {
    const toggle = declarationsFor(dock.top, ".sd-dock-toggle")
    expect(toggle["min-width"]).toBe("44px")
    expect(toggle["min-height"]).toBe("44px")
    expect(toggle.display).toBe("inline-flex")
    for (const rule of allDockRules.filter((r) => r.selectors.includes(".sd-dock-toggle"))) {
      expect(rule.declarations.display).not.toBe("none")
      expect(rule.declarations.position).toBeUndefined()
    }
  })

  it("uses the small candle while collapsed, at every width", () => {
    expect(declarationsFor(dock.top, ".sd-dock:not([data-open]) .sd-candle").height).toBe("44px")
  })

  it("never caps the collapsed bar; the expanded dock is capped at min(60vh, 380px) on narrow screens, with wrapping controls", () => {
    const capped = allDockRules
      .filter((r) => r.declarations["max-height"] !== undefined || r.declarations["max-block-size"] !== undefined)
      .flatMap((r) => r.selectors)
    expect(capped).toEqual([".sd-dock[data-open] .sd-dock-in"])
    const narrow = narrowRules(dock)
    expect(declarationsFor(narrow, ".sd-dock[data-open] .sd-dock-in")["max-height"]).toBe("min(60vh, 380px)")
    expect(declarationsFor(narrow, ".sd-dock[data-open] .sd-dock-in")["overflow-y"]).toBe("auto")
    expect(declarationsFor(narrow, ".sd-dock[data-open] .shell-time-machine-controls")["flex-wrap"]).toBe("wrap")
    // No sideways scroll for the controls anywhere (it hid Play in Ghosted's dock).
    const nowrap = allDockRules
      .filter((r) => r.declarations["flex-wrap"] === "nowrap")
      .flatMap((r) => r.selectors)
    expect(nowrap).toEqual([])
  })

  it("keeps the collapsed title and date on rows of their own up to 520px, so neither is squeezed", () => {
    const areas = declarationsFor(dock.top, ".sd-dock .shell-time-machine")["grid-template-areas"]
    expect(areas?.replace(/\s+/g, " ")).toContain('"title showing slider actions play"')
  })

  it("has no transition or animation in dock.css (any would go inside prefers-reduced-motion: no-preference)", () => {
    expect(stripComments(read("./dock.css"))).not.toMatch(/\b(?:transition|animation)\s*:/)
  })

  it("gives the page the dock's measured height as bottom room, with today's values as the fallbacks", () => {
    expect(declarationsFor(world.top, ".sd-world")["padding-bottom"]).toBe("calc(var(--dock-h, 15rem) + var(--badge-room, 0px) + 24px)")
    expect(declarationsFor(narrowRules(world), ".sd-world")["padding-bottom"]).toBe("calc(var(--dock-h, 10rem) + var(--badge-room, 0px) + 24px)")
    // 238 + 12 = 250px and 118 + 12 = 130px: today's scroll padding until the dock is measured.
    expect(declarationsFor(world.top, "html")["scroll-padding-bottom"]).toBe("calc(var(--dock-h, 238px) + var(--badge-room, 0px) + 12px)")
    expect(declarationsFor(narrowRules(world), "html")["scroll-padding-bottom"]).toBe(
      "calc(var(--dock-h, 118px) + var(--badge-room, 0px) + 12px)"
    )
  })
})

describe("the Triage saves line (task P5, Req 21.9, 21.10)", () => {
  // jsdom applies no CSS, so the spacing and visibility are checked in the
  // source; the measured gaps at 1280 and 390px are the browser check (task 23.5).
  const files = [
    "./global.css",
    "./app.css",
    "./dialogs.css",
    "./lists.css",
    "./hero.css",
    "./problem.css",
    "./tour.css",
    "./layout.css",
    "./animations.css",
    "./world.css",
    "./dock.css",
    "./fx.css",
    "../../../../packages/shell/src/shell.css",
  ]
  const everyRule = files.flatMap((file) => {
    const parsed = parse(read(file))
    return [...parsed.top, ...parsed.blocks.flatMap((b) => b.rules)].map((rule) => ({ file, rule }))
  })
  const dock = parse(read("./dock.css"))

  it("keeps gap: 12px on the panel, so the line has 12px above and below", () => {
    expect(declarationsFor(dock.top, ".sd-world .shell-triage").gap).toBe("12px")
    // No other app rule changes the panel's gap.
    const gaps = everyRule
      .filter(({ rule }) => rule.declarations.gap !== undefined && rule.selectors.some((s) => /\.shell-triage$/.test(s)))
      .map(({ file, rule }) => `${file} ${rule.selectors.join(", ")} { gap: ${rule.declarations.gap} }`)
    expect(gaps.sort()).toEqual([
      "../../../../packages/shell/src/shell.css .shell-triage { gap: 0.75rem }",
      "./dock.css .sd-world .shell-triage { gap: 12px }",
    ])
  })

  it("styles the line in --color-bone-dim and body type, with no margin and no media query", () => {
    expect(declarationsFor(dock.top, ".sd-world .shell-triage-note")).toEqual({
      color: "var(--color-bone-dim)",
      "font-family": "var(--font-body)",
      "font-size": "17px",
      "line-height": "1.5",
    })
    const inMedia = dock.blocks.flatMap((b) => b.rules).filter((r) => r.selectors.some((s) => s.includes("shell-triage-note")))
    expect(inMedia).toEqual([])
  })

  it("no rule at any width hides the line or pulls it in with a negative margin", () => {
    const noteRules = everyRule.filter(({ rule }) => rule.selectors.some((s) => s.includes("shell-triage-note")))
    // The check finds the shell's rule and the app's rule, so it cannot pass by reading nothing.
    expect(noteRules.map(({ file }) => file).sort()).toEqual(["../../../../packages/shell/src/shell.css", "./dock.css"])
    const bad: string[] = []
    for (const { file, rule } of noteRules) {
      const d = rule.declarations
      if (d.display === "none") bad.push(`${file}: display none`)
      if (d.visibility === "hidden") bad.push(`${file}: visibility hidden`)
      for (const [name, value] of Object.entries(d)) {
        if (/^margin/.test(name) && /-\d|-\./.test(value)) bad.push(`${file}: ${name} ${value}`)
      }
    }
    expect(bad).toEqual([])
  })
})

describe("nothing is wider than a 320px screen", () => {
  // At 320px the page content box is 320 − 2 × 0.75rem (12px) = 296px. Every
  // fixed width, minimum width, flex basis or grid column minimum that applies
  // at that size must fit in it. 1rem = 1em = 16px here (the default).
  const CONTENT_PX = 320 - 2 * 12

  const files = [
    "./global.css",
    "./app.css",
    "./dialogs.css",
    "./lists.css",
    "./hero.css",
    "./problem.css",
    "./tour.css",
    "./layout.css",
    "./animations.css",
    "./world.css",
    "./dock.css",
    "./fx.css",
    "../../../../packages/shell/src/shell.css",
  ]

  /** The value a selector's property has at 320px: the narrow-screen override if there is one. */
  function atNarrow(selector: string, property: string, value: string): string {
    const override = declarationsFor(mobile, selector)[property]
    return override ?? value
  }

  /** Fixed lengths in px that a declaration forces; relative ones (%, vw, fr, auto) force none. */
  function forcedPx(property: string, value: string): number[] {
    if (/(vw|vh|dvh|%)/.test(value)) return []
    const toPx = (n: string, unit: string) => Number(n) * (unit === "px" ? 1 : 16)
    const lengths = (text: string) => [...text.matchAll(/(\d*\.?\d+)(rem|em|px)\b/g)].map((m) => toPx(m[1]!, m[2]!))
    if (property === "grid-template-columns") {
      // A minmax(min, max) column can shrink to its minimum.
      const mins = [...value.matchAll(/minmax\(\s*([^,]+),/g)].flatMap((m) => lengths(m[1]!))
      const outsideMinmax = value.replace(/minmax\([^)]*\)/g, "")
      return [...mins, ...lengths(outsideMinmax)]
    }
    if (property === "flex") {
      const basis = value.split(/\s+/)[2]
      return basis === undefined ? [] : lengths(basis)
    }
    return lengths(value)
  }

  it("holds for every width the styles set", () => {
    const tooWide: string[] = []
    for (const file of files) {
      for (const rule of parse(read(file)).top) {
        for (const [property, raw] of Object.entries(rule.declarations)) {
          if (!["width", "min-width", "flex-basis", "flex", "grid-template-columns"].includes(property)) continue
          for (const selector of rule.selectors) {
            const value = atNarrow(selector, property, raw)
            for (const px of forcedPx(property, value)) {
              if (px > CONTENT_PX) tooWide.push(`${file} ${selector} { ${property}: ${value} } = ${px}px`)
            }
          }
        }
      }
    }
    expect(tooWide).toEqual([])
  })

  it("measures what it should: fixed widths and column minimums count, relative ones do not", () => {
    // So the check above cannot pass by measuring nothing.
    expect(forcedPx("width", "20rem")).toEqual([320])
    expect(forcedPx("min-width", "400px")).toEqual([400])
    expect(forcedPx("grid-template-columns", "repeat(auto-fill, minmax(20rem, 1fr))")).toEqual([320])
    expect(forcedPx("flex", "1 1 19rem")).toEqual([304])
    expect(forcedPx("width", "min(32rem, calc(100vw - 2rem))")).toEqual([])
    expect(forcedPx("width", "100%")).toEqual([])
    // The narrow-screen override is what applies at 320px.
    expect(atNarrow(".sd-cards", "grid-template-columns", "repeat(auto-fill, minmax(16rem, 1fr))")).toBe(
      "minmax(0, 1fr)"
    )
  })
})

describe("room for Netlify's badge (live P2 pass)", () => {
  it("has no badge room now that the site is on Cloudflare", () => {
    const css = readFileSync(fileURLToPath(new URL("./dock.css", import.meta.url)), "utf8")
    expect(css).toMatch(/:root\s*\{\s*--badge-room:\s*0px/)
    expect(css).toMatch(/\.sd-dock\s*\{[^}]*bottom:\s*var\(--badge-room, 0px\)/)
  })
})
