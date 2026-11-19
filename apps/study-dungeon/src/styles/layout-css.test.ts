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
  it("puts the lists and the side panels in two columns, the side one 16 to 22rem", () => {
    const grid = declarationsFor(parsedLayout.top, ".sd-layout")
    expect(grid.display).toBe("grid")
    expect(grid["grid-template-columns"]).toBe("minmax(0, 1fr) minmax(16rem, 22rem)")
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
