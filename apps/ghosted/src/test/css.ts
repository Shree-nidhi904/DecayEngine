// Helpers for the CSS source checks: jsdom cannot lay out or animate, so the
// rules about motion, widths and tap targets are checked in the CSS text.
// Files are read, never imported.

import { join } from "node:path"
import { readText, SRC_DIR } from "./source-files"

/** The text of `styles/<name>` under apps/ghosted/src. */
export function readStyle(name: string): string {
  return readText(join(SRC_DIR, "styles", name))
}

/** CSS with every comment removed. */
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "")
}

const MOTION_QUERY = /@media\s*\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)\s*\{/g

/** The bodies of every @media (prefers-reduced-motion: no-preference) block. */
export function motionBlocks(css: string): string[] {
  return splitMotion(stripComments(css)).inside
}

/** The CSS with every @media (prefers-reduced-motion: no-preference) block cut out. */
export function outsideMotionBlocks(css: string): string {
  return splitMotion(stripComments(css)).outside
}

function splitMotion(css: string): { inside: string[]; outside: string } {
  const inside: string[] = []
  let outside = ""
  let from = 0
  for (const match of css.matchAll(MOTION_QUERY)) {
    const start = match.index!
    const open = start + match[0].length
    let depth = 1
    let i = open
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++
      else if (css[i] === "}") depth--
      i++
    }
    if (depth !== 0) throw new Error("unbalanced braces in a reduced-motion block")
    outside += css.slice(from, start)
    inside.push(css.slice(open, i - 1))
    from = i
  }
  outside += css.slice(from)
  return { inside, outside }
}

/** Declarations that move things: animation, transition, keyframes, smooth scrolling. */
export const MOTION_DECLARATION = /(?:^|[\s;{])(?:animation(?:-[a-z-]+)?|transition(?:-[a-z-]+)?)\s*:|@keyframes|scroll-behavior\s*:\s*smooth/

/** The body of the first rule whose selector list is exactly `selector` (comments removed). */
export function ruleBody(css: string, selector: string): string | undefined {
  const clean = stripComments(css)
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`).exec(clean)
  return match?.[1]
}

/**
 * Every px value that sets a width or a minimum width: width, inline-size,
 * their min- forms, flex-basis, flex and grid minmax() minimums. max- forms
 * are left out: a maximum never makes the page wider.
 */
export function widthPixels(css: string): { text: string; px: number }[] {
  const clean = stripComments(css)
  const found: { text: string; px: number }[] = []
  const property =
    /(?<![\w-])(?:min-)?(?:width|inline-size)\s*:\s*([^;}]+)|(?<![\w-])flex-basis\s*:\s*([^;}]+)|(?<![\w-])flex\s*:\s*([^;}]+)|minmax\(\s*([^,]+),/g
  for (const m of clean.matchAll(property)) {
    const value = m[1] ?? m[2] ?? m[3] ?? m[4] ?? ""
    for (const px of value.matchAll(/(\d+(?:\.\d+)?)px/g)) {
      // A px value inside min(100%, …) can never be wider than its container.
      if (/min\(\s*100%/.test(value)) continue
      found.push({ text: m[0].trim(), px: Number(px[1]) })
    }
  }
  return found
}
