import { describe, expect, it } from "vitest"
import { loadSampleData } from "./sample-data"
import { shareCardSvg } from "./share-card"
import { T0, makeEngine } from "./test/fixtures"

function samplePeople() {
  const engine = makeEngine()
  loadSampleData(engine, T0)
  return engine.view(T0)
}

describe("shareCardSvg (Req 9)", () => {
  it("is one SVG with no url(), no script and no link other than the SVG namespace", () => {
    const svg = shareCardSvg(samplePeople(), { names: true })
    expect(svg.startsWith("<svg ")).toBe(true)
    expect(svg.endsWith("</svg>")).toBe(true)
    expect(svg).not.toMatch(/url\(/)
    expect(svg).not.toMatch(/<script/i)
    expect(svg.replace("http://www.w3.org/2000/svg", "")).not.toMatch(/https?:/)
  })

  it("shows no names unless asked, and first names when asked", () => {
    const people = samplePeople()
    const first = people[0]!.payload.name.split(/\s+/)[0]!
    expect(shareCardSvg(people, { names: false })).not.toContain(`>${first}<`)
    expect(shareCardSvg(people, { names: true })).toContain(`>${first}<`)
  })

  it("says the counts in words", () => {
    const people = samplePeople()
    const lit = people.filter((p) => p.state === "alive").length
    expect(shareCardSvg(people, { names: false })).toContain(`${lit} lit · `)
  })

  it("escapes a name that looks like markup", () => {
    const people = samplePeople().map((p, i) => (i === 0 ? { ...p, payload: { ...p.payload, name: "<b>Eve" } } : p))
    const svg = shareCardSvg(people, { names: true })
    expect(svg).toContain("&lt;b&gt;Eve")
    expect(svg).not.toContain("<b>")
  })
})
