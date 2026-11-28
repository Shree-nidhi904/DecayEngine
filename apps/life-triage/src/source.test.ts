// Extensions spec, tasks 5.2 and 5.3 (Requirements 13 and 14.2 to 14.4):
// no network request in the page's own code, nothing loaded from another
// host, 44px targets and no animation in the styles. A self-test proves the
// network scan finds a planted call.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")

const NETWORK = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /\bimport\s*\(\s*["'`]https?:/, /https?:\/\//]

function networkUses(text: string): string[] {
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/href="[^"]*"/g, 'href=""')
    // The apps' own addresses, used only as link targets (links.ts).
    .replace(/"https:\/\/decay-engine-[a-z-]+\.pages\.dev\/"/g, '""')
  return NETWORK.filter((re) => re.test(code)).map(String)
}

describe("Life Triage: no network", () => {
  it("the scan finds a planted request (self-test)", () => {
    expect(networkUses('navigator.sendBeacon("/x", data)')).toEqual([String(NETWORK[4])])
    expect(networkUses("// new WebSocket(u)")).toEqual([])
    expect(networkUses('fetch("https://decay-engine-ghosted.pages.dev/")')).toEqual([String(NETWORK[0])])
    expect(networkUses('const u = "https://evil.example/"')).toEqual([String(NETWORK[6])])
  })

  for (const file of ["./App.tsx", "./load.ts", "./files.ts", "./text.ts", "./main.tsx", "./account.ts", "./AccountLoader.tsx", "./links.ts"]) {
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

describe("Life Triage styles", () => {
  const css = read("./styles.css")
  it("buttons, the file label and inputs are at least 44px tall", () => {
    expect(css).toMatch(/button \{ min-height:44px; min-width:44px \}/)
    expect(css).toMatch(/\.filebtn \{ display:inline-flex; align-items:center; min-height:44px \}/)
    expect(css).toMatch(/input:not\(\[type="file"\]\) \{ min-height:44px \}/)
  })
  it("keeps a visible focus outline, including the file label", () => {
    expect(css).toMatch(/:focus-visible \{ outline:2px solid var\(--acc\)/)
    expect(css).toMatch(/\.filebtn:focus-within \{ outline:2px solid var\(--acc\)/)
  })
  it("has no animation or transition", () => {
    expect(css).not.toMatch(/animation|transition|@keyframes/)
  })
})
