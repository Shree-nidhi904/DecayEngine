// Answer checking (answer-check.ts): typed answers with some slack, and the
// options for picking. Expected values are written out by hand.
// Written by Claude Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import { describe, expect, it } from "vitest"
import {
  ANSWER_CHECK_KEY,
  buildChoices,
  checkTyped,
  editDistance,
  loadAnswerCheck,
  normalizeAnswer,
  saveAnswerCheck,
} from "./answer-check"

describe("normalizeAnswer", () => {
  it("ignores case, accents, punctuation and articles", () => {
    expect(normalizeAnswer("  The Peace of Westphalia, 1648! ")).toBe("peace of westphalia 1648")
    expect(normalizeAnswer("Café")).toBe("cafe")
    expect(normalizeAnswer("O(log n)")).toBe("o log n")
  })
})

describe("editDistance", () => {
  it("counts inserts, deletes and replacements", () => {
    expect(editDistance("canberra", "canberra")).toBe(0)
    expect(editDistance("canbera", "canberra")).toBe(1)
    expect(editDistance("kitten", "sitting")).toBe(3)
  })
})

describe("checkTyped", () => {
  it("accepts the answer whatever the case or punctuation", () => {
    expect(checkTyped("canberra", "Canberra")).toBe(true)
    expect(checkTyped("O(log n)", "O(log n)")).toBe(true)
    expect(checkTyped("o log n", "O(log n)")).toBe(true)
  })

  it("allows one typo per five letters, none in short answers", () => {
    expect(checkTyped("Canbera", "Canberra")).toBe(true)
    expect(checkTyped("Sydney", "Canberra")).toBe(false)
    expect(checkTyped("1/y", "1/x")).toBe(false)
  })

  it("accepts the main part when the rest explains it", () => {
    expect(checkTyped("Peace of Westphalia", "Peace of Westphalia, 1648")).toBe(true)
    expect(checkTyped("Mary Shelley", "Mary Shelley, 1818")).toBe(true)
    expect(checkTyped("ohm", "The ohm (Ω)")).toBe(true)
    expect(checkTyped("makes ATP", "Makes ATP, the cell's usable energy")).toBe(true)
  })

  it("does not accept the first item of a list as the whole list", () => {
    expect(checkTyped("SYN", "SYN, SYN-ACK, ACK")).toBe(false)
    expect(checkTyped("syn syn ack ack", "SYN, SYN-ACK, ACK")).toBe(true)
  })

  it("never accepts an empty answer", () => {
    expect(checkTyped("   ", "Canberra")).toBe(false)
  })
})

describe("buildChoices", () => {
  const fact = (id: string, answer: string) => ({ id, payload: { answer } })
  const pool = [
    fact("a", "Canberra"),
    fact("b", "Helicase"),
    fact("c", "Mary Shelley, 1818"),
    fact("d", "Au"),
    fact("e", "canberra!"),
    fact("f", "Peace of Westphalia, 1648"),
  ]

  it("has the right answer and three different wrong ones", () => {
    const options = buildChoices(pool[0]!, pool)!
    expect(options).toHaveLength(4)
    expect(options).toContain("Canberra")
    expect(new Set(options.map(normalizeAnswer)).size).toBe(4)
    // "canberra!" reads the same as the right answer, so it is never a wrong option.
    expect(options).not.toContain("canberra!")
  })

  it("prefers wrong options that look like the right one", () => {
    const options = buildChoices(pool[2]!, pool)!
    // A name and a year: the other "words, year" answer is picked over "Au".
    expect(options).toContain("Peace of Westphalia, 1648")
    expect(options).not.toContain("Au")
  })

  it("is stable: the same fact gets the same options in the same order", () => {
    const unique = pool.filter((f) => f.id !== "e")
    expect(buildChoices(pool[1]!, unique)).toEqual(buildChoices(pool[1]!, [...unique].reverse()))
  })

  it("gives up with fewer than two wrong options", () => {
    expect(buildChoices(pool[0]!, [pool[0]!, pool[1]!])).toBeNull()
  })
})

describe("the setting", () => {
  const store = () => {
    const map = new Map<string, string>()
    return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map }
  }

  it("defaults to picking, or to the fallback given", () => {
    expect(loadAnswerCheck(store())).toBe("choices")
    expect(loadAnswerCheck(store(), "self")).toBe("self")
  })

  it("is saved and read back, and an unknown value falls back", () => {
    const s = store()
    saveAnswerCheck(s, "typed")
    expect(s.map.get(ANSWER_CHECK_KEY)).toBe("typed")
    expect(loadAnswerCheck(s)).toBe("typed")
    s.map.set(ANSWER_CHECK_KEY, "nonsense")
    expect(loadAnswerCheck(s)).toBe("choices")
  })
})
