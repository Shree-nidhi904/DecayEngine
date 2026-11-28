import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { countDeaths, previewCrossings } from "./preview-crossings"
import { doom, doomBand } from "./doom"
import { guideLine, guidePool, guideRotation, type GuideCase, type GuideContext } from "./guide"
import { readSpooky, saveSpooky, SPOOKY_KEY } from "./spooky-level"
import type { LifeState, StateOf } from "./state-changes"
import { wispText } from "./wording"
import { T0, day } from "./test/fixtures"

const STATE = fc.constantFrom<LifeState>("alive", "weak", "dead")
/** Two views of the same ids, each with any state. */
const VIEWS = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 12 })
  .chain((ids) =>
    fc.tuple(fc.constant(ids), fc.array(STATE, { minLength: ids.length, maxLength: ids.length }), fc.array(STATE, { minLength: ids.length, maxLength: ids.length }))
  )
  .map(([ids, a, b]) => ({
    before: ids.map((id, i): StateOf => ({ id, state: a[i]! })),
    after: ids.map((id, i): StateOf => ({ id, state: b[i]! })),
  }))

describe("previewCrossings (Req 1)", () => {
  it("is empty when nothing moved (offset 0)", () => {
    fc.assert(
      fc.property(VIEWS, ({ before }) => {
        expect(previewCrossings(before, before).size).toBe(0)
      }),
      { numRuns: 200 }
    )
  })

  it("marks exactly not-dead → dead as dies and alive → weak as fades", () => {
    fc.assert(
      fc.property(VIEWS, ({ before, after }) => {
        const crossed = previewCrossings(before, after)
        for (let i = 0; i < before.length; i++) {
          const from = before[i]!.state
          const to = after[i]!.state
          const expected = from !== "dead" && to === "dead" ? "dies" : from === "alive" && to === "weak" ? "fades" : undefined
          expect(crossed.get(before[i]!.id)).toBe(expected)
        }
        expect(countDeaths(crossed)).toBe([...crossed.values()].filter((k) => k === "dies").length)
      }),
      { numRuns: 200 }
    )
  })

  it("skips ids that are in only one view", () => {
    expect(previewCrossings([{ id: "a", state: "alive" }], [{ id: "b", state: "dead" }]).size).toBe(0)
  })

  it("never marks a getting-better move", () => {
    const crossed = previewCrossings(
      [
        { id: "a", state: "dead" },
        { id: "b", state: "weak" },
      ],
      [
        { id: "a", state: "alive" },
        { id: "b", state: "alive" },
      ]
    )
    expect(crossed.size).toBe(0)
  })
})

describe("doom (Req 2)", () => {
  it("is 0 with no one, 0 when all lit, 1 when all dark, 0.5 when all flickering", () => {
    expect(doom([])).toBe(0)
    expect(doom([{ state: "alive" }, { state: "alive" }])).toBe(0)
    expect(doom([{ state: "dead" }, { state: "dead" }])).toBe(1)
    expect(doom([{ state: "weak" }])).toBe(0.5)
  })

  it("stays in 0..1 and never drops when one more person goes dark", () => {
    fc.assert(
      fc.property(fc.array(STATE, { maxLength: 30 }), fc.nat(), (states, pick) => {
        const items = states.map((state) => ({ state }))
        const d = doom(items)
        expect(d).toBeGreaterThanOrEqual(0)
        expect(d).toBeLessThanOrEqual(1)
        if (items.length === 0) return
        const darker = items.map((item, i) => (i === pick % items.length ? { state: "dead" as const } : item))
        expect(doom(darker)).toBeGreaterThanOrEqual(d)
      }),
      { numRuns: 200 }
    )
  })

  it("bands at 0.2 and 0.5", () => {
    expect(doomBand(0)).toBe("calm")
    expect(doomBand(0.19)).toBe("calm")
    expect(doomBand(0.2)).toBe("uneasy")
    expect(doomBand(0.49)).toBe("uneasy")
    expect(doomBand(0.5)).toBe("grim")
    expect(doomBand(1)).toBe("grim")
  })
})

describe("Wisp's line (Req 5)", () => {
  const CASES: GuideCase[] = ["first-run", "empty", "fading", "dark", "lit"]
  const contexts: GuideContext[] = CASES.flatMap((heroCase) =>
    [false, true].flatMap((previewing) =>
      (["calm", "uneasy", "grim"] as const).flatMap((band) => [0, 2].map((dies) => ({ heroCase, previewing, band, dies, rotation: 3 })))
    )
  )
  const allLines = Object.entries(wispText).flatMap(([, v]) => (Array.isArray(v) ? v : []))
  const ACTION = /\b(load|add|tap|reach out|drag|back to today|read|look|try|start|pick|go back|keep dragging)\b/i

  it("every context has a non-empty pool and one line from it", () => {
    for (const ctx of contexts) {
      const pool = guidePool(ctx)
      expect(pool.length, JSON.stringify(ctx)).toBeGreaterThan(0)
      expect(pool).toContain(guideLine(ctx))
    }
  })

  it("every line is at most 120 characters, names an action and never says die or dead", () => {
    expect(allLines.length).toBeGreaterThan(10)
    for (const line of allLines) {
      expect(line.length, line).toBeLessThanOrEqual(120)
      expect(line, line).toMatch(ACTION)
      expect(line, line).not.toMatch(/\b(die|dies|died|dying|dead|this week|should|forgot)\b/i)
      expect(line, line).not.toMatch(/ghosted you|ignored you|doesn['’]t care/i)
    }
  })

  it("the line holds for a day and turns over the next", () => {
    expect(guideRotation(T0)).toBe(guideRotation(T0 + 1000))
    const ctx = (rotation: number): GuideContext => ({ heroCase: "fading", previewing: false, band: "uneasy", dies: 0, rotation })
    const pool = guidePool(ctx(0))
    const seen = new Set(Array.from({ length: pool.length }, (_, i) => guideLine(ctx(guideRotation(day(i)) ))))
    expect(seen.size).toBe(pool.length)
  })

  it("a dark preview gets the dark preview line", () => {
    expect(wispText.previewDark).toContain(guideLine({ heroCase: "lit", previewing: true, band: "calm", dies: 1, rotation: 0 }))
  })
})

describe("Spooky level (Req 6.1)", () => {
  const memory = () => {
    const map = new Map<string, string>()
    return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map }
  }

  it("defaults to haunted and keeps calm", () => {
    const s = memory()
    expect(readSpooky(s)).toBe("haunted")
    expect(saveSpooky(s, "calm")).toBe(true)
    expect(s.map.get(SPOOKY_KEY)).toBe("calm")
    expect(readSpooky(s)).toBe("calm")
    saveSpooky(s, "haunted")
    expect(readSpooky(s)).toBe("haunted")
  })

  it("storage that throws reads as haunted and a save says false", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("full")
      },
    }
    expect(readSpooky(broken)).toBe("haunted")
    expect(saveSpooky(broken, "calm")).toBe(false)
  })
})
