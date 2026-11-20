// The Ghosted steps in scripts/check.sh (task 2.10; Req 32.2, design section
// 8.3). The script is read as text, never run. It proves the three steps are
// there, run through `step` before the summary, and cannot be skipped
// silently: `step` turns any failing command into FAIL and failed=1, and the
// script exits with $failed.

import { describe, expect, it } from "vitest"
import { join } from "node:path"
import { readText, REPO_DIR } from "./test/source-files"

const script = readText(join(REPO_DIR, "scripts", "check.sh"))
const lines = script.split(/\r?\n/)
/** A line with runs of whitespace turned into one space, trimmed. */
const normal = (line: string) => line.trim().split(/\s+/).join(" ")
const indexOf = (wanted: string) => lines.findIndex((line) => normal(line) === wanted)

/** Design section 8.3, exactly (whitespace aside). */
const GHOSTED_STEPS = [
  'step "typecheck ghosted" pnpm --filter @decay-engine/ghosted typecheck',
  'step "test ghosted" pnpm --filter @decay-engine/ghosted test',
  'step "build ghosted" pnpm --filter @decay-engine/ghosted build',
]

describe("scripts/check.sh: the Ghosted steps", () => {
  it("has each Ghosted step once, called through step, as a line of its own", () => {
    for (const wanted of GHOSTED_STEPS) {
      expect(lines.filter((line) => normal(line) === wanted), wanted).toHaveLength(1)
    }
  })

  it("runs them in order after the existing steps and before the summary and the exit", () => {
    const buildApp = indexOf("step \"build app\" pnpm --filter @decay-engine/study-dungeon build")
    const ghosted = GHOSTED_STEPS.map(indexOf)
    const summary = indexOf('if [ "$failed" -eq 0 ]; then')
    const exit = indexOf('exit "$failed"')
    expect(buildApp).toBeGreaterThan(-1)
    expect(summary).toBeGreaterThan(-1)
    expect([buildApp, ...ghosted, summary, exit]).toEqual([...[buildApp, ...ghosted, summary, exit]].sort((a, b) => a - b))
    expect(new Set([buildApp, ...ghosted, summary, exit]).size).toBe(6)
  })

  it("keeps the engine-unchanged step right after install", () => {
    const install = indexOf('step "install" pnpm install')
    expect(install).toBeGreaterThan(-1)
    expect(normal(lines[install + 1]!)).toBe('step "engine unchanged" bash scripts/check-engine-unchanged.sh')
  })

  it("lets a failing step fail the script: step sets failed=1, and the script exits with it", () => {
    const stepStart = indexOf("step() {")
    const stepEnd = lines.findIndex((line, i) => i > stepStart && line.trim() === "}")
    expect(stepStart).toBeGreaterThan(-1)
    const body = lines.slice(stepStart, stepEnd).map(normal)
    expect(body).toContain('if "$@" >"$log" 2>&1; then')
    expect(body).toContain("failed=1")
    const lastLine = [...lines].reverse().find((line) => line.trim() !== "")
    expect(normal(lastLine!)).toBe('exit "$failed"')
  })

  it("weakens no step: no '|| true' and no 'set +e' anywhere in the script", () => {
    expect(script).not.toMatch(/\|\|\s*true\b/)
    expect(script).not.toMatch(/\bset\s+\+e\b/)
    for (const line of lines.filter((l) => normal(l).startsWith("step \""))) {
      expect(line, line).not.toMatch(/[|&;#]/)
    }
  })
})
