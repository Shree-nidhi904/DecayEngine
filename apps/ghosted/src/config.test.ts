// Package and build configuration (task 2.9; Req 30.2, 32.1, 32.3, 32.4).
// The files are read as text, never imported. Task 5.10 added the README
// check (Req 32.5) at the end.

import { describe, expect, it } from "vitest"
import { join } from "node:path"
import { APP_DIR, REPO_DIR, readText } from "./test/source-files"

type PackageJson = { scripts?: Record<string, string>; dependencies?: Record<string, string> }

const pkg = JSON.parse(readText(join(APP_DIR, "package.json"))) as PackageJson
const viteConfig = readText(join(APP_DIR, "vite.config.ts"))

describe("package.json", () => {
  it("has the five scripts dev, build, preview, test and typecheck, none empty (Req 32.1)", () => {
    for (const name of ["dev", "build", "preview", "test", "typecheck"]) {
      expect(pkg.scripts?.[name]?.trim() ?? "", name).not.toBe("")
    }
    expect(pkg.scripts?.build).toContain("vite build")
  })

  it("bundles the four @fontsource packages as dependencies (Req 30.2)", () => {
    for (const font of ["@fontsource/monoton", "@fontsource/josefin-sans", "@fontsource/spectral", "@fontsource/ibm-plex-mono"]) {
      expect(pkg.dependencies?.[font], font).toBeTruthy()
    }
  })
})

describe("vite.config.ts", () => {
  it("sets test.testTimeout to 20000 (Req 32.4)", () => {
    expect(viteConfig).toMatch(/\btestTimeout\s*:\s*20000\b/)
  })

  it('serves from the site root with base "/" (Req 32.3)', () => {
    expect(viteConfig).toMatch(/\bbase\s*:\s*["']\/["']/)
  })
})

describe("README.md (Req 32.5)", () => {
  const readme = readText(join(REPO_DIR, "README.md"))
  /** The "App 2: Ghosted" section, up to the next section. */
  const ghosted = (() => {
    const start = readme.indexOf("## App 2: Ghosted")
    const end = readme.indexOf("\n## ", start + 1)
    return start === -1 ? "" : readme.slice(start, end === -1 ? undefined : end)
  })()

  it("gives Ghosted's run command", () => {
    expect(readme).toContain("pnpm --filter @decay-engine/ghosted dev")
  })

  it("describes Ghosted as built, with the engine unchanged", () => {
    expect(ghosted).not.toBe("")
    expect(ghosted).toMatch(/\*\*Built\.\*\*/)
    expect(ghosted).toContain("zero changes to `packages/engine`")
    expect(readme).toMatch(/^- \[x\] Ghosted\b/m)
  })

  it("names the shell's three optional additions", () => {
    for (const prop of ["maxDays", "jumpDays", "budgets", "defaultBudget", "markers", "renderMarker", "markerSummary"]) {
      expect(ghosted, prop).toContain(`\`${prop}\``)
    }
  })

  it("keeps Study Dungeon's section and run command, and has no third app section", () => {
    expect(readme).toContain("## App 1: Study Dungeon")
    expect(readme).toContain("pnpm --filter @decay-engine/study-dungeon dev")
    expect(readme).not.toContain("## App 3")
  })
})
