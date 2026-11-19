// @vitest-environment jsdom
// Tests for animations.css (tasks 17.1-17.3, Requirement 15.3 and 15.5).
// The selectors are read from the CSS file and run against the real icons
// rendered inside a card, so renaming a data-icon attribute or changing the
// candle's SVG breaks a test instead of silently stopping the animation.
//
// Written by Claude Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { studyDungeonIcons } from "../components/icons"

// Read from disk: Vitest blanks CSS imports (even ?raw), and jsdom replaces the
// global URL class, so fileURLToPath(new URL(...)) does not work here.
const css = readFileSync(join(import.meta.dirname, "animations.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

/** The CSS with the reduced-motion block taken out, and that block alone. */
function splitReducedMotion(source: string): { outside: string; reduced: string } {
  const start = source.indexOf("@media (prefers-reduced-motion: reduce)")
  if (start === -1) return { outside: source, reduced: "" }
  let depth = 0
  let end = start
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++
    if (source[i] === "}") depth--
    if (depth === 0) {
      end = i + 1
      break
    }
  }
  return { outside: source.slice(0, start) + source.slice(end), reduced: source.slice(start, end) }
}

/** Top-level style rules (not @keyframes) that set an animation: selectors and the animation value. */
function animatedRules(source: string): Array<{ selectors: string[]; animation: string }> {
  const withoutKeyframes = source.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "")
  const rules: Array<{ selectors: string[]; animation: string }> = []
  for (const m of withoutKeyframes.matchAll(/(?<=^|\})\s*([^{}@]+?)\s*\{([^{}]*)\}/g)) {
    const anim = /(?:^|;)\s*animation\s*:\s*([^;]+)/.exec(m[2]!)
    if (anim) rules.push({ selectors: m[1]!.split(",").map((s) => s.trim()), animation: anim[1]!.trim() })
  }
  return rules
}

const { outside, reduced } = splitReducedMotion(css)
const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]!)

/** A card per state, shaped like the shell's ItemCard, holding the app's real icons. */
function renderCards(): Document {
  const icon = (state: "alive" | "weak" | "dead") => renderToStaticMarkup(<>{studyDungeonIcons[state]}</>)
  document.body.innerHTML = (["alive", "weak", "dead"] as const)
    .map(
      (s) =>
        `<article class="shell-item-card" data-state="${s}"><p class="shell-state"><span class="shell-icon">${icon(s)}</span></p><button>act</button></article>`
    )
    .join("")
  return document
}

/** The selector without :hover / :focus-within, so it can be matched in a static document. */
const staticSelector = (s: string) => s.replace(/:hover|:focus-within/g, "")

describe("animations.css", () => {
  it("defines a flicker and a shake, and every animation it uses is defined", () => {
    expect(keyframes.sort()).toEqual(["sd-flicker", "sd-shake"])
    for (const rule of animatedRules(outside)) {
      const name = rule.animation.split(/\s+/)[0]!
      expect(keyframes).toContain(name)
    }
  })

  it("animates the candle's flame (and nothing else on an alive card)", () => {
    const doc = renderCards()
    const flicker = animatedRules(outside).filter((r) => r.animation.startsWith("sd-flicker"))
    expect(flicker).toHaveLength(1)
    const matched = flicker[0]!.selectors.flatMap((s) => [...doc.querySelectorAll(staticSelector(s))])
    expect(matched).toHaveLength(1)
    const flame = matched[0]!
    // The flame is the first child of the candle icon, and it is a filled path.
    expect(flame.tagName.toLowerCase()).toBe("path")
    expect(flame.closest("svg")!.getAttribute("data-icon")).toBe("candle")
    expect(flame.getAttribute("fill")).toBe("currentColor")
    expect(flame.closest("article")!.getAttribute("data-state")).toBe("alive")
  })

  it("shakes the monster only on hover or focus, and only once", () => {
    const doc = renderCards()
    const shake = animatedRules(outside).filter((r) => r.animation.startsWith("sd-shake"))
    expect(shake).toHaveLength(1)
    const { selectors, animation } = shake[0]!
    expect(selectors.every((s) => s.includes(":hover") || s.includes(":focus-within"))).toBe(true)
    expect(selectors.some((s) => s.includes(":focus-within"))).toBe(true) // keyboard users see it too
    expect(animation.split(/\s+/)).toContain("1") // one shake, not forever
    const matched = new Set(selectors.flatMap((s) => [...doc.querySelectorAll(staticSelector(s))]))
    expect(matched.size).toBe(1)
    const monster = [...matched][0]!
    expect(monster.getAttribute("data-icon")).toBe("monster")
    expect(monster.closest("article")!.getAttribute("data-state")).toBe("weak")
  })

  it("leaves the tombstone still", () => {
    const doc = renderCards()
    const tomb = doc.querySelector('[data-icon="tombstone"]')!
    expect(tomb).not.toBeNull()
    for (const rule of animatedRules(outside)) {
      for (const s of rule.selectors) {
        const hits = [...doc.querySelectorAll(staticSelector(s))]
        expect(hits.some((el) => el === tomb || tomb.contains(el))).toBe(false)
      }
    }
  })

  it("turns off every animation under prefers-reduced-motion", () => {
    expect(reduced).not.toBe("")
    const animatedSelectors = animatedRules(outside).flatMap((r) => r.selectors)
    const stopped = animatedRules(reduced.slice(reduced.indexOf("{") + 1, reduced.lastIndexOf("}")))
    const stoppedSelectors = stopped.filter((r) => r.animation === "none").flatMap((r) => r.selectors)
    expect(stoppedSelectors.sort()).toEqual(animatedSelectors.sort())
  })
})
