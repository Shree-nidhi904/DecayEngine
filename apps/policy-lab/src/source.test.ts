// Extensions spec, tasks 5.2 and 5.3 (Requirements 13 and 14.3, 14.4):
// 44px targets and no animation in the styles, and no network request in the
// page's own code. Reads the files as text; a self-test proves the network
// scan finds a planted call.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")

const NETWORK = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /\bimport\s*\(\s*["'`]https?:/, /https?:\/\//]

/** Network uses in code: comments and link targets (href="...") are not requests. */
function networkUses(text: string): string[] {
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/href="[^"]*"/g, 'href=""')
  return NETWORK.filter((re) => re.test(code)).map(String)
}

describe("Policy Lab: no network", () => {
  it("the scan finds a planted request and ignores links and comments (self-test)", () => {
    expect(networkUses('await fetch("/api")')).toEqual([String(NETWORK[0])])
    expect(networkUses('const u = "https://example.org"')).toEqual([String(NETWORK[6])])
    expect(networkUses('<a href="https://example.org">x</a>')).toEqual([])
    expect(networkUses("// fetch(x)")).toEqual([])
  })

  for (const file of ["./App.tsx", "./lab.ts", "./main.tsx", "./text.ts"]) {
    it(`${file} makes no network request`, () => {
      expect(networkUses(read(file))).toEqual([])
    })
  }

  it("index.html loads no script or style from another host", () => {
    const html = read("../index.html")
    expect(html).not.toMatch(/<script[^>]*src="https?:/)
    expect(html).not.toMatch(/<link[^>]*href="https?:/)
  })
})

describe("Policy Lab styles", () => {
  const css = read("./styles.css")
  it("buttons, inputs and the editor are at least 44px tall", () => {
    expect(css).toMatch(/button \{ min-height:44px; min-width:44px \}/)
    expect(css).toMatch(/input, textarea \{ min-height:44px \}/)
  })
  it("keeps a visible focus outline", () => {
    expect(css).toMatch(/:focus-visible \{ outline:2px solid var\(--acc\)/)
  })
  it("has no animation or transition (nothing to turn off under reduced motion)", () => {
    expect(css).not.toMatch(/animation|transition|@keyframes/)
  })
})
