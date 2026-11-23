// Rescue Point (task R1; Requirement 22, design "Rescue Point"): for a dead
// fact, what one right review at the moment it went weak would have given. A
// what-if with a consequence, worked out by @decay-engine/insight's whatIf,
// which replays the fact's history in a throwaway engine with one extra
// review at report.wentWeakAt.
//
// Written by Kiro, on the pattern of apps/ghosted/src/rescue-sentence.ts. The
// words are rescueText in wording.ts; this file holds only the logic.
// autopsy-sentences.ts (Claude Code's) is never edited.
//
// Pure: no clock reads. Time comes only from the autopsy report and the
// whatIf result. No policy formula is written here: the only numbers are
// DEATH_TIME_PRECISION_MS and DAY_MS.

import type { AutopsyReport, HistoryEntry } from "@decay-engine/engine"
import { DEATH_TIME_PRECISION_MS, whatIf } from "@decay-engine/insight"
import { DAY_MS, studyDungeonPolicy, type Fact, type ReviewEvent } from "./policy"
import { rescueText } from "./wording"

/** The review the line assumes (Req 22.2): a right answer. */
export const RESCUE_EVENT: ReviewEvent = { kind: "review", correct: true }

/** What the line says, in times and whole days. */
export type RescuePoint = {
  /** The what-if's `at` (report.wentWeakAt). */
  at: number
  /** The what-if's diesAt: when the fact would have died. */
  until: number
  /** floor((diesAt − baselineDiesAt + DEATH_TIME_PRECISION_MS) / DAY_MS), at least 1. */
  extraDays: number
}

export type RescueSentenceOptions = {
  /** IANA time zone for dates, e.g. "UTC". Defaults to the viewer's zone. */
  timeZone?: string
  /** Locale for dates. Defaults to "en-GB" ("18 Nov 2026"). */
  locale?: string
}

/**
 * The rescue point of a dead fact, or null for no line (Req 22.3). The first
 * rule that holds gives null:
 * 1. no alive-to-weak crossing in this life (wentWeakAt is null);
 * 2. whatIf returns ok: false;
 * 3. whatIf stopped at a later life or a review it could not replay;
 * 4. a death time is null;
 * 5. the replayed baseline is more than DEATH_TIME_PRECISION_MS from the real
 *    death (the replay did not reproduce what happened);
 * 6. fewer than one whole day (for example when later wrong answers bring
 *    both lives to the same half-life).
 * Errors thrown by the policy are not caught.
 */
export function rescuePoint(
  fact: Fact,
  history: readonly HistoryEntry[],
  report: AutopsyReport<ReviewEvent>
): RescuePoint | null {
  if (report.wentWeakAt === null) return null
  const w = whatIf(studyDungeonPolicy, fact, history, { at: report.wentWeakAt, event: RESCUE_EVENT })
  if (!w.ok) return null
  if (w.stoppedAt !== null) return null
  if (w.diesAt === null || w.baselineDiesAt === null) return null
  if (Math.abs(w.baselineDiesAt - report.diedAt) > DEATH_TIME_PRECISION_MS) return null
  const extraDays = Math.floor((w.diesAt - w.baselineDiesAt + DEATH_TIME_PRECISION_MS) / DAY_MS)
  if (extraDays < 1) return null
  return { at: w.at, until: w.diesAt, extraDays }
}

/**
 * Formats a time as the cause sentences do. Copied from dateFormatter in
 * apps/study-dungeon/src/autopsy-sentences.ts (not exported there; that file
 * is never edited): the same locale default and the same Intl options.
 * rescue-sentence.test.ts checks that both give the same text, so a change
 * there fails the test.
 */
export function rescueDateFormatter(options: RescueSentenceOptions = {}): (ms: number) => string {
  const format = new Intl.DateTimeFormat(options.locale ?? "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
  })
  return (ms) => format.format(new Date(ms))
}

/** The sentence for a rescue point (Req 22.1, 22.6). */
export function rescueSentence(point: RescuePoint, options: RescueSentenceOptions = {}): string {
  const date = rescueDateFormatter(options)
  return rescueText.sentence(date(point.at), date(point.until), point.extraDays)
}

/** rescuePoint, then rescueSentence; null for no line. */
export function generateRescueSentence(
  fact: Fact,
  history: readonly HistoryEntry[],
  report: AutopsyReport<ReviewEvent>,
  options: RescueSentenceOptions = {}
): string | null {
  const point = rescuePoint(fact, history, report)
  return point === null ? null : rescueSentence(point, options)
}

/** The cause sentences with the rescue sentence second (Req 22.7). Returns `causes` itself when `rescue` is null. */
export function withRescue(causes: readonly string[], rescue: string | null): readonly string[] {
  if (rescue === null) return causes
  if (causes.length === 0) return [rescue]
  return [causes[0]!, rescue, ...causes.slice(1)]
}
