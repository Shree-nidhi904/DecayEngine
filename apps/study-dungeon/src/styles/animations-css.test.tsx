// @vitest-environment jsdom
// Tests for animations.css (tasks 17.1-17.3 and the visual pass, Pass 3).
// The rules are read from the CSS file and run against the real icons and
// art, so renaming a data attribute or a class breaks a test instead of
// silently stopping an animation.
//
// Rewritten for the visual pass by Claude Code (Opus 5.5), outside Kiro, at the developer's
// request; see .kiro/steering/authorship.md.

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { studyDungeonIcons } from "../components/icons"
import { Creature } from "../components/art/Creature"
import { Candle, Torch } from "../components/art/Scenery"

// Read from disk: Vitest blanks CSS imports (even ?raw), and jsdom replaces the
// global URL class, so fileURLToPath(new URL(...)) does not work here.
const css = readFileSync(join(import.meta.dirname, "animations.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

type Rule = { selectors: string[]; body: string }
type Block = { prelude: string; body: string }

/** Splits CSS into its top-level @-blocks and the text outside them. */
function blocks(source: string): { outside: string; blocks: Block[] } {
  const found: Block[] = []
  let outside = ""
  let i = 0
  while (i < source.length) {
    const at = source.indexOf("@", i)
    if (at === -1) {
      outside += source.slice(i)
      break
    }
    outside += source.slice(i, at)
    const open = source.indexOf("{", at)
    let depth = 1
    let j = open + 1
    while (depth > 0 && j < source.length) {
      if (source[j] === "{") depth++
      else if (source[j] === "}") depth--
      j++
    }
    found.push({ prelude: source.slice(at, open).trim(), body: source.slice(open + 1, j - 1) })
    i = j
  }
  return { outside, blocks: found }
}

/** Plain rules in a block body (no nesting). */
function rules(body: string): Rule[] {
  return [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1]!.split(",").map((s) => s.trim()),
    body: m[2]!,
  }))
}

const animationOf = (rule: Rule) => /(?:^|;)\s*animation\s*:\s*([^;]+)/.exec(rule.body)?.[1]?.trim()

const parsed = blocks(css)
const keyframes = parsed.blocks.filter((b) => b.prelude.startsWith("@keyframes")).map((b) => b.prelude.split(/\s+/)[1]!)
const motionBlocks = parsed.blocks.filter((b) => b.prelude === "@media (prefers-reduced-motion: no-preference)")
const reduceBlocks = parsed.blocks.filter((b) => b.prelude === "@media (prefers-reduced-motion: reduce)")
const motionRules = motionBlocks.flatMap((b) => rules(b.body))
const animated = motionRules.filter((r) => animationOf(r) !== undefined)

/** The selector without :hover / :focus-within / :focus-visible, so it can be matched in a static document. */
const staticSelector = (s: string) => s.replace(/:hover|:focus-within|:focus-visible/g, "")

/** Cards per state like FactCard's, with the real icons, a creature in each mood, torches and the candle. */
function renderWorld(): Document {
  const icon = (s: "alive" | "weak" | "dead") => renderToStaticMarkup(<>{studyDungeonIcons[s]}</>)
  const cards = (["alive", "weak", "dead"] as const)
    .map(
      (s) =>
        `<article class="shell-item-card" data-state="${s}"><p class="shell-state"><span class="shell-icon">${icon(s)}</span></p><button>act</button></article>`
    )
    .join("")
  const art = renderToStaticMarkup(
    <>
      <Creature kind="slime" mood="sleep" />
      <Creature kind="bat" mood="worried" />
      <Creature kind="imp" mood="feral" />
      <Torch />
      <Candle age={0.5} />
    </>
  )
  document.body.innerHTML = cards + art
  return document
}

describe("animations.css", () => {
  it("puts every animation and transition inside prefers-reduced-motion: no-preference", () => {
    expect(motionBlocks).toHaveLength(1)
    // Nothing outside an @-block, and no @media other than the two motion queries.
    expect(parsed.outside.trim()).toBe("")
    for (const b of parsed.blocks) {
      expect(b.prelude.startsWith("@keyframes") || motionBlocks.includes(b) || reduceBlocks.includes(b), b.prelude).toBe(true)
    }
  })

  it("every animation it uses is defined", () => {
    expect(animated.length).toBeGreaterThan(0)
    for (const rule of animated) {
      expect(keyframes, rule.selectors.join(", ")).toContain(animationOf(rule)!.split(/\s+/)[0])
    }
  })

  it("flickers the candle icon's flame and every torch and candle flame", () => {
    const doc = renderWorld()
    const flicker = animated.filter((r) => animationOf(r)!.startsWith("sd-flicker"))
    const matched = flicker.flatMap((r) => r.selectors.flatMap((s) => [...doc.querySelectorAll(staticSelector(s))]))
    // One candle icon (alive card), two torch flames, two candle flames.
    expect(matched).toHaveLength(5)
    const iconFlame = matched.find((el) => el.closest("svg")!.getAttribute("data-icon") === "candle")!
    expect(iconFlame.closest("article")!.getAttribute("data-state")).toBe("alive")
  })

  it("shakes the monster icon only on hover or focus, and only once", () => {
    const doc = renderWorld()
    const shake = animated.filter((r) => animationOf(r)!.startsWith("sd-shake"))
    expect(shake).toHaveLength(1)
    const { selectors } = shake[0]!
    expect(selectors.every((s) => s.includes(":hover") || s.includes(":focus-within"))).toBe(true)
    expect(selectors.some((s) => s.includes(":focus-within"))).toBe(true) // keyboard users see it too
    expect(animationOf(shake[0]!)!.split(/\s+/)).toContain("1")
    const matched = new Set(selectors.flatMap((s) => [...doc.querySelectorAll(staticSelector(s))]))
    expect([...matched].map((el) => el.getAttribute("data-icon"))).toEqual(["monster"])
  })

  it("moves each creature by its mood: sleep breathes, worried sways, feral shakes", () => {
    const doc = renderWorld()
    const animationFor = (mood: string) => {
      const group = doc.querySelector(`[data-mood="${mood}"] > g`)!
      const rule = animated.find((r) => r.selectors.some((s) => group.matches(staticSelector(s))))
      return animationOf(rule!)!.split(/\s+/)[0]
    }
    expect(animationFor("sleep")).toBe("sd-breathe")
    expect(animationFor("worried")).toBe("sd-sway")
    expect(animationFor("feral")).toBe("sd-feral")
  })

  it("leaves the tombstone icon still", () => {
    const doc = renderWorld()
    const tomb = doc.querySelector('[data-icon="tombstone"]')!
    for (const rule of animated) {
      for (const s of rule.selectors) {
        const hits = [...doc.querySelectorAll(staticSelector(s))]
        expect(hits.some((el) => el === tomb || tomb.contains(el))).toBe(false)
      }
    }
  })

  it("also stops every animation in its own reduced-motion block", () => {
    expect(reduceBlocks).toHaveLength(1)
    const stopped = rules(reduceBlocks[0]!.body)
      .filter((r) => animationOf(r) === "none")
      .flatMap((r) => r.selectors)
    for (const rule of animated) {
      for (const s of rule.selectors) expect(stopped, s).toContain(s)
    }
  })
})
