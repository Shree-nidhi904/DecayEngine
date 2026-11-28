// Motion (task 5.9; design section 5.3; Req 25.1, 25.2, 16.4, 7.2, 7.3, 12.3;
// steering ghosted.md section 3). Source checks: jsdom does not animate.
//
// - Every animation, transition, @keyframes and smooth scroll in the app's
//   CSS sits inside @media (prefers-reduced-motion: no-preference).
// - Each moving thing of Req 25.1 is declared there, and its still end state
//   is declared outside, so reduced motion shows it at once.
// - No JavaScript drives motion: no requestAnimationFrame, Element.animate,
//   smooth scrollIntoView, or timer in src/. The App's only timers are the
//   settle tick (ticking.ts) and the shell's Play (outside src/). The backup
//   download's one-second setTimeout, which only revokes the file's Blob URL
//   after the download starts, moves nothing and is allowed by name.

import { describe, expect, it } from "vitest"
import { join } from "node:path"
import { MOTION_DECLARATION, motionBlocks, outsideMotionBlocks } from "./test/css"
import { rulesOf, styleFiles, styleText } from "./test/css-rules"
import { listFiles, readText, SRC_DIR } from "./test/source-files"

const motionCss = styleText("motion.css")
const inside = motionBlocks(motionCss).join("\n")
const insideRules = rulesOf(inside, "motion.css")
const outsideRules = (file: string) => rulesOf(outsideMotionBlocks(styleText(file)), file)

/** The declarations of the rules for `selector` inside the motion block. */
function insideDecls(selector: string): string {
  const found = insideRules.filter((r) => r.selectors.includes(selector))
  expect(found.length, `motion.css has a rule for ${selector} inside the block`).toBeGreaterThan(0)
  return found.flatMap((r) => [...r.decls].map(([p, v]) => `${p}: ${v}`)).join("; ")
}

/** The declarations of the rules for `selector` outside any motion block in `file`. */
function outsideDecls(file: string, selector: string): string {
  const found = outsideRules(file).filter((r) => r.selectors.includes(selector))
  expect(found.length, `${file} has a rule for ${selector} outside the block`).toBeGreaterThan(0)
  return found.flatMap((r) => [...r.decls].map(([p, v]) => `${p}: ${v}`)).join("; ")
}

describe("the app's CSS (Req 25.1)", () => {
  it("declares no animation, transition, keyframes or smooth scrolling outside the reduced-motion block", () => {
    const files = styleFiles()
    expect(files).toEqual(expect.arrayContaining(["motion.css", "layout.css", "dock.css", "sign.css", "street.css", "window.css"]))
    const found = files.filter((file) => MOTION_DECLARATION.test(outsideMotionBlocks(styleText(file))))
    expect(found).toEqual([])
  })

  it("keeps all movement in motion.css, in one block", () => {
    expect(motionBlocks(motionCss)).toHaveLength(1)
    for (const file of styleFiles().filter((f) => f !== "motion.css")) {
      expect(motionBlocks(styleText(file)), file).toEqual([])
    }
  })

  it("the check finds a planted animation outside the block and lets one inside through", () => {
    expect(MOTION_DECLARATION.test(outsideMotionBlocks(".a { transition: opacity .2s }"))).toBe(true)
    expect(
      MOTION_DECLARATION.test(
        outsideMotionBlocks("@media (prefers-reduced-motion: no-preference) { .a { animation: x 1s } @keyframes x { to { opacity: 0 } } }")
      )
    ).toBe(false)
    expect(MOTION_DECLARATION.test("html { scroll-behavior: smooth }")).toBe(true)
  })
})

