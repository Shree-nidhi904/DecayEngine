// Extensions spec, tasks 5.3 (Requirements 1.3 to 1.5 and 13): the package
// makes no network request, reads no clock, imports the engine only by its
// package name, and calls only engine.triage. A self-test proves the scans
// find what they look for.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const source = code(readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8"))

const NETWORK = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /https?:\/\//]
const CLOCK = [/Date\.now/, /new Date\(\s*\)/, /performance\.now/, /Math\.random/]
const WRITES = [/\.addItem\(/, /\.tend\(/, /\.resurrect\(/, /\.edit\(/, /\.remove\(/, /\.tick\(/]

const found = (text: string, list: RegExp[]) => list.filter((re) => re.test(text)).map(String)

describe("@decay-engine/life-triage source", () => {
  it("the scans find planted uses (self-test)", () => {
    expect(found('fetch("/x")', NETWORK)).toEqual([String(NETWORK[0])])
    expect(found("const t = Date.now()", CLOCK)).toEqual([String(CLOCK[0])])
    expect(found("s.engine.tick(now)", WRITES)).toEqual([String(WRITES[5])])
  })

  it("makes no network request and reads no clock", () => {
    expect(found(source, NETWORK)).toEqual([])
    expect(found(source, CLOCK)).toEqual([])
  })

  it("never changes an engine; its only engine call is triage", () => {
    expect(found(source, WRITES)).toEqual([])
    expect(source).toMatch(/\.engine\.triage\(1, now\)/)
  })

  it("imports only @decay-engine/engine, by its package name", () => {
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1])
    expect(imports).toEqual(["@decay-engine/engine"])
  })
})
