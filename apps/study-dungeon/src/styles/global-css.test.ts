import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { cssVariables } from "../theme"

const css = readFileSync(fileURLToPath(new URL("./global.css", import.meta.url)), "utf8")

/** Top-level rules only (rules nested inside @media are skipped). */
function topLevelRules(source: string): { selectors: string[]; declarations: Record<string, string> }[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "")
  const rules: { selectors: string[]; declarations: Record<string, string> }[] = []
  // (?<=^|\}) looks at the previous rule's "}" without consuming it, so the
  // next rule can still use it as its anchor.
  const pattern = /(?<=^|\})\s*([^{}@]+?)\s*\{([^{}]*)\}/g
  for (const match of text.matchAll(pattern)) {
    const selectors = match[1].split(",").map((s) => s.trim())
    const declarations: Record<string, string> = {}
    for (const part of match[2].split(";")) {
      const colon = part.indexOf(":")
      if (colon === -1) continue
      const name = part.slice(0, colon).trim()
      const value = part.slice(colon + 1).trim()
      if (name !== "") declarations[name] = value
    }
    rules.push({ selectors, declarations })
  }
  return rules
}

function declarationsFor(selector: string): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const rule of topLevelRules(css)) {
    if (rule.selectors.includes(selector)) Object.assign(merged, rule.declarations)
  }
  return merged
}

describe("global.css", () => {
  it("finds every top-level rule, including ones that directly follow another rule", () => {
    // The old parser skipped every second rule (the one right after a matched rule),
    // so it found :root, html, h1 and :focus-visible but missed *, body and code.
    // h1 and :focus-visible alone would not have caught that; body, * and code do.
    const found = topLevelRules(css).map((r) => r.selectors)
    expect(found).toEqual(
      expect.arrayContaining([
        [":root"],
        ["*", "*::before", "*::after"],
        ["html"],
        ["body"],
        ["h1", "h2", "h3"],
        ["code", "kbd", "samp", ".num"],
        [":focus-visible"],
      ])
    )
  })

  it("declares exactly the theme's CSS variables in :root, with the same values", () => {
    const rootRules = topLevelRules(css).filter((r) => r.selectors.includes(":root"))
    expect(rootRules).toHaveLength(1)
    expect(rootRules[0].declarations).toEqual(cssVariables)
  })

  it("styles body with the theme background, text color and body font", () => {
    const body = declarationsFor("body")
    expect(body.background).toBe("var(--color-bg)")
    expect(body.color).toBe("var(--color-bone)")
    expect(body["font-family"]).toBe("var(--font-body)")
  })

  it("turns off animations and transitions when reduced motion is requested", () => {
    const block = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}/)
    expect(block).not.toBeNull()
    expect(block![1]).toMatch(/animation:\s*none\s*!important/)
    expect(block![1]).toMatch(/transition:\s*none\s*!important/)
  })
})
