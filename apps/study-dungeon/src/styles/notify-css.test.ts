// The notification setting's styles (task L5, Requirement 24.11). jsdom
// cannot lay out, so the rules are checked in the CSS text; the browser
// check (task 26.6) confirms them at 320, 390 and 1280px.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const css = readFileSync(fileURLToPath(new URL("./notify.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

/** The declarations of the rule for exactly `selector`. */
function decls(selector: string): Map<string, string> {
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectors!.split(",").map((s) => s.trim()).includes(selector)) continue
    const map = new Map<string, string>()
    for (const part of body!.split(";")) {
      const colon = part.indexOf(":")
      if (colon > 0) map.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim())
    }
    return map
  }
  throw new Error(`notify.css has no rule for ${selector}`)
}

describe("notify.css", () => {
  it("takes the settings row's full width, with 8px between the switch and its sentences", () => {
    const box = decls(".sd-notify")
    expect(box.get("flex")).toBe("1 1 100%")
    expect(box.get("gap")).toBe("8px")
    expect(box.get("min-width")).toBe("0")
    expect(decls(".sd-notify-toggle").get("gap")).toBe("8px")
    expect(decls(".sd-notify-note").get("margin")).toBe("0")
  })

  it("the whole switch row is a tap target at least 44px high (found in the L5 browser check)", () => {
    expect(decls(".sd-notify-toggle").get("min-block-size")).toBe("44px")
  })

  it("sets no width in px, hides nothing at any width, and nothing moves", () => {
    expect(css).not.toMatch(/(?:^|[\s;{])(?:min-|max-)?width:\s*\d+px/)
    expect(css).not.toMatch(/display:\s*none/)
    expect(css).not.toMatch(/visibility:\s*hidden/)
    expect(css).not.toMatch(/\b(animation|transition)\b/)
    expect(css).not.toMatch(/@media/)
  })

  it("uses the app's colour variables only", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(decls(".sd-notify-note").get("color")).toBe("var(--color-bone-dim)")
    expect(decls(".sd-notify-toggle input").get("accent-color")).toBe("var(--color-pumpkin)")
  })
})
