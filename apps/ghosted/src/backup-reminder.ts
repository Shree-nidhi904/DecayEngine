// The backup reminder: a nudge to save a copy to a file once it has been a
// while since the last one. The data lives only in this browser, so a cleared
// browser or a lost device takes it; a file is the only other copy there is.
//
// The rule (shouldNudge) is pure. Three flags in localStorage feed it:
// when a backup was last made, when this app first held data (so a brand-new
// user is not nagged on day one), and how long a dismissal lasts. All three
// are in RESET_KEYS (first-run.ts), so "Reset all data" starts the count over.
//

import type { FlagStorage } from "./first-run"

export const LAST_BACKUP_KEY = "ghosted:last-backup"
export const FIRST_SEEN_KEY = "ghosted:first-seen"
export const SNOOZE_KEY = "ghosted:backup-snooze"

export const DAY_MS = 24 * 60 * 60 * 1000
/** Days after the last backup (or first use) before the nudge shows. */
export const BACKUP_REMINDER_DAYS = 7
/** Days a dismissal hides the nudge. */
export const SNOOZE_DAYS = 7

export interface NudgeInput {
  now: number
  /** Whether there is anything worth backing up. */
  hasData: boolean
  lastBackupAt: number | null
  firstSeenAt: number | null
  snoozedUntil: number | null
  days?: number
}

/** Whether to show the nudge now. */
export function shouldNudge({ now, hasData, lastBackupAt, firstSeenAt, snoozedUntil, days = BACKUP_REMINDER_DAYS }: NudgeInput): boolean {
  if (!hasData) return false
  if (snoozedUntil !== null && now < snoozedUntil) return false
  const since = lastBackupAt ?? firstSeenAt
  if (since === null) return false
  return now - since >= days * DAY_MS
}

/** A saved millisecond time, or null when missing or not a number. */
function readTime(storage: Pick<FlagStorage, "getItem">, key: string): number | null {
  try {
    const text = storage.getItem(key)
    if (text === null) return null
    const value = Number(text)
    return Number.isFinite(value) && value >= 0 ? value : null
  } catch {
    return null
  }
}

/** Writes never throw: a full storage must not break the app over a reminder. */
function writeTime(storage: Pick<FlagStorage, "setItem">, key: string, value: number): void {
  try {
    storage.setItem(key, String(Math.floor(value)))
  } catch {
    // The reminder is best effort.
  }
}

export function readNudgeInput(storage: Pick<FlagStorage, "getItem">, now: number, hasData: boolean): NudgeInput {
  return {
    now,
    hasData,
    lastBackupAt: readTime(storage, LAST_BACKUP_KEY),
    firstSeenAt: readTime(storage, FIRST_SEEN_KEY),
    snoozedUntil: readTime(storage, SNOOZE_KEY),
  }
}

/** Whole days since `since`, at least 0. */
export function daysSince(now: number, since: number): number {
  return Math.max(0, Math.floor((now - since) / DAY_MS))
}

type Listener = () => void
const listeners = new Set<Listener>()

/** Calls `listener` after any change to the reminder's flags. Returns a stop function. */
export function subscribeToReminder(listener: Listener): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

const changed = () => listeners.forEach((l) => l())

/** Records a successful backup. Clears any dismissal. */
export function markBackedUp(storage: Pick<FlagStorage, "setItem" | "removeItem">, now: number): void {
  writeTime(storage, LAST_BACKUP_KEY, now)
  try {
    storage.removeItem(SNOOZE_KEY)
  } catch {
    // Best effort.
  }
  changed()
}

/** Hides the nudge for SNOOZE_DAYS. */
export function snooze(storage: Pick<FlagStorage, "setItem">, now: number): void {
  writeTime(storage, SNOOZE_KEY, now + SNOOZE_DAYS * DAY_MS)
  changed()
}

/** Remembers when the app first held data, once. */
export function markFirstSeen(storage: Pick<FlagStorage, "getItem" | "setItem">, now: number): void {
  if (readTime(storage, FIRST_SEEN_KEY) === null) writeTime(storage, FIRST_SEEN_KEY, now)
}
