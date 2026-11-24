// Bulk import: turns pasted text into facts. One fact per line:
//   question | answer
//   question | answer | why it matters
// Tabs work too (rows pasted from a spreadsheet), and so do two- or
// three-column CSV lines with quotes. Blank lines and lines starting with #
// are ignored. Each line is checked with the same limits as the Add fact form.
// Pure: no engine, no clock.
//
// Written by Claude Code (Opus 5.5), outside Kiro, at the developer's request; see .kiro/steering/authorship.md.

import { ANSWER_MAX, QUESTION_MAX, WHY_MAX } from "./fact-form"

export type ImportedFact = { question: string; answer: string; why: string }

export type SkippedLine = { line: number; reason: string }

export type ImportResult = { facts: ImportedFact[]; skipped: SkippedLine[] }

/** Splits one CSV line, honouring "quoted, fields" and "" for a quote. */
function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"' && cur.trim() === "") {
      quoted = true
      cur = ""
    } else if (c === ",") {
      out.push(cur)
      cur = ""
    } else cur += c
  }
  out.push(cur)
  return out
}

/** The fields of one line: by |, else by tab, else as CSV. */
function fieldsOf(line: string): string[] {
  if (line.includes("|")) return line.split("|")
  if (line.includes("\t")) return line.split("\t")
  return splitCsv(line)
}

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" }

/** Anki exports keep HTML in cells: line breaks become spaces, tags are dropped, common entities decoded. */
function plain(field: string): string {
  if (!/[<&]/.test(field)) return field
  return field
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e] ?? e)
    .replace(/\s+/g, " ")
}

const HEADER_QUESTION = new Set(["question", "front", "prompt", "q"])
const HEADER_ANSWER = new Set(["answer", "back", "a"])

/**
 * The text as records: a line is one record, except a CSV line that opens a
 * quote it does not close, which continues on the next lines (joined by spaces).
 * Each record keeps the number of the line it starts on.
 */
function records(text: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    let joined = lines[i]!
    const start = i + 1
    const csvLike = !joined.includes("|") && !joined.includes("\t") && !joined.trim().startsWith("#")
    while (csvLike && (joined.match(/"/g)?.length ?? 0) % 2 === 1 && i + 1 < lines.length) {
      i++
      joined += " " + lines[i]!
    }
    out.push({ line: start, text: joined })
  }
  return out
}

/** Reads pasted text; every line is either a fact or a skipped line with its reason. */
export function parseImport(text: string): ImportResult {
  const facts: ImportedFact[] = []
  const skipped: SkippedLine[] = []
  const seen = new Set<string>()
  let firstRow = true
  records(text).forEach(({ line, text: raw }) => {
    const trimmed = raw.trim()
    if (trimmed === "" || trimmed.startsWith("#")) return
    const fields = fieldsOf(trimmed).map((f) => plain(f).trim())
    if (firstRow) {
      firstRow = false
      if (HEADER_QUESTION.has((fields[0] ?? "").toLowerCase()) && HEADER_ANSWER.has((fields[1] ?? "").toLowerCase())) return
    }
    const [question = "", answer = "", ...rest] = fields
    const why = rest.join(", ").trim()
    if (question === "" || answer === "") {
      skipped.push({ line, reason: "needs a question and an answer, split by |" })
      return
    }
    if (question.length > QUESTION_MAX) {
      skipped.push({ line, reason: `the question is over ${QUESTION_MAX} characters` })
      return
    }
    if (answer.length > ANSWER_MAX) {
      skipped.push({ line, reason: `the answer is over ${ANSWER_MAX} characters` })
      return
    }
    if (why.length > WHY_MAX) {
      skipped.push({ line, reason: `"why it matters" is over ${WHY_MAX} characters` })
      return
    }
    const key = question.toLowerCase()
    if (seen.has(key)) {
      skipped.push({ line, reason: "the same question is on an earlier line" })
      return
    }
    seen.add(key)
    facts.push({ question, answer, why })
  })
  return { facts, skipped }
}
