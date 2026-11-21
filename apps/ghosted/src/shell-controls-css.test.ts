// The shell's own controls dressed as the app's buttons (cosmetic pass after
// tasks 5.1 to 5.3; design-tokens.md shell rules, amended Req 30.4, 24.5).
//
// The shell's Triage panel (Plan, Start reaching out, the budget choices),
// time machine (the jumps, Play) and preview banner (Back to today) draw
// their own buttons. layout.css gives them the look of .gh-button through
// rules scoped under .gh-app. This reads the CSS as text (never imports it)
// and checks: the rules are scoped; the font, size, spacing and case are the
// same as .gh-button's; the 44px tap targets; the filled look only on the
// shell's primary buttons, as .gh-button-primary; the focus outline is the
// app's own. It also checks the shell still uses those class names, so the
// rules reach real elements. The shell's files are only read.

import { describe, expect, it } from "vitest"
import { join } from "node:path"
import { readText, REPO_DIR, SRC_DIR } from "./test/source-files"

type Rule = { selectors: string[]; declarations: Map<string, string> }

/** Every innermost rule of a stylesheet (rules inside @media included), comments removed. */
function rulesOf(css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const rules: Rule[] = []
  for (const [, selectorText, body] of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = new Map<string, string>()
    for (const part of body!.split(";")) {
      const colon = part.indexOf(":")
      if (colon === -1) continue
      declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, " "))
    }
    rules.push({ selectors: selectorText!.split(",").map((s) => s.trim().replace(/\s+/g, " ")), declarations })
  }
  return rules
}

/** The declarations of every rule that lists exactly `selector`, later ones winning. */
function declarationsFor(rules: Rule[], selector: string): Map<string, string> {
  const merged = new Map<string, string>()
  for (const rule of rules) {
    if (!rule.selectors.includes(selector)) continue
    for (const [prop, value] of rule.declarations) merged.set(prop, value)
  }
  return merged
}

const layout = rulesOf(readText(join(SRC_DIR, "styles/layout.css")))
const globalCss = rulesOf(readText(join(SRC_DIR, "styles/global.css")))
const SHELL_CONTROL = /\.shell-(?:button|triage-choice|triage-budget)\b/

describe("the parser reads what the checks need", () => {
  it("finds .gh-button and its primary", () => {
    expect(declarationsFor(layout, ".gh-button").get("font-size")).toBe("13px")
    expect(declarationsFor(layout, ".gh-button-primary").get("background")).toBe("var(--glow)")
  })
})

describe("the shell's controls look like the app's buttons", () => {
  it("every rule for a shell button or budget choice in layout.css is scoped under .gh-app", () => {
    const selectors = layout.flatMap((r) => r.selectors).filter((s) => SHELL_CONTROL.test(s))
    expect(selectors.length).toBeGreaterThan(0)
    expect(selectors.filter((s) => !s.startsWith(".gh-app "))).toEqual([])
  })

  it("shell buttons use .gh-button's font, size, spacing, case and corners", () => {
    const app = declarationsFor(layout, ".gh-button")
    const shell = declarationsFor(layout, ".gh-app .shell-button")
    for (const prop of ["font-family", "font-size", "letter-spacing", "text-transform", "border-radius", "padding"]) {
      expect(shell.get(prop), prop).toBe(app.get(prop))
    }
    expect(shell.get("font-family")).toMatch(/^"IBM Plex Mono"/)
    expect(shell.get("text-transform")).toBe("uppercase")
  })

  it("shell buttons keep 44 × 44 px tap targets", () => {
    const shell = declarationsFor(layout, ".gh-app .shell-button")
    expect(shell.get("min-inline-size")).toBe("44px")
    expect(shell.get("min-block-size")).toBe("44px")
  })

  it("only the shell's primary buttons are filled, exactly as .gh-button-primary", () => {
    const app = declarationsFor(layout, ".gh-button-primary")
    const primary = declarationsFor(layout, ".gh-app .shell-button-primary")
    for (const prop of ["background", "color", "border-color", "border-bottom"]) {
      expect(primary.get(prop), prop).toBe(app.get(prop))
    }
    // Plain and quiet shell buttons stay unfilled.
    expect(declarationsFor(layout, ".gh-app .shell-button").get("background")).toBe("transparent")
    const filledElsewhere = layout.filter(
      (r) =>
        r.declarations.get("background") === "var(--glow)" &&
        r.selectors.some((s) => s.startsWith(".gh-app ") && SHELL_CONTROL.test(s) && !s.includes("shell-button-primary"))
    )
    expect(filledElsewhere).toEqual([])
  })

  it("shell buttons keep the app's focus outline", () => {
    const appFocus = declarationsFor(globalCss, ":focus-visible")
    const shellFocus = declarationsFor(layout, ".gh-app .shell-button:focus-visible")
    expect(shellFocus.get("outline")).toBe("2px solid var(--sign)")
    expect(shellFocus.get("outline")).toBe(appFocus.get("outline"))
    expect(shellFocus.get("outline-offset")).toBe(appFocus.get("outline-offset"))
    // Nothing removes the outline from a shell control.
    const removed = layout.filter(
      (r) => r.selectors.some((s) => SHELL_CONTROL.test(s)) && /^(?:none|0)\b/.test(r.declarations.get("outline") ?? "")
    )
    expect(removed).toEqual([])
  })

  it("the budget choices are mono, uppercase, spaced, with 44px tap targets", () => {
    const choice = declarationsFor(layout, ".gh-app .shell-triage-choice")
    const app = declarationsFor(layout, ".gh-button")
    for (const prop of ["font-family", "font-size", "letter-spacing", "text-transform"]) {
      expect(choice.get(prop), prop).toBe(app.get(prop))
    }
    expect(choice.get("min-inline-size")).toBe("44px")
    expect(choice.get("min-block-size")).toBe("44px")
  })
})

describe("the rules reach the shell's real controls", () => {
  const shell = (file: string) => readText(join(REPO_DIR, "packages/shell/src/components", file))

  it("the time machine's jumps and Play, Triage's Plan, Start and choices, and the banner's button use these classes", () => {
    const timeMachine = shell("TimeMachine.tsx")
    expect(timeMachine).toContain('className="shell-button shell-button-quiet"')
    expect(timeMachine).toContain('className="shell-button shell-button-primary"')
    const triage = shell("TriagePanel.tsx")
    expect(triage).toContain('className="shell-button shell-button-primary"')
    expect(triage).toContain('className="shell-triage-choice"')
    expect(triage).toContain('className="shell-triage-budget"')
    expect(shell("PreviewBanner.tsx")).toContain('className="shell-button"')
  })
})
