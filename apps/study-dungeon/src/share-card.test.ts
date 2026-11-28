import { describe, expect, it } from "vitest"
import { shareCardSvg } from "./share-card"

describe("shareCardSvg (Req 9)", () => {
  const svg = shareCardSvg({ alive: 5, weak: 3, dead: 2, souls: 14 })

  it("is one SVG with no url(), no script and no link other than the SVG namespace", () => {
    expect(svg.startsWith("<svg ")).toBe(true)
    expect(svg.endsWith("</svg>")).toBe(true)
    expect(svg).not.toMatch(/url\(|<script/i)
    expect(svg.replace("http://www.w3.org/2000/svg", "")).not.toMatch(/https?:/)
  })

  it("says the counts and the souls in words", () => {
    expect(svg).toContain("5 asleep · 3 awake · 2 in the Graveyard")
    expect(svg).toContain("14 souls banished")
  })

  it("draws one mark per fact, up to 24", () => {
    expect((svg.match(/<ellipse /g) ?? []).length).toBe(8)
    const many = shareCardSvg({ alive: 40, weak: 0, dead: 0, souls: 0 })
    expect((many.match(/<ellipse /g) ?? []).length).toBe(24)
  })
})
