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
