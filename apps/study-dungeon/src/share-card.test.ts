import { describe, expect, it } from "vitest"
import { shareCardSvg } from "./share-card"

/** The text elements of the card, in order. */
const texts = (svg: string) => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1])

describe("shareCardSvg (Req 9, feedback list point 14)", () => {
  const svg = shareCardSvg({ alive: 5, weak: 3, dead: 2, souls: 14 })

  it("is one SVG with no url(), no script and no link other than the SVG namespace", () => {
    expect(svg.startsWith("<svg ")).toBe(true)
    expect(svg.endsWith("</svg>")).toBe(true)
    expect(svg).not.toMatch(/url\(|<script/i)
    expect(svg.replace("http://www.w3.org/2000/svg", "")).not.toMatch(/https?:/)
  })

  it("shows the three counters, each with its number and its list name, in order", () => {
    const t = texts(svg)
    const at = (needle: string) => t.indexOf(needle)
    expect(t).toEqual(expect.arrayContaining(["5", "3", "2", "CRYPT", "DUNGEON", "GRAVEYARD"]))
    // Crypt's 5 comes before Dungeon's 3 before Graveyard's 2, and each name follows its number.
    expect(at("5")).toBeLessThan(at("CRYPT"))
    expect(at("CRYPT")).toBeLessThan(at("3"))
    expect(at("3")).toBeLessThan(at("DUNGEON"))
    expect(at("DUNGEON")).toBeLessThan(at("2"))
    expect(at("2")).toBeLessThan(at("GRAVEYARD"))
  })

  it("marks each state by shape as well as colour: a circle, a triangle and a cross", () => {
    expect((svg.match(/<circle /g) ?? []).length).toBe(1)
    expect((svg.match(/L[\d.]+ [\d.]+H/g) ?? []).length).toBe(1) // the triangle
    expect(svg).toMatch(/M[\d.]+ [\d.]+L[\d.]+ [\d.]+M[\d.]+ [\d.]+L/) // the cross: two strokes
  })

  it("says the souls banished, and never a fact's own words", () => {
    expect(svg).toContain("14 souls banished")
    expect(texts(shareCardSvg({ alive: 0, weak: 0, dead: 0, souls: 0 }))).toEqual(
      expect.arrayContaining(["0", "CRYPT", "DUNGEON", "GRAVEYARD", "0 souls banished"])
    )
  })

  it("shows big counts as they are (no cap)", () => {
    expect(texts(shareCardSvg({ alive: 140, weak: 0, dead: 0, souls: 0 }))).toContain("140")
  })
})
