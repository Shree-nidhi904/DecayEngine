// Insight boundary (design section 7.6), on the model of the shell's
// boundary.test.ts: reads every source file in packages/insight/src and
// fails if the package imports an app, the shell or a path into the engine,
// reads the clock or uses randomness, or if a library file holds arithmetic
// that could copy a policy's maths (no `Math.`, no `**`).

import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const SRC = fileURLToPath(new URL(".", import.meta.url))
const THIS_FILE = "boundary.test.ts"

const LIBRARY_FILES = ["index.ts", "types.ts", "death-time.ts", "internal.ts", "replay.ts", "what-if.ts"]
const ALLOWED_BARE_IN_TESTS = ["@decay-engine/engine", "vitest", "fast-check"]

const files = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .map((f) => f.replace(/\\/g, "/"))
  .filter((f) => /\.ts$/.test(f))
  .filter((f) => f !== THIS_FILE)
  .map((f) => ({ name: f, text: readFileSync(join(SRC, f), "utf8") }))

const libraryFiles = files.filter((f) => LIBRARY_FILES.includes(f.name))

function importSpecifiers(text: string): string[] {
  return [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)].map((m) => m[1]!)
}

// Block comments and whole-line // comments, so JSDoc openers and prose do not count.
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

/** The first maths token in the code (not in comments), or null. */
function findMaths(text: string): string | null {
  const code = stripComments(text)
  return code.match(/\bMath\./)?.[0] ?? code.match(/\*\*/)?.[0] ?? null
}

const CLOCK_OR_RANDOM = /\bDate\.now\b|\bnew\s+Date\s*\(|\bperformance\.now\b|\bMath\.random\b|\bcrypto\b/

describe("insight boundary", () => {
  it("finds the library files", () => {
    expect(files.map((f) => f.name)).toEqual(expect.arrayContaining(LIBRARY_FILES))
    expect(libraryFiles).toHaveLength(LIBRARY_FILES.length)
  })

  it("never imports an app, the shell, another workspace package or a path into the engine", () => {
    for (const { name, text } of files) {
      for (const spec of importSpecifiers(text)) {
        expect(spec, `${name} imports ${spec}`).not.toMatch(/(^|\/)apps\//)
        expect(spec, `${name} imports ${spec}`).not.toMatch(/packages\/(engine|shell)/)
        expect(spec, `${name} imports ${spec}`).not.toMatch(/^react(-dom)?(\/|$)/)
        if (spec.startsWith("@decay-engine/")) {
          expect(spec, `${name} imports ${spec}`).toBe("@decay-engine/engine")
        }
        if (spec.startsWith(".")) {
          const target = resolve(dirname(join(SRC, name)), spec)
          expect(target.startsWith(SRC) || target + sep === SRC, `${name} imports ${spec} outside src`).toBe(true)
        } else {
          expect(ALLOWED_BARE_IN_TESTS, `${name} imports ${spec}`).toContain(spec)
        }
      }
    }
  })

  it("library files import only the engine and other library files", () => {
    for (const { name, text } of libraryFiles) {
      for (const spec of importSpecifiers(text)) {
        if (spec.startsWith(".")) {
          expect(spec, `${name} imports ${spec}`).toMatch(/^\.\/[a-z-]+$/)
        } else {
          expect(spec, `${name} imports ${spec}`).toBe("@decay-engine/engine")
        }
      }
    }
  })

  it("never reads the clock or uses randomness, tests included", () => {
    for (const { name, text } of files) {
      expect(text.match(CLOCK_OR_RANDOM)?.[0], `${name} reads the clock or uses randomness`).toBeUndefined()
    }
  })

  it("library files contain no `Math.` and no `**`, so no decay formula can be copied in", () => {
    for (const { name, text } of libraryFiles) {
      expect(findMaths(text), `${name} contains maths`).toBeNull()
    }
  })

  it("the maths check finds `Math.` and `**` in code and ignores comments", () => {
    expect(findMaths("const x = 2 ** 3")).toBe("**")
    expect(findMaths("const y = Math.pow(2, 3)")).toBe("Math.")
    expect(findMaths("const z = Math.max(0, h)")).toBe("Math.")
    expect(findMaths("/** Doc. */\n// Math.max in a line comment\n/* 2 ** 3 */\nconst w = 1")).toBeNull()
  })
})
