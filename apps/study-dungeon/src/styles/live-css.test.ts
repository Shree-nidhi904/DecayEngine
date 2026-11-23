// live.css (task L3, Requirement 23.2, 23.4, 23.5, 23.8, design "Live State
// Changes"). jsdom cannot lay out or animate, so the rules are checked in
// the CSS text; the browser check at 320, 390 and 1280px (task 25.6)
// confirms them on screen. The file is read, never imported.

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const css = readFileSync(fileURLToPath(new URL("./live.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

const MOTION_OPEN = "@media (prefers-reduced-motion: no-preference) {"

/** The text inside the one no-preference block, and everything outside it. */
function split(text: string): { inside: string; outside: string } {
  const start = text.indexOf(MOTION_OPEN)
  expect(start, "live.css has a no-preference block").toBeGreaterThan(-1)
  let depth = 1
  let i = start + MOTION_OPEN.length
  while (i < text.length && depth > 0) {
    if (text[i] === "{") depth++
    else if (text[i] === "}") depth--
    i++
  }
  return { inside: text.slice(start + MOTION_OPEN.length, i - 1), outside: text.slice(0, start) + text.slice(i) }
}

/** The declarations of the first rule whose selector list is exactly `selector`. */
function decls(text: string, selector: string): Map<string, string> {
  for (const [, selectors, body] of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors!.split(",").map((s) => s.replace(/\s+/g, " ").trim()).includes(selector)) {
      const map = new Map<string, string>()
      for (const part of body!.split(";")) {
        const colon = part.indexOf(":")
        if (colon > 0) map.set(part.slice(0, colon).trim(), part.slice(colon + 1).replace(/\s+/g, " ").trim())
      }
      return map
    }
  }
  throw new Error(`no rule for ${selector}`)
}

const { inside, outside } = split(css)

describe("motion (Requirement 23.2, 23.4)", () => {
  it("has exactly one no-preference block, and no animation or transition outside it", () => {
    expect(css.split(MOTION_OPEN)).toHaveLength(2)
    expect(outside).not.toMatch(/\b(animation|transition)\s*:/)
    expect(outside).not.toMatch(/@keyframes/)
  })

  it("the creature wakes and the stone drops once, only inside the block", () => {
    expect(decls(inside, ".sd-card.sd-just-changed .sd-card-top > :first-child").get("animation")).toMatch(/^sd-wake [\d.]+s ease-out 1$/)
    expect(decls(inside, ".sd-card.sd-grave.sd-just-changed > :first-child").get("animation")).toMatch(
      /^sd-grave-drop [\d.]+s ease-out 1$/
    )
    expect(inside).toMatch(/@keyframes sd-wake/)
    expect(inside).toMatch(/@keyframes sd-grave-drop/)
    // The marker class has no look of its own outside the block.
    expect(outside).not.toMatch(/sd-just-changed/)
  })

  it("the toast fades in and out inside the block", () => {
    expect(decls(inside, ".sd-toast").get("animation")).toMatch(/^sd-toast-life [\d.]+s forwards$/)
    expect(inside).toMatch(/@keyframes sd-toast-life/)
  })
})

describe("the toast's place and size (Requirement 23.4, 23.8)", () => {
  it("8px above the dock's bar, at most as wide as the dock's content, wrapping, and clickable inside the dock", () => {
    const toast = decls(outside, ".sd-toast")
    expect(toast.get("margin-block")).toBe("0 8px")
    expect(toast.get("max-inline-size")).toBe("100%")
    expect(toast.get("inline-size")).toBe("fit-content")
    expect(toast.get("flex-wrap")).toBe("wrap")
    expect(toast.get("pointer-events")).toBe("auto")
  })

  it("is never hidden by any rule, and has no fixed width in px", () => {
    expect(css).not.toMatch(/\.sd-toast[^{]*\{[^}]*\b(display\s*:\s*none|visibility\s*:\s*hidden)/)
    expect(css).not.toMatch(/(?:^|[\s;{])(?:inline-size|width|min-inline-size|min-width)\s*:\s*(?:[3-9]\d{2}|\d{4,})px/)
    // No narrow-width media block that could hide or shrink it.
    expect(css).not.toMatch(/@media\s*\(\s*max-width/)
  })

  it("the Dismiss button is at least 44 × 44px and never filled", () => {
    const dismiss = decls(outside, ".sd-toast-dismiss")
    expect(dismiss.get("min-inline-size")).toBe("44px")
    expect(dismiss.get("min-block-size")).toBe("44px")
    expect(dismiss.has("background")).toBe(false)
  })
})

describe("the live region's copy of the words (Requirement 23.5)", () => {
  it(".sd-visually-hidden clips the text without removing it from screen readers", () => {
    const hidden = decls(outside, ".sd-visually-hidden")
    expect(hidden.get("position")).toBe("absolute")
    expect(hidden.get("inline-size")).toBe("1px")
    expect(hidden.get("block-size")).toBe("1px")
    expect(hidden.get("overflow")).toBe("hidden")
    expect(hidden.get("clip-path")).toBe("inset(50%)")
    expect(hidden.has("display")).toBe(false)
    expect(hidden.has("visibility")).toBe(false)
  })
})
