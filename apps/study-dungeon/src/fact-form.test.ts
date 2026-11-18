// Tests for the add/edit fact form's validation (task 5.1, Requirement 5).
// Limits from the spec: question and answer required, at most 140 characters;
// why optional, at most 80; knowledge new/shaky/solid; importance 1, 2 or 3;
// review cost 1, 2, 3 or 5 minutes.

import { describe, expect, it } from "vitest"
import { validateFactForm, type FactFormValues } from "./fact-form"

const valid: FactFormValues = {
  question: "What is the capital of Peru?",
  answer: "Lima",
  why: "Ships sail there",
  knowledge: "shaky",
  importance: 3,
  costMinutes: 5,
}

const chars = (n: number) => "q".repeat(n)

function errorsOf(values: Partial<FactFormValues>) {
  const result = validateFactForm({ ...valid, ...values })
  if (result.ok) throw new Error("expected the form to be rejected")
  return result.errors
}

describe("validateFactForm", () => {
  it("accepts a complete fact and returns exactly what engine.addItem needs", () => {
    expect(validateFactForm(valid)).toEqual({
      ok: true,
      fact: {
        payload: { question: "What is the capital of Peru?", answer: "Lima", why: "Ships sail there", knowledge: "shaky" },
        importance: 3,
        costMinutes: 5,
      },
    })
  })

  it("accepts a 140-character question and rejects 141", () => {
    const ok = validateFactForm({ ...valid, question: chars(140) })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.fact.payload.question).toHaveLength(140)
    expect(errorsOf({ question: chars(141) })).toEqual({ question: "Use at most 140 characters." })
  })

  it("accepts a 140-character answer and rejects 141", () => {
    expect(validateFactForm({ ...valid, answer: chars(140) }).ok).toBe(true)
    expect(errorsOf({ answer: chars(141) })).toEqual({ answer: "Use at most 140 characters." })
  })

  it("accepts an 80-character why and rejects 81", () => {
    expect(validateFactForm({ ...valid, why: chars(80) }).ok).toBe(true)
    expect(errorsOf({ why: chars(81) })).toEqual({ why: "Use at most 80 characters." })
  })

  it("requires a question and an answer; blank text counts as missing", () => {
    expect(errorsOf({ question: "" })).toEqual({ question: "Write a question." })
    expect(errorsOf({ question: "   " })).toEqual({ question: "Write a question." })
    expect(errorsOf({ answer: "" })).toEqual({ answer: "Write the answer." })
    expect(errorsOf({ answer: "\t \n" })).toEqual({ answer: "Write the answer." })
  })

  it("lets why be empty and stores it as an empty string", () => {
    const result = validateFactForm({ ...valid, why: "   " })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.fact.payload.why).toBe("")
  })

  it("trims text before checking and storing it", () => {
    const result = validateFactForm({ ...valid, question: `  ${chars(140)}  `, answer: " Lima ", why: " Ships " })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.fact.payload.question).toBe(chars(140))
    expect(result.fact.payload.answer).toBe("Lima")
    expect(result.fact.payload.why).toBe("Ships")
  })

  it("accepts only the knowledge levels new, shaky and solid", () => {
    for (const knowledge of ["new", "shaky", "solid"]) {
      const result = validateFactForm({ ...valid, knowledge })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.fact.payload.knowledge).toBe(knowledge)
    }
    expect(errorsOf({ knowledge: "expert" })).toEqual({ knowledge: "Choose brand new, shaky or solid." })
    expect(errorsOf({ knowledge: "" })).toEqual({ knowledge: "Choose brand new, shaky or solid." })
  })

  it("accepts importance 1, 2 and 3 only", () => {
    for (const importance of [1, 2, 3]) expect(validateFactForm({ ...valid, importance }).ok).toBe(true)
    for (const importance of [0, 4, 2.5, Number.NaN]) {
      expect(errorsOf({ importance })).toEqual({ importance: "Choose an importance of 1, 2 or 3." })
    }
  })

  it("accepts a review cost of 1, 2, 3 or 5 minutes only", () => {
    for (const costMinutes of [1, 2, 3, 5]) expect(validateFactForm({ ...valid, costMinutes }).ok).toBe(true)
    for (const costMinutes of [0, 4, 6, 10, Number.NaN]) {
      expect(errorsOf({ costMinutes })).toEqual({ costMinutes: "Choose a review cost of 1, 2, 3 or 5 minutes." })
    }
  })

  it("reports every failing field at once", () => {
    expect(errorsOf({ question: "", answer: chars(141), why: chars(81), importance: 4, costMinutes: 4 })).toEqual({
      question: "Write a question.",
      answer: "Use at most 140 characters.",
      why: "Use at most 80 characters.",
      importance: "Choose an importance of 1, 2 or 3.",
      costMinutes: "Choose a review cost of 1, 2, 3 or 5 minutes.",
    })
  })
})
