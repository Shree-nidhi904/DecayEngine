// The app's CSS as a list of rules, for the source checks (tasks 5.8 and
// 5.9): jsdom cannot lay out, so contrast, tap targets and layout are checked
// in the CSS text. Files are read, never imported.
//
// A rule inside @media or @container is listed like any other, after the
// rules before it, so "the first rule for a selector" is the base rule.

import { join } from "node:path"
import { stripComments } from "./css"
import { listFiles, readText, SRC_DIR } from "./source-files"

export const STYLES_DIR = join(SRC_DIR, "styles")

export type CssRule = {
  /** The file under src/styles. */
  file: string
  /** Each selector of the rule's list, whitespace collapsed. */
  selectors: string[]
  /** Property → value, as written (the last one wins). */
  decls: Map<string, string>
}

/** Every .css file under src/styles, as paths relative to it. */
export function styleFiles(): string[] {
  return listFiles(STYLES_DIR, (rel) => rel.endsWith(".css"))
}

/** A style file's text with comments removed. */
export function styleText(file: string): string {
  return stripComments(readText(join(STYLES_DIR, file)))
}

/** The rules of one CSS text. Keyframe steps are listed too (their selectors are percentages). */
export function rulesOf(css: string, file = ""): CssRule[] {
  const rules: CssRule[] = []
  for (const [, selectorList, body] of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = selectorList!.split(",").map((s) => s.replace(/\s+/g, " ").trim())
    const decls = new Map<string, string>()
    for (const part of body!.split(";")) {
      const colon = part.indexOf(":")
      if (colon > 0) decls.set(part.slice(0, colon).trim(), part.slice(colon + 1).replace(/\s+/g, " ").trim())
    }
    rules.push({ file, selectors, decls })
  }
  return rules
}

/** Every rule in every style file. */
export function allRules(): CssRule[] {
  return styleFiles().flatMap((file) => rulesOf(styleText(file), file))
}

/** The first rule in `file` whose selector list includes `selector`; throws when there is none. */
export function firstRule(rules: readonly CssRule[], file: string, selector: string): CssRule {
  const found = rules.find((r) => r.file === file && r.selectors.includes(selector))
  if (found === undefined) throw new Error(`${file} has no rule for ${selector}`)
  return found
}

/** The token name in a value that is exactly var(--name), or undefined. */
export function varName(value: string | undefined): string | undefined {
  return /^var\(--([a-z0-9-]+)\)$/.exec(value ?? "")?.[1]
}

/** The px number of a value such as "44px", or NaN. */
export function px(value: string | undefined): number {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value ?? "")
  return match === null ? Number.NaN : Number(match[1])
}
