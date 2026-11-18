// Engine-boundary steering rules, checked against the source text.
// Source of truth: .kiro/steering/engine-boundary.md, Requirements 1.9, 11.2, 12.4.
import { describe, it, expect } from "vitest"

const sources = import.meta.glob<string>("../../src/**/*.ts", { query: "?raw", import: "default", eager: true })
const [packageJson] = Object.values(
  import.meta.glob<string>("../../package.json", { query: "?raw", import: "default", eager: true })
)

// Source without comments, so a comment that mentions a rule does not trip it.
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

const files = Object.entries(sources).map(([path, text]) => ({
  path: path.replace("../../", ""),
  code: code(text),
}))

describe("engine boundary", () => {
  it("finds the engine source files", () => {
    const paths = files.map((f) => f.path)
    expect(paths).toContain("src/engine.ts")
    expect(paths).toContain("src/storage/local-storage.ts")
    expect(paths.length).toBeGreaterThanOrEqual(10)
  })

  it.each(files)("$path never reads the clock", ({ code }) => {
    expect(code).not.toMatch(/Date\.now\s*\(/)
    expect(code).not.toMatch(/new\s+Date\b/)
    expect(code).not.toMatch(/performance\.now/)
  })

  it.each(files.filter((f) => f.path !== "src/storage/local-storage.ts"))(
    "$path uses no browser globals",
    ({ code }) => {
      expect(code).not.toMatch(/\b(localStorage|sessionStorage|window|document)\b/)
    }
  )

  it.each(files)("$path imports only engine files", ({ code }) => {
    const imports = [...code.matchAll(/(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']/g)].map(
      (m) => m[1] ?? m[2]!
    )
    for (const specifier of imports) {
      expect(specifier.startsWith("./") || specifier.startsWith("../"), specifier).toBe(true)
      expect(specifier).not.toMatch(/apps\/|packages\/shell|react/)
    }
  })

  it("has no runtime dependencies", () => {
    const pkg = JSON.parse(packageJson!) as { dependencies?: Record<string, string> }
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([])
  })
})
