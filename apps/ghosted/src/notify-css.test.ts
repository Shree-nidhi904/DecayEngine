// The notification setting's styles (task L5, Req 39.11, design section
// 16.3). jsdom cannot lay out, so the rules are checked in the CSS text; the
// browser check (task 13.6) confirms them at 320, 390 and 1280px.

import { describe, expect, it } from "vitest"
import { widthPixels } from "./test/css"
import { allRules, firstRule, px, styleText } from "./test/css-rules"

const RULES = allRules()
const notifyRules = () => RULES.filter((r) => r.file === "notify.css")
const rule = (selector: string) => firstRule(RULES, "notify.css", selector)

describe("notify.css", () => {
  it("keeps at least 8px between the switch and its sentences, and from the toolbar above", () => {
    const box = rule(".gh-notify").decls
    expect(box.get("display")).toBe("grid")
    expect(px(box.get("gap"))).toBeGreaterThanOrEqual(8)
    expect(box.get("margin-block")).toBe("16px 0")
    expect(px(rule(".gh-notify-switch").decls.get("gap"))).toBeGreaterThanOrEqual(8)
    expect(rule(".gh-notify-note").decls.get("margin")).toBe("0")
  })

  it("the switch is full width and its label wraps, so it fits at 320px", () => {
    const decls = rule(".gh-notify-switch").decls
    expect(decls.get("inline-size")).toBe("100%")
    expect(decls.get("white-space")).toBe("normal")
    expect(widthPixels(styleText("notify.css")).filter((w) => w.px > 288)).toEqual([])
  })

  it("no rule hides any part of it, at any width, and nothing moves", () => {
    expect(notifyRules().length).toBeGreaterThan(0)
    for (const r of notifyRules()) {
      const where = r.selectors.join(", ")
      expect(r.decls.get("display"), where).not.toBe("none")
      expect(r.decls.get("visibility"), where).not.toBe("hidden")
      expect([...r.decls.keys()].filter((name) => /^(animation|transition)/.test(name)), where).toEqual([])
    }
    expect(styleText("notify.css")).not.toMatch(/@media/)
  })

  it("has no hover rule of its own (.gh-button pairs hover with focus-visible) and uses tokens for colour", () => {
    expect(notifyRules().flatMap((r) => r.selectors).filter((s) => s.includes(":hover"))).toEqual([])
    for (const r of notifyRules()) {
      for (const name of ["color", "background", "border-color"]) {
        const value = r.decls.get(name)
        if (value !== undefined) expect(value, `${r.selectors.join(", ")} ${name}`).toMatch(/^(var\(--[a-z-]+\)|currentColor)$/)
      }
    }
  })
})
