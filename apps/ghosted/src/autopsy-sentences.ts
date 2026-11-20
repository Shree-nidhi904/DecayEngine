// Ghosted cause-of-death sentences: turns the engine's autopsy report (facts
// only) into the words shown in the autopsy dialog.
// Source of truth: .kiro/specs/ghosted/requirements.md (Requirement 19 and 31)
// and design.md section 2.3.
//
// Written by Claude Code (Sonnet 5.5) at the developer's request, outside Kiro,
// in place of the developer's hand-written version; see
// .kiro/steering/authorship.md. Kiro never edits this file.
//
// Pure: no clock reads. Dates are formatted with Intl in the given time zone
// (the viewer's own zone when none is given), so tests pass a fixed zone.
//
// Wording: the light shows connection freshness, never how much anyone cares.
// No sentence blames either person (Requirement 31).

import type { AutopsyReport } from "@decay-engine/engine"
import type { ContactEvent, PersonPayload } from "./policy"
import { DAY_MS } from "./time"

export type CauseSentenceOptions = {
  /** IANA time zone for dates, e.g. "UTC". Defaults to the viewer's zone. */
  timeZone?: string
  /** Locale for dates. Defaults to "en-GB" ("18 Nov 2026"). */
  locale?: string
}

type Kind = ContactEvent["kind"]

const KIND_NOUN: Record<Kind, { one: string; many: string }> = {
  text: { one: "message", many: "messages" },
  call: { one: "call", many: "calls" },
  meetup: { one: "meet-up", many: "meet-ups" },
}

/**
 * Cause-of-death sentences for a person whose window went dark, in display
 * order. The first sentence is the cause; the rest are the supporting facts.
 *
 * Req 19.3: "After the last call there was no contact for 81 days, about 2.7
 * times your usual rhythm." Req 19.6: for a person added already dark (the
 * life starts and ends at the same moment, with no contact logged), the gap is
 * measured from payload.lastContactAt to the time they went dark, in whole days,
 * always at least 1, and the sentence never says "0 days".
 */
export function generateCauseSentences(
  report: AutopsyReport<ContactEvent>,
  payload: PersonPayload,
  options: CauseSentenceOptions = {}
): string[] {
  const date = dateFormatter(options)
  const rhythmMs = payload.rhythmDays * DAY_MS
  const resurrected = report.timesResurrected > 0
  const startedDark =
    !resurrected && report.lifeStartedAt === report.diedAt && report.tends.length === 0

  const sentences: string[] = []

  if (startedDark) {
    // The silence in the report is 0 here; the real gap began before the person was added.
    const gapMs = Math.max(0, report.diedAt - payload.lastContactAt)
    sentences.push(
      `Already dark when added: no contact for ${wholeDays(gapMs, true)}, ${ratioText(gapMs, rhythmMs)}.`
    )
    sentences.push(`Last contact was on ${date(payload.lastContactAt)}.`)
    sentences.push(`The window was added on ${date(report.createdAt)}, after it had already gone dark.`)
    sentences.push(closingLine)
    return sentences
  }

  // 1. The cause.
  if (report.lastTend !== null) {
    sentences.push(
      `After the last ${KIND_NOUN[report.lastTend.event.kind].one} there was no contact for ${wholeDays(report.silenceMs)}, ${ratioText(report.silenceMs, rhythmMs)}.`
    )
  } else if (resurrected) {
    sentences.push(
      `After the window was lit again there was no contact for ${wholeDays(report.silenceMs)}, ${ratioText(report.silenceMs, rhythmMs)}.`
    )
  } else {
    // Never tended: the quiet stretch began at the last contact given when the person was added.
    const gapMs = Math.max(0, report.diedAt - payload.lastContactAt)
    sentences.push(
      `After the last contact on ${date(payload.lastContactAt)} there was no contact for ${wholeDays(gapMs)}, ${ratioText(gapMs, rhythmMs)}.`
    )
  }

  // 2. The supporting facts.
  if (report.wentWeakAt !== null) {
    sentences.push(`The window started fading on ${date(report.wentWeakAt)}.`)
  }
  sentences.push(`It went dark on ${date(report.diedAt)}.`)

  if (report.lastTend !== null) {
    sentences.push(
      `The last contact was on ${date(report.lastTend.at)} (${withArticle(KIND_NOUN[report.lastTend.event.kind].one)}).`
    )
  }

  if (report.tends.length > 0) {
    sentences.push(`${plural(report.tends.length, "contact")} logged in this life: ${breakdown(report)}.`)
  } else {
    sentences.push(resurrected ? "No contact was logged after it was lit again." : "No contact was logged after it was added.")
  }

  if (resurrected) {
    sentences.push(`The window had been lit again ${times(report.timesResurrected)}.`)
  }

  sentences.push(closingLine)
  return sentences
}

const closingLine = "The light shows how recently you were in touch, not how much anyone matters."

/** "1 day", "9 days"; "less than a day" under one day unless `atLeastOne`. Never "0 days". */
function wholeDays(ms: number, atLeastOne = false): string {
  const whole = Math.floor(ms / DAY_MS)
  if (whole < 1) return atLeastOne ? "1 day" : "less than a day"
  return plural(whole, "day")
}

/** "about 2.7 times your usual rhythm". */
function ratioText(ms: number, rhythmMs: number): string {
  const ratio = Number((ms / rhythmMs).toFixed(1))
  return `about ${ratio === 1 ? "1 time" : `${ratio} times`} your usual rhythm`
}

/** "2 messages, 1 call" in the order text, call, meet-up (only kinds that occur). */
function breakdown(report: AutopsyReport<ContactEvent>): string {
  const counts: Record<Kind, number> = { text: 0, call: 0, meetup: 0 }
  for (const tend of report.tends) counts[tend.event.kind] += 1
  return (["text", "call", "meetup"] as const)
    .filter((kind) => counts[kind] > 0)
    .map((kind) => `${counts[kind]} ${counts[kind] === 1 ? KIND_NOUN[kind].one : KIND_NOUN[kind].many}`)
    .join(", ")
}

function withArticle(noun: string): string {
  return /^[aeiou]/.test(noun) ? `an ${noun}` : `a ${noun}`
}

function dateFormatter(options: CauseSentenceOptions): (ms: number) => string {
  const format = new Intl.DateTimeFormat(options.locale ?? "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
  })
  return (ms) => format.format(new Date(ms))
}

function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`
}

function times(n: number): string {
  return n === 1 ? "once" : n === 2 ? "twice" : `${n} times`
}