describe("each moving thing of Req 25.1, inside the block, with its still state outside", () => {
  it("window flicker on weak panes (Req 16.4)", () => {
    expect(insideDecls('.gh-pane[data-state="weak"]')).toMatch(/animation: gh-flicker /)
  })

  it("the pane's light change", () => {
    expect(insideDecls(".gh-pane")).toMatch(/transition: background [\d.]+s, box-shadow [\d.]+s/)
  })

  it("boards falling and the relight flash; falling boards are simply gone without motion (Req 14.4, 25.2)", () => {
    expect(insideDecls('.gh-pane[data-boards="falling"] .gh-board')).toMatch(/animation: gh-boards-fall /)
    expect(insideDecls(".gh-pane[data-relight]")).toMatch(/animation: gh-relight /)
    expect(outsideDecls("motion.css", '.gh-pane[data-boards="falling"] .gh-boards')).toMatch(/display: none/)
  })

  it("the sign's hum; its glow is static, so under reduced motion the sign is steady and still lit (Req 7.2, 7.3)", () => {
    expect(insideDecls(".gh-sign")).toMatch(/animation: gh-sign /)
    expect(outsideDecls("sign.css", ".gh-sign")).toMatch(/text-shadow: .*var\(--sign\)/)
  })

  it("the splash's six windows lighting up", () => {
    expect(insideDecls(".gh-splash-windows .gh-pane")).toMatch(/animation: gh-lightup /)
    for (let n = 1; n <= 6; n++) {
      expect(insideDecls(`.gh-splash-windows .gh-pane:nth-child(${n})`)).toMatch(/animation-delay: [\d.]+s/)
    }
  })

  it("moths and headlights, hidden without motion; fog, still without motion", () => {
    expect(insideDecls(".gh-moths i")).toMatch(/animation: gh-moth /)
    expect(outsideDecls("street.css", ".gh-moths")).toMatch(/display: none/)
    expect(insideDecls(".gh-street-scene .gh-headlights")).toMatch(/animation: gh-headlights /)
    expect(outsideDecls("street.css", ".gh-headlights")).toMatch(/display: none/)
    expect(insideDecls(".gh-fog")).toMatch(/animation: gh-fog /)
    expect(outsideDecls("street.css", ".gh-fog")).not.toMatch(/animation/)
  })

  it("the moon's movement; its place is set from --age outside the block (Req 12.3)", () => {
    expect(insideDecls(".gh-moon-shade")).toMatch(/transition: transform /)
    expect(outsideDecls("dock.css", ".gh-moon-shade")).toMatch(/transform: translateX\(calc\(60px - var\(--age\) \* 52px\)\)/)
  })

  it("smooth scrolling", () => {
    expect(insideDecls("html")).toMatch(/scroll-behavior: smooth/)
  })

  it("every keyframes used inside the block is defined inside it", () => {
    const used = new Set([...inside.matchAll(/animation:\s*(gh-[a-z-]+)/g)].map((m) => m[1]!))
    const defined = new Set([...inside.matchAll(/@keyframes\s+(gh-[a-z-]+)/g)].map((m) => m[1]!))
    expect([...used].filter((name) => !defined.has(name))).toEqual([])
    // flicker, boards falling, relight, moths, fog, headlights, sign hum, splash light-up.
    expect(used.size).toBeGreaterThanOrEqual(8)
  })
})

describe("no JavaScript motion in src/ (Req 25.1, design section 5.3)", () => {
  const sources = listFiles(SRC_DIR, (rel) => /\.(ts|tsx)$/.test(rel) && !/\.test\.tsx?$/.test(rel) && !rel.startsWith("test/"))

  /** The code without comments (a "//" after a ":" is kept, as in a URL). */
  const code = (rel: string) =>
    readText(join(SRC_DIR, rel))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")

  const FRAME = /\b(?:requestAnimationFrame|requestIdleCallback)\s*\(|\.animate\s*\(/
  const SMOOTH = /behavior\s*:\s*["']smooth["']/
  const TIMER = /\b(?:setTimeout|setInterval)\s*\(/g

  /** The backup download's URL clean-up: the one timer allowed outside ticking.ts. */
  const REVOKE_TIMER = /setTimeout\(\s*\(\)\s*=>\s*URL\.revokeObjectURL\(url\),\s*1000\s*\)/

  it("reads the app's sources", () => {
    expect(sources).toEqual(expect.arrayContaining(["App.tsx", "ticking.ts", "components/BackupControls.tsx"]))
  })

  it("no requestAnimationFrame, Element.animate or smooth scrollIntoView anywhere", () => {
    expect(sources.filter((rel) => FRAME.test(code(rel)) || SMOOTH.test(code(rel)))).toEqual([])
  })

  /** The corner toast's closing timer (feedback list, point 18): one setTimeout that is cleared on unmount. */
  const TOAST_TIMER = /const id = setTimeout\(run, ms\)\s*return \(\) => clearTimeout\(id\)/

  it("no timer outside the settle tick, except the backup download's URL clean-up and the toast's closing timer", () => {
    const found: string[] = []
    for (const rel of sources) {
      if (rel === "ticking.ts") continue
      const text = code(rel)
      const timers = [...text.matchAll(TIMER)].length
      if (rel === "components/BackupControls.tsx") {
        expect(timers, rel).toBe(1)
        expect(text, rel).toMatch(REVOKE_TIMER)
        continue
      }
      if (rel === "components/Toast.tsx") {
        expect(timers, rel).toBe(1)
        expect(text, rel).toMatch(TOAST_TIMER)
        continue
      }
      if (timers > 0) found.push(`${rel}: ${timers}`)
    }
    expect(found).toEqual([])
  })

  it("the settle tick uses setInterval only", () => {
    const text = code("ticking.ts")
    expect(text).toMatch(/\bTICK_INTERVAL_MS = 60_000\b/)
    expect(text).not.toMatch(/\bsetTimeout\s*\(/)
    expect(text).not.toMatch(FRAME)
  })

  it("the checks catch what they look for", () => {
    expect(FRAME.test("requestAnimationFrame(step)")).toBe(true)
    expect(FRAME.test("el.animate([{ opacity: 0 }], 300)")).toBe(true)
    expect(SMOOTH.test('el.scrollIntoView({ behavior: "smooth" })')).toBe(true)
    expect([..."setTimeout(() => step(), 16)".matchAll(TIMER)]).toHaveLength(1)
    expect(REVOKE_TIMER.test("setTimeout(() => URL.revokeObjectURL(url), 1000)")).toBe(true)
  })
})
