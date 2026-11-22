// Hero stats: souls banished and the review streak (task 12.1,
// Requirement 12.4-12.5). Pure functions over history entries; the
// HeroSection component reads the engine and passes the entries in.
//
// - Souls banished: every "tended" entry whose event was a right answer.
// - Streak: the run of consecutive calendar days, ending today or yesterday,
//   with at least one "tended" entry. Days are calendar days in the given
//   time zone (the viewer's own when none is given), so a review at 23:30 and
//   one at 00:30 the next morning count as two days.
//
// Only "tended" entries count, as the spec says: resurrect attempts do not.
//
// Written by Claude Code (Opus 5.5), outside Kiro, at the developer's request; see .kiro/steering/authorship.md.

import type { HistoryEntry } from "@decay-engine/engine"
import type { ReviewEvent } from "./policy"

type HistorySource = {
  view(now: number): Array<{ id: string }>
  history(id: string): HistoryEntry[]
}

/** Every history entry of every fact the engine holds at `now`. */
export function allHistory(engine: HistorySource, now: number): HistoryEntry[] {
  return engine.view(now).flatMap((item) => engine.history(item.id))
}

/** Requirement 12.4: "tended" entries with a right answer. */
export function countSoulsBanished(entries: readonly HistoryEntry[]): number {
  return entries.filter((e) => e.type === "tended" && (e.event as ReviewEvent).correct === true).length
}

export type StreakOptions = {
  /** IANA time zone for calendar days, e.g. "UTC". Defaults to the viewer's zone. */
  timeZone?: string
}

/**
 * Requirement 12.5: consecutive days with at least one review, ending today
 * or yesterday (a streak is not lost until a whole day passes without one).
 * Reviews after `now` are ignored. Returns 0 when neither today nor
 * yesterday has a review.
 */
export function currentStreak(entries: readonly HistoryEntry[], now: number, options: StreakOptions = {}): number {
  const dayOf = dayKeyFormatter(options.timeZone)
  const reviewDays = new Set(
    entries.filter((e) => e.type === "tended" && e.timestamp <= now).map((e) => dayOf(e.timestamp))
  )
  const today = dayOf(now)
  let day = reviewDays.has(today) ? today : previousDay(today)
  let streak = 0
  while (reviewDays.has(day)) {
    streak += 1
    day = previousDay(day)
  }
  return streak
}

/** "YYYY-MM-DD" for the calendar day of `ms` in the time zone. */
function dayKeyFormatter(timeZone: string | undefined): (ms: number) => string {
  const format = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone === undefined ? {} : { timeZone }),
  })
  return (ms) => {
    const parts = Object.fromEntries(format.formatToParts(new Date(ms)).map((p) => [p.type, p.value]))
    return `${parts.year}-${parts.month}-${parts.day}`
  }
}

/** The calendar day before a "YYYY-MM-DD" key. Pure calendar arithmetic, so daylight-saving changes cannot skip or repeat a day. */
export function previousDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d - 1))
  return date.toISOString().slice(0, 10)
}
