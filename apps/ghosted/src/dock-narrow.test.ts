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
})
