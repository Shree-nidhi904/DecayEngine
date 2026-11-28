// The dock's time machine must be allowed to shrink inside its grid column.
// Found in the manual 320px check (task 6.2): without min-inline-size: 0 the
// no-wrap jump buttons made it 592px wide inside a 210px column, so the
// slider ran off the screen. jsdom cannot lay out, so the rule is read from
// the CSS source (a real-browser check backs it in KIRO_LOG.md).

import { describe, expect, it } from "vitest"
import { firstRule, rulesOf, styleText } from "./test/css-rules"

describe("dock at narrow widths (task 6.2)", () => {
  it("lets the time machine shrink so the controls scroll inside it", () => {
    const rules = rulesOf(styleText("dock.css"), "dock.css")
    const rule = firstRule(rules, "dock.css", ".gh-dock .shell-time-machine")
    expect(rule.decls.get("min-inline-size")).toBe("0")
  })

  it("keeps the jump buttons scrolling sideways below 520px", () => {
    const rules = rulesOf(styleText("dock.css"), "dock.css")
    const rule = rules.find(
      (r) => r.selectors.includes(".gh-dock .shell-time-machine-controls") && r.decls.get("overflow-x") === "auto",
    )
    expect(rule).toBeDefined()
  })

  it("while collapsed, hides the shell's jumps but keeps Play, at every width, outside any media block (task L2, Req 34.2; feedback list, point 22)", () => {
    const css = styleText("dock.css")
    const rules = rulesOf(css, "dock.css")
    const hidden = rules.find(
      (r) =>
        r.selectors.includes(".gh-dock:not([data-expanded]) .shell-time-machine-controls .shell-button-quiet") &&
        r.decls.get("display") === "none"
    )
    expect(hidden).toBeDefined()
    // Play is the shell's filled button and is not among the hidden ones; the controls row itself is not hidden.
    const rowHidden = rules.find(
      (r) => r.selectors.includes(".gh-dock:not([data-expanded]) .shell-time-machine-controls") && r.decls.get("display") === "none"
    )
    expect(rowHidden).toBeUndefined()
    // At every width: the rule is not inside a @media block.
    const at = css.search(/\.gh-dock:not\(\[data-expanded\]\) \.shell-time-machine-controls \.shell-button-quiet \{/)
    expect(at).toBeGreaterThan(-1)
    // Every brace opened before the rule is closed again, so it is not nested in a block.
    let depth = 0
    for (const ch of css.slice(0, at)) depth += ch === "{" ? 1 : ch === "}" ? -1 : 0
    expect(depth, "not nested in @media").toBe(0)
  })

  it("the time machine stacks title and date beside the buttons, then the slider, up to 760px", () => {
    const css = styleText("dock.css")
    const start = css.search(/@media\s*\(\s*max-width:\s*760px\s*\)\s*\{/)
    expect(start).toBeGreaterThan(-1)
    const narrow = rulesOf(css.slice(css.indexOf("{", start) + 1), "dock.css")
    const grid = narrow.find((r) => r.selectors.includes(".gh-dock .shell-time-machine"))
    expect(grid?.decls.get("grid-template-columns")).toBe("minmax(0, 1fr) auto")
  })
})
