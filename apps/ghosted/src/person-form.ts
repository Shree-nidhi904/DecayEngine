// Field rules for adding and editing a person, shared by the form and the
// import (Ghosted task 2.6; design section 1.3; Requirements 17.1, 17.3, 17.7).
// Modelled on apps/study-dungeon/src/fact-form.ts, not imported from it
// (Req 21.1).
//
// - name: required, 1 to 60 characters
// - relationship: optional, at most 40 characters
// - rhythm: a whole number of days from 1 to 365
// - last contact: a YYYY-MM-DD date, not later than today
// - importance: 1, 2 or 3
// - minutes to reach out: a whole number from 1 to 600
//
// Pure: no React, no engine, no clock; `today` and the time zone are passed
// in. Name and relationship are trimmed before they are checked. Lengths are
// counted in UTF-16 code units, the unit an input's maxLength uses. The input
// is never changed, so the form can keep what the user typed (Req 17.7).

import type { Person, PersonPayload } from "./policy"
import { ghostedPolicy } from "./policy"
import { dayStartOf } from "./time"
import { personFormRules } from "./wording"

export const NAME_MAX = 60
export const RELATIONSHIP_MAX = 40
export const RHYTHM_MIN = 1
export const RHYTHM_MAX = 365
export const COST_MIN = 1
export const COST_MAX = 600

/** The values as the user typed them. */
export type PersonFormInput = {
  name: string
  relationship: string
  rhythmDays: string // as typed
  lastContact: string // "YYYY-MM-DD"
  importance: number // from the radio
  costMinutes: string // as typed
}

export type PersonField = "name" | "relationship" | "rhythmDays" | "lastContact" | "importance" | "costMinutes"

/** One broken rule: the field and the rule in words (Req 17.7). */
export type FieldError = { field: PersonField; rule: string }

const WHOLE_NUMBER = /^\d+$/

/** The whole number in `text` (digits only after trimming), or null. */
export function parseWholeNumber(text: string): number | null {
  const trimmed = text.trim()
  return WHOLE_NUMBER.test(trimmed) ? Number(trimmed) : null
}

/** The calendar date ("YYYY-MM-DD") of instant `ms` in `timeZone`. */
export function isoDateAt(ms: number, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms))
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value
  return `${get("year").padStart(4, "0")}-${get("month")}-${get("day")}`
}

function isRealDate(isoDate: string): boolean {
  try {
    dayStartOf(isoDate, "UTC")
    return true
  } catch {
    return false
  }
}

/**
 * Checks every field and returns one error per field that breaks its rule,
 * in field order. An empty list means the input can be saved.
 *
 * @param today - the real time now (ms); the last contact's calendar day must
 *   be on or before today's calendar day in `timeZone`.
 */
export function validatePerson(input: PersonFormInput, today: number, timeZone?: string): FieldError[] {
  const errors: FieldError[] = []

  const name = input.name.trim()
  if (name.length < 1 || name.length > NAME_MAX) errors.push({ field: "name", rule: personFormRules.name })

  if (input.relationship.trim().length > RELATIONSHIP_MAX) {
    errors.push({ field: "relationship", rule: personFormRules.relationship })
  }

  const rhythm = parseWholeNumber(input.rhythmDays)
  if (rhythm === null || rhythm < RHYTHM_MIN || rhythm > RHYTHM_MAX) {
    errors.push({ field: "rhythmDays", rule: personFormRules.rhythmDays })
  }

  const date = input.lastContact.trim()
  if (!isRealDate(date)) {
    errors.push({ field: "lastContact", rule: personFormRules.lastContactDate })
  } else if (date > isoDateAt(today, timeZone)) {
    // Both are YYYY-MM-DD, so string order is date order.
    errors.push({ field: "lastContact", rule: personFormRules.lastContactFuture })
  }

  if (!Number.isInteger(input.importance) || input.importance < 1 || input.importance > 3) {
    errors.push({ field: "importance", rule: personFormRules.importance })
  }

  const cost = parseWholeNumber(input.costMinutes)
  if (cost === null || cost < COST_MIN || cost > COST_MAX) {
    errors.push({ field: "costMinutes", rule: personFormRules.costMinutes })
  }

  return errors
}

/**
 * Whether a person added at `addedAt` with this rhythm and last contact
 * starts dark (Req 17.3): ghostedPolicy.healthAt on the provisional item is
 * below thresholds.dead. Calls the policy and does not repeat its formula.
 */
export function startsDark(rhythmDays: number, lastContactAt: number, addedAt: number): boolean {
  const payload: PersonPayload = { name: "", relationship: "", rhythmDays, lastContactAt }
  const provisional: Person = {
    id: "provisional",
    payload,
    policyData: ghostedPolicy.init(payload, addedAt),
    health: 100,
    state: "alive",
    createdAt: addedAt,
    lastEventAt: addedAt,
    timesResurrected: 0,
    importance: 1,
    costMinutes: 1,
  }
  return ghostedPolicy.healthAt(provisional, addedAt) < ghostedPolicy.thresholds.dead
}
