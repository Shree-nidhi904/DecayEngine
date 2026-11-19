// The creature rules (visual pass, Pass 2): stable identity from the id,
// the mood rule and the urgency labels. Expected values come from the brief
// (docs/design/study-dungeon-visual-pass.md), not from running the code.

import { describe, expect, it } from "vitest"
import { CREATURES, CREATURE_KINDS, FERAL_BELOW, creatureOf, moodOf, nameCreatures, quipOf, urgencyOf } from "./creatures"

describe("creatureOf", () => {
  it("gives the same id the same creature every time", () => {
    expect(creatureOf("fact-42")).toEqual(creatureOf("fact-42"))
  })

  it("picks a known kind, one of that kind's names and its colour", () => {
    for (const id of ["a", "b", "id-0", "id-11", "7f3c", "x".repeat(40)]) {
      const c = creatureOf(id)
      expect(CREATURE_KINDS).toContain(c.kind)
      expect(CREATURES[c.kind].names).toContain(c.name)
      expect(c.color).toBe(CREATURES[c.kind].color)
    }
  })

  it("spreads ids over all four kinds", () => {
    const kinds = new Set(Array.from({ length: 40 }, (_, i) => creatureOf(`id-${i}`).kind))
    expect(kinds.size).toBe(4)
  })
})

describe("moodOf: the mood rule from the brief", () => {
  it("alive facts sleep, whatever their health", () => {
    expect(moodOf("alive", 100)).toBe("sleep")
    expect(moodOf("alive", 60)).toBe("sleep")
  })

  it("weak at or above 35 is worried, below 35 is feral", () => {
    expect(FERAL_BELOW).toBe(35)
    expect(moodOf("weak", 59.9)).toBe("worried")
    expect(moodOf("weak", 35)).toBe("worried")
    expect(moodOf("weak", 34.99)).toBe("feral")
    expect(moodOf("weak", 10)).toBe("feral")
  })

  it("a dead fact rises feral for its challenge", () => {
    expect(moodOf("dead", 3)).toBe("feral")
  })

  it("every mood has a line to say", () => {
    for (const mood of ["sleep", "worried", "feral", "happy"] as const) expect(quipOf(mood)).not.toBe("")
  })
})

describe("urgencyOf", () => {
  it("says Review soon from 40, Review now from 20, Nearly forgotten below 20", () => {
    expect(urgencyOf(59)).toEqual({ text: "Review soon", critical: false })
    expect(urgencyOf(40)).toEqual({ text: "Review soon", critical: false })
    expect(urgencyOf(39.9)).toEqual({ text: "Review now", critical: true })
    expect(urgencyOf(20)).toEqual({ text: "Review now", critical: true })
    expect(urgencyOf(19.9)).toEqual({ text: "Nearly forgotten", critical: true })
  })
})

describe("nameCreatures", () => {
  const facts = Array.from({ length: 60 }, (_, i) => ({ id: `id-${i}`, createdAt: i }))

  it("gives every fact a different name, and creatureOf uses it", () => {
    const names = nameCreatures(facts)
    expect(new Set(names.values()).size).toBe(60)
    expect(creatureOf("id-7").name).toBe(names.get("id-7"))
  })

  it("a fact keeps its name when newer facts are added", () => {
    const before = nameCreatures(facts.slice(0, 10))
    const after = nameCreatures(facts)
    for (const [id, name] of before) expect(after.get(id)).toBe(name)
  })

  it("adds II, III when a kind runs out of names", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `x${i}`, createdAt: i }))
    const names = [...nameCreatures(many).values()]
    expect(new Set(names).size).toBe(200)
    expect(names.some((n) => n.endsWith(" II"))).toBe(true)
  })
})
