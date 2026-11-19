// Reduced motion (task 16.2) and the visuals' wiring (tasks 17.1-17.3).
//
// CSS motion is covered by animations.css and global.css, which both switch
// off under prefers-reduced-motion (their own tests check that). This file
// reads the TypeScript sources of the app and the shell and checks that the
// time machine's Play is the only animation driven from JS: the only
// requestAnimationFrame, no Element.animate, no smooth scrolling, and no
// interval timer apart from the once-a-minute settle tick. TimeMachine's own tests
// check that Play jumps straight to +60 days under reduced motion.

import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

const repo = fileURLToPath(new URL("../../../", import.meta.url))
const roots = ["apps/study-dungeon/src", "packages/shell/src"]

/** Every non-test .ts and .tsx file under the roots, as repo-relative paths. */
function sources(): string[] {
  const out: string[] = []
  for (const root of roots) {
    for (const entry of readdirSync(join(repo, root), { recursive: true })) {
      const path = String(entry).replaceAll("\\", "/")
      if (!/\.(ts|tsx)$/.test(path)) continue
      if (/\.test\.(ts|tsx)$/.test(path) || path.startsWith("test/") || path.includes("/test/")) continue
      out.push(`${root}/${path}`)
    }
  }
  return out.sort()
}

/** The files whose code (comments removed) matches the pattern. */
function filesMatching(pattern: RegExp): string[] {
  return sources().filter((file) => {
    const code = readFileSync(join(repo, file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
    return pattern.test(code)
  })
}

describe("the only animation in JS is the time machine's Play", () => {
  it("finds the sources it scans", () => {
    const files = sources()
    expect(files).toContain("apps/study-dungeon/src/App.tsx")
    expect(files).toContain("packages/shell/src/components/TimeMachine.tsx")
    expect(files.some((f) => f.endsWith(".test.ts") || f.endsWith(".test.tsx"))).toBe(false)
  })

  it("requestAnimationFrame is used only by TimeMachine", () => {
    expect(filesMatching(/requestAnimationFrame/)).toEqual(["packages/shell/src/components/TimeMachine.tsx"])
  })

  it("nothing calls Element.animate or scrolls smoothly", () => {
    expect(filesMatching(/\.animate\(/)).toEqual([])
    expect(filesMatching(/["']smooth["']/)).toEqual([])
  })

  it("the only interval timer is the settle tick, which moves nothing on screen", () => {
    expect(filesMatching(/\bsetInterval\b/)).toEqual(["apps/study-dungeon/src/ticking.ts"])
  })
})

describe("the visuals are wired in", () => {
  const app = readFileSync(join(repo, "apps/study-dungeon/src/App.tsx"), "utf8")

  it("App imports animations.css and layout.css (layout last, after the component styles)", () => {
    const imports = [...app.matchAll(/^import\s+"(\.\/styles\/[^"]+\.css)"/gm)].map((m) => m[1])
    expect(imports).toContain("./styles/animations.css")
    expect(imports[imports.length - 1]).toBe("./styles/layout.css")
  })

  it("main.tsx renders Root with createEngine, so the engine is built inside the error handling", () => {
    const main = readFileSync(join(repo, "apps/study-dungeon/src/main.tsx"), "utf8")
    expect(main).toMatch(/<Root\s+createEngine=\{createEngine\}/)
    expect(main).not.toMatch(/import\s*\{\s*engine\s*\}/)
  })
})
