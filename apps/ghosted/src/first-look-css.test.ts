// The Skip button's CSS (task L6, Req 40.7, design 17.4 and 17.6). Source
// checks: jsdom does not lay out. The browser look at 320, 390 and 1280 px
// is task 14.6.

import { describe, expect, it } from "vitest"
import { MOTION_DECLARATION } from "./test/css"
import { rulesOf, styleText } from "./test/css-rules"

const css = styleText("first-look.css")
const rules = rulesOf(css, "first-look.css")

/** The declarations of the rules for `selector`, as "property: value" lines. */
function decls(selector: string): Map<string, string> {
  const found = rules.filter((r) => r.selectors.includes(selector))
  expect(found.length, `first-look.css has a rule for ${selector}`).toBeGreaterThan(0)
  const all = new Map<string, string>()
  for (const rule of found) for (const [p, v] of rule.decls) all.set(p, v)
  return all
}

describe("first-look.css", () => {
  it("makes Skip at least 44 × 44 px", () => {
    const skip = decls(".gh-first-look-skip")
    expect(skip.get("min-block-size")).toBe("44px")
    expect(skip.get("min-inline-size")).toBe("44px")
  })

  it("keeps 8 px between Skip and the bar under it, and wraps instead of overflowing", () => {
    const box = decls(".gh-first-look")
    expect(box.get("margin-block")).toBe("0 8px")
    expect(box.get("flex-wrap")).toBe("wrap")
    expect(box.get("max-inline-size")).toBe("100%")
  })

  it("sets no width in px, no colour, no motion and never hides it", () => {
    expect(css).not.toMatch(/(?:^|[\s;{])(?:inline-size|width|min-width|max-width)\s*:\s*\d+px/)
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|hsl/i)
    expect(MOTION_DECLARATION.test(css)).toBe(false)
    expect(css).not.toMatch(/display\s*:\s*none|visibility\s*:\s*hidden/)
  })
})
