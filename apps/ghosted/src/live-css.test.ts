// The live-change message and card reaction in the CSS (task L3, Req 38.2,
// 38.4, 38.8, design sections 15.5 and 15.7). jsdom cannot lay out or
// animate, so the rules are checked in the CSS text; the browser check at
// 320, 390 and 1280px (task 12.6) confirms them on screen.

import { describe, expect, it } from "vitest"
import { motionBlocks, outsideMotionBlocks } from "./test/css"
import { allRules, firstRule, rulesOf, styleFiles, styleText } from "./test/css-rules"

const RULES = allRules()
const inside = rulesOf(motionBlocks(styleText("motion.css")).join("\n"), "motion.css")
const insideDecl = (selector: string, property: string) =>
  inside.find((r) => r.selectors.includes(selector))?.decls.get(property)

describe("motion (Req 38.2, 38.4)", () => {
  it("the card's window flickers out once, only inside the no-preference block", () => {
    expect(insideDecl(".gh-card.gh-just-changed .gh-pane", "animation")).toMatch(/^gh-flicker-out [\d.]+s 1$/)
    expect(motionBlocks(styleText("motion.css")).join("\n")).toMatch(/@keyframes gh-flicker-out/)
  })

  it("the toast fades in and out inside the block; its style file has no motion", () => {
    expect(insideDecl(".gh-toast", "animation")).toMatch(/^gh-toast-life [\d.]+s forwards$/)
    expect(styleText("toast.css")).not.toMatch(/\b(animation|transition)\s*:/)
    expect(motionBlocks(styleText("toast.css"))).toEqual([])
  })

  it("no rule outside the block gives the marker class a look of its own", () => {
    const outside = styleFiles()
      .flatMap((file) => rulesOf(outsideMotionBlocks(styleText(file)), file))
      .filter((r) => r.selectors.some((s) => s.includes("gh-just-changed")))
    expect(outside.map((r) => `${r.file}: ${r.selectors.join(", ")}`)).toEqual([])
    // The marker is used: the rule inside the block exists.
    expect(inside.some((r) => r.selectors.some((s) => s.includes("gh-just-changed")))).toBe(true)
  })
})

describe("the toast's place and size (Req 38.4, 38.8)", () => {
  it("sticks to the top of the dock's box, 8px above the bar, as wide as the dock's content at most", () => {
    const decls = firstRule(RULES, "toast.css", ".gh-toast").decls
    expect(decls.get("position")).toBe("sticky")
    expect(decls.get("inset-block-start")).toBe("0")
    expect(decls.get("margin-block")).toBe("0 8px")
    expect(decls.get("max-inline-size")).toBe("100%")
    expect(decls.get("flex-wrap")).toBe("wrap")
    expect(decls.has("inline-size") && decls.get("inline-size") !== "fit-content").toBe(false)
  })

  it("is never hidden, at any width, by any rule", () => {
    const rules = RULES.filter((r) => r.selectors.some((s) => /\.gh-toast\b/.test(s)))
    expect(rules.length).toBeGreaterThan(0)
    for (const r of rules) {
      const where = `${r.file}: ${r.selectors.join(", ")}`
      expect(r.decls.get("display"), where).not.toBe("none")
      expect(r.decls.get("visibility"), where).not.toBe("hidden")
    }
    // Nothing inside a narrow media block of toast.css either.
    expect(styleText("toast.css")).not.toMatch(/@media/)
  })

  it("the Dismiss button is a quiet app button (44 × 44px from .gh-button), never filled", () => {
    const rules = RULES.filter((r) => r.selectors.includes(".gh-toast-dismiss"))
    for (const r of rules) expect(r.decls.has("background"), r.file).toBe(false)
  })
})
