// Extensions spec, Requirement 13 (task 5.3): the memory-model files make no
// network request. Reads the source text, comments stripped; a self-test
// proves the scan finds a planted call.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const FILES = ["policy-memory.ts", "policy-select.ts", "components/MemoryModelToggle.tsx"]

const NETWORK = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /\bimport\s*\(\s*["'`]https?:/, /https?:\/\//]

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

function networkUses(text: string): string[] {
  const code = stripComments(text)
  return NETWORK.filter((re) => re.test(code)).map(String)
}

describe("memory model: no network", () => {
  it("the scan finds a planted request (self-test)", () => {
    expect(networkUses('const r = fetch("/x")')).toEqual([String(NETWORK[0])])
    expect(networkUses("new WebSocket(u)")).toEqual([String(NETWORK[2])])
    expect(networkUses("// fetch(x) in a comment")).toEqual([])
  })

  for (const file of FILES) {
    it(`${file} makes no network request`, () => {
      const text = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8")
      expect(text.length).toBeGreaterThan(0)
      expect(networkUses(text)).toEqual([])
    })
  }
})
