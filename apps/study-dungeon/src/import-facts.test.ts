// Bulk import parsing (import-facts.ts).
// Written by Claude Code (Opus 5.5), outside Kiro, at the developer's request; see .kiro/steering/authorship.md.

import { describe, expect, it } from "vitest"
import { parseImport } from "./import-facts"

describe("parseImport", () => {
  it("reads question | answer | why, tabs and CSV, and ignores blanks and comments", () => {
    const text = [
      "# my biology deck",
      "Powerhouse of the cell? | Mitochondrion | Exam on Friday",
      "",
      "Capital of Peru?\tLima",
      '"Who wrote ""Dracula""?",Bram Stoker',
    ].join("\n")
    expect(parseImport(text)).toEqual({
      facts: [
        { question: "Powerhouse of the cell?", answer: "Mitochondrion", why: "Exam on Friday" },
        { question: "Capital of Peru?", answer: "Lima", why: "" },
        { question: 'Who wrote "Dracula"?', answer: "Bram Stoker", why: "" },
      ],
      skipped: [],
    })
  })

  it("skips lines it cannot use and says why, by line number", () => {
    const text = ["Only a question", "Q? | A", "Q? | again", `${"x".repeat(141)} | A`].join("\n")
    const { facts, skipped } = parseImport(text)
    expect(facts).toEqual([{ question: "Q?", answer: "A", why: "" }])
    expect(skipped).toEqual([
      { line: 1, reason: "needs a question and an answer, split by |" },
      { line: 3, reason: "the same question is on an earlier line" },
      { line: 4, reason: "the question is over 140 characters" },
    ])
  })
})

describe("CSV and Anki exports", () => {
  it("skips a Front,Back header and reads quoted cells over several lines", () => {
    const r = parseImport('Front,Back\n"Capital of\nPeru?",Lima\nWhat is 2+2?,4')
    expect(r.skipped).toEqual([])
    expect(r.facts.map((f) => [f.question, f.answer])).toEqual([["Capital of Peru?", "Lima"], ["What is 2+2?", "4"]])
  })

  it("turns Anki HTML into plain text and ignores #separator lines", () => {
    const r = parseImport("#separator:tab\n#html:true\nWhat is <b>H<sub>2</sub>O</b>?<br>Hint&nbsp;one\tWater &amp; ice")
    expect(r.facts).toEqual([{ question: "What is H2O? Hint one", answer: "Water & ice", why: "" }])
  })

  it("reports the line a multi-line record starts on", () => {
    const r = parseImport('ok,fine\n"broken\nrecord"')
    expect(r.skipped).toEqual([{ line: 2, reason: "needs a question and an answer, split by |" }])
  })

  it("a header is only skipped on the first row", () => {
    const r = parseImport("Q1,A1\nFront,Back")
    expect(r.facts.length).toBe(2)
  })
})
