// Copied from apps/study-dungeon/src/import-facts.ts (Ghosted design section
// 1.3). Changed: one person per line instead of one fact; each line is checked
// with person-form.ts (Req 17.1, 21.6); a missing date means the import time;
// the duplicate skip is not copied, so repeated names are added as written
// (design open issue 1.5). splitCsv and fieldsOf are copied unchanged. No
// import from apps/study-dungeon (Req 21.1).
//
// Task P6 (Claude Code, outside Kiro, at the developer's request) changed that
// for one case: pasting the same list twice used to double everyone. A line is
// now skipped when its name AND relationship match an earlier line or someone
// already on the street (`duplicateReasons`). Two people with the same name
// and different relationships are still both added.
//
// One person per line, fields by position (Req 21.5):
//   name | relationship | rhythm days | last contact (YYYY-MM-DD)
// The relationship and the date may be empty: "Mira | | 30". Tabs work too
// (rows pasted from a spreadsheet), and so do CSV lines with quotes. Blank
// lines and lines starting with # are ignored. Pure: no engine, no clock.

import { isoDateAt, parseWholeNumber, validatePerson, type FieldError } from "./person-form"
import { dayStartOf } from "./time"
import { importText } from "./wording"

export type ImportedPerson = {
  name: string
  relationship: string // "" when left out
  rhythmDays: number // integer 1..365
  lastContactAt: number // dayStartOf(date, timeZone), or importedAt when no date
}

/** Every imported person gets these (Req 21.5); the import dialog states them. */
export const IMPORT_IMPORTANCE = 2
export const IMPORT_COST_MINUTES = 10

export type SkippedLine = { line: number; reason: string } // 1-based line number

export type ImportResult = { people: ImportedPerson[]; skipped: SkippedLine[] }

const FIELD_COUNT = 4

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

/**
 * Reads pasted text; every non-blank, non-# line is either a person or a
 * skipped line with its reason.
 *
 * @param importedAt - the real time of the import (ms): "today" for the date
 *   rule, and the last contact of a line with no date.
 */
export function parseImport(text: string, importedAt: number, timeZone?: string): ImportResult {
  const people: ImportedPerson[] = []
  const skipped: SkippedLine[] = []
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1
    const trimmed = raw.trim()
    if (trimmed === "" || trimmed.startsWith("#")) return

    const fields = fieldsOf(trimmed).map((f) => f.trim())
    // Empty trailing fields (a closing "|") are not extra fields.
    while (fields.length > FIELD_COUNT && fields[fields.length - 1] === "") fields.pop()
    if (fields.length > FIELD_COUNT) {
      skipped.push({ line, reason: importText.tooManyFields })
      return
    }
    const [name = "", relationship = "", rhythmText = "", date = ""] = fields

    const errors: FieldError[] = validatePerson(
      {
        name,
        relationship,
        rhythmDays: rhythmText,
        // No date: the import day, which always passes the date rule.
        lastContact: date === "" ? isoDateAt(importedAt, timeZone) : date,
        importance: IMPORT_IMPORTANCE,
        costMinutes: String(IMPORT_COST_MINUTES),
      },
      importedAt,
      timeZone
    )
    if (rhythmText === "") {
      const others = errors.filter((e) => e.field !== "rhythmDays").map((e) => e.rule)
      skipped.push({ line, reason: [importText.rhythmMissing, ...others].join("; ") })
      return
    }
    if (errors.length > 0) {
      skipped.push({ line, reason: errors.map((e) => e.rule).join("; ") })
      return
    }

    people.push({
      name,
      relationship,
      rhythmDays: parseWholeNumber(rhythmText)!,
      lastContactAt: date === "" ? importedAt : dayStartOf(date, timeZone),
    })
  })
  return { people, skipped }
}

/** Someone already on the street, as far as the duplicate rule needs. */
export type KnownPerson = { name: string; relationship: string }

const personKey = (p: KnownPerson): string => `${p.name.trim().toLowerCase()}|${p.relationship.trim().toLowerCase()}`

/**
 * Task P6. For each entry (a parsed person, or undefined for a blank or skipped line), the reason it
 * repeats someone, or undefined. "Repeats" means the same name and relationship, ignoring case and
 * surrounding spaces: with someone in `existing`, or with an earlier entry. The first one is kept.
 * Pure; the line numbers in the reasons are 1-based positions in `entries`.
 */
export function duplicateReasons(
  entries: ReadonlyArray<KnownPerson | undefined>,
  existing: readonly KnownPerson[]
): Array<string | undefined> {
  const known = new Set(existing.map(personKey))
  const firstLine = new Map<string, number>()
  return entries.map((entry, index) => {
    if (entry === undefined) return undefined
    const key = personKey(entry)
    if (known.has(key)) return importText.alreadyOnStreet
    const earlier = firstLine.get(key)
    if (earlier !== undefined) return importText.repeatsLine(earlier)
    firstLine.set(key, index + 1)
    return undefined
  })
}
