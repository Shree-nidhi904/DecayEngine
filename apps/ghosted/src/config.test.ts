// Package and build configuration (task 2.9; Req 30.2, 32.1, 32.3, 32.4).
// The files are read as text, never imported. The README check is added in
// task 5.10.

import { describe, expect, it } from "vitest"
import { join } from "node:path"
import { APP_DIR, readText } from "./test/source-files"

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
