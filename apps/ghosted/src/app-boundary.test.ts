// App boundary (task 2.9; Req 21.1, testing.md, steering ghosted.md section 5):
// - no Ghosted source imports anything from the Study Dungeon app;
// - no Ghosted test file reads the real clock: no clock "now" call, no
//   argument-less Date construction, no fake timers seeded from the real time.
// Files are read as text, never imported. Every pattern is built from pieces,
// so this file never matches its own checks.

import { describe, expect, it } from "vitest"
import { join } from "node:path"
import { listFiles, matchingLines, readText, SRC_DIR } from "./test/source-files"

const D = "Date"
const OTHER_APP = "study" + "-dungeon"

/** A call of the clock's now. */
const clockNow = new RegExp(`\\b${D}\\s*\\.\\s*now\\s*\\(`)
/** A Date built with no argument: the current time. */
const argumentlessDate = new RegExp(`\\bnew\\s+${D}\\s*\\(\\s*\\)`)
/** A fake-timers call; its argument is checked for a fixed `now`. */
const fakeTimers = new RegExp(`\\buse${"Fake"}Timers\\s*\\(([^)]*)\\)?`)
/** The module specifier of an import, an export-from, a dynamic import or a require. */
const specifier = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/g

/** Fake timers count as seeded from the real time unless the call passes a `now` option. */
const realTimeFakeTimers = (line: string) => {
  const match = fakeTimers.exec(line)
  return match !== null && !/\bnow\s*:/.test(match[1] ?? "")
}

const importsOtherApp = (text: string) => [...text.matchAll(specifier)].some((m) => m[1]!.includes(OTHER_APP))

const isTestFile = (rel: string) => /\.test\.tsx?$/.test(rel) || rel.startsWith("test/")

describe("the checks catch what they look for", () => {
  it("planted clock reads are found, and fixed times are not", () => {
    expect(clockNow.test(`const t = ${D}.now()`)).toBe(true)
    expect(argumentlessDate.test(`const d = new ${D}()`)).toBe(true)
    expect(argumentlessDate.test(`const d = new ${D}(T0)`)).toBe(false)
    expect(realTimeFakeTimers(`vi.use${"Fake"}Timers()`)).toBe(true)
    expect(realTimeFakeTimers(`vi.use${"Fake"}Timers({ now: T0 })`)).toBe(false)
  })

  it("a planted import from the other app is found, and a comment naming it is not", () => {
    expect(importsOtherApp(`import { x } from "../../${OTHER_APP}/src/x"`)).toBe(true)
    expect(importsOtherApp(`export * from "@decay-engine/${OTHER_APP}"`)).toBe(true)
    expect(importsOtherApp(`const m = await import("../${OTHER_APP}/a")`)).toBe(true)
    expect(importsOtherApp(`// Copied from apps/${OTHER_APP}/src/Root.tsx`)).toBe(false)
  })
})

describe("app boundary", () => {
  const sources = listFiles(SRC_DIR, (rel) => /\.(ts|tsx)$/.test(rel))
  const tests = sources.filter(isTestFile)

  it("finds the app's sources and tests", () => {
    expect(sources).toContain("App.tsx")
    expect(tests).toContain("app-boundary.test.ts")
    expect(tests).toContain("test/fixtures.ts")
  })

  it("no Ghosted source imports from the Study Dungeon app (Req 21.1)", () => {
    expect(sources.filter((rel) => importsOtherApp(readText(join(SRC_DIR, rel))))).toEqual([])
  })

  it("no Ghosted test file reads the real clock", () => {
    const found: string[] = []
    for (const rel of tests) {
      const text = readText(join(SRC_DIR, rel))
      for (const line of matchingLines(text, clockNow)) found.push(`${rel}:${line} clock now`)
      for (const line of matchingLines(text, argumentlessDate)) found.push(`${rel}:${line} Date with no argument`)
      text.split(/\r?\n/).forEach((line, index) => {
        if (realTimeFakeTimers(line)) found.push(`${rel}:${index + 1} fake timers without a fixed now`)
      })
    }
    expect(found).toEqual([])
  })
})
