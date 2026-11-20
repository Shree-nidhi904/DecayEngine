// Shell boundary from the Ghosted side (design section 3.5; Req 29.4): the
// shell's non-test sources contain no Ghosted word or colour name. The shell
// files are read as text, never imported. packages/shell/src/boundary.test.ts
// is not edited.
//
// Test files and test-fixtures.tsx are left out on purpose: shell test
// fixtures already use some of these words.

import { describe, expect, it } from "vitest"
import { join } from "node:path"
import { listFiles, matchingLines, readText, REPO_DIR } from "./test/source-files"

const SHELL_SRC = join(REPO_DIR, "packages", "shell", "src")

/** Design section 3.5, exactly. */
const GHOSTED_WORDS = [
  "Ghosted",
  "Still lit",
  "Fading",
  "Empty windows",
  "Reach out",
  "Reconnect",
  "flickering",
  "boarded",
  "meet-up",
  "meetup",
  "freshness",
  "glow",
  "flick",
  "rust",
  "mint",
] as const

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Whole word (or phrase), any case; the spaces in a phrase may be any whitespace. */
const wordPattern = (word: string) => new RegExp(`\\b${escapeRegExp(word).replace(/ /g, "\\s+")}\\b`, "i")

const isShellSource = (rel: string) =>
  /\.(ts|tsx|css)$/.test(rel) && !/\.test\.tsx?$/.test(rel) && !rel.endsWith("test-fixtures.tsx")

describe("shell boundary (Ghosted words)", () => {
  const files = listFiles(SHELL_SRC, isShellSource)

  it("reads the shell's non-test sources, and no test file", () => {
    for (const expected of ["index.ts", "types.ts", "shell.css", "components/TimeMachine.tsx", "components/TriagePanel.tsx", "components/AutopsyDialog.tsx"]) {
      expect(files).toContain(expected)
    }
    expect(files.filter((f) => /\.test\.tsx?$/.test(f) || f.endsWith("test-fixtures.tsx"))).toEqual([])
  })

  it("the word check catches a planted word in any case, and only whole words", () => {
    expect(wordPattern("Still lit").test("the still   LIT list")).toBe(true)
    expect(wordPattern("glow").test("color: var(--glow);")).toBe(true)
    expect(wordPattern("rust").test("trust the shell")).toBe(false)
    expect(wordPattern("flick").test("flicker")).toBe(false)
  })

  it("no non-test shell source contains a Ghosted word or colour name", () => {
    const found: string[] = []
    for (const file of files) {
      const text = readText(join(SHELL_SRC, file))
      for (const word of GHOSTED_WORDS) {
        for (const line of matchingLines(text, wordPattern(word))) found.push(`${file}:${line} "${word}"`)
      }
    }
    expect(found).toEqual([])
  })
})
