// The Skip button's CSS (task L6, Requirement 25.7). Source checks: jsdom
// does not lay out. The browser look at 320, 390 and 1280 px is task 27.6.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const css = readFileSync(fileURLToPath(new URL("./first-look.css", import.meta.url)), "utf8")
const code = css.replace(/\/\*[\s\S]*?\*\//g, "")

/** The declarations inside the rule whose selector is exactly `selector`. */
function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(code)
  expect(match, `first-look.css has a rule for ${selector}`).not.toBeNull()
  return match![1]!
}

describe("first-look.css", () => {
  it("makes Skip at least 44 × 44 px", () => {
    const skip = block(".sd-first-look-skip")
    expect(skip).toMatch(/min-block-size:\s*44px/)
    expect(skip).toMatch(/min-inline-size:\s*44px/)
  })

  it("keeps 8 px between Skip and the bar under it, and wraps instead of overflowing", () => {
    const box = block(".sd-first-look")
    expect(box).toMatch(/margin-block:\s*0 8px/)
    expect(box).toMatch(/flex-wrap:\s*wrap/)
    expect(box).toMatch(/max-inline-size:\s*100%/)
  })

  it("sets no width in px, no colour, no motion and never hides it", () => {
    expect(code).not.toMatch(/(?:^|[\s;{])(?:inline-size|width|min-width|max-width)\s*:\s*\d+px/)
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|hsl/i)
    expect(code).not.toMatch(/animation|transition|@keyframes/)
    expect(code).not.toMatch(/display\s*:\s*none|visibility\s*:\s*hidden/)
  })
})
