// Grouping, sorting and display helpers for the three lists (task 6.1).
// Source of truth: .kiro/specs/study-dungeon/requirements.md (Requirement 7)
// and tasks.md (task 6.1).
//
// Pure: every function takes items from engine.view(now) and, where needed,
// the same `now`. No clock reads. Inputs are never changed.

import { type Fact } from "./policy"
import { activePolicy } from "./policy-select"

export type FactState = Fact["state"]

/** Items split by state, each list in the order given. */
export type FactsByState = Record<FactState, Fact[]>

/** A Crypt entry: the fact and when it wakes up (health drops below 60). */
export type CryptEntry = { fact: Fact; wakeAt: number | null }

/** The three lists, sorted and ready to show. */
export type ThreeListsData = {
  crypt: CryptEntry[]
  dungeon: Fact[]
  graveyard: Fact[]
}

// Plain lexicographic order, so ties come out the same everywhere.
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Splits items into alive, weak and dead by their state, keeping their order. */
export function groupByState(items: readonly Fact[]): FactsByState {
  const groups: FactsByState = { alive: [], weak: [], dead: [] }
  for (const item of items) groups[item.state].push(item)
  return groups
}

/**
 * Crypt order: soonest wake-up first, ties by id. The wake-up time is
 * activePolicy().nextDueAt(fact, now); null (never) goes last.
 */
export function sortCrypt(alive: readonly Fact[], now: number): CryptEntry[] {
  return alive
    .map((fact) => ({ fact, wakeAt: activePolicy().nextDueAt(fact, now) }))
    .sort((a, b) => {
      if (a.wakeAt !== b.wakeAt) {
        if (a.wakeAt === null) return 1
        if (b.wakeAt === null) return -1
        return a.wakeAt - b.wakeAt
      }
      return compareIds(a.fact.id, b.fact.id)
    })
}

/** Dungeon order: weakest (lowest health) first, ties by id. */
export function sortDungeon(weak: readonly Fact[]): Fact[] {
  return [...weak].sort((a, b) => a.health - b.health || compareIds(a.id, b.id))
}

/** Graveyard order: most recent death first, ties by id (as engine.graveyard). */
export function sortGraveyard(dead: readonly Fact[]): Fact[] {
  return [...dead].sort((a, b) => (b.diedAt ?? 0) - (a.diedAt ?? 0) || compareIds(a.id, b.id))
}

/** All three lists from engine.view(now), grouped and sorted. */
export function buildLists(items: readonly Fact[], now: number): ThreeListsData {
  const groups = groupByState(items)
  return {
    crypt: sortCrypt(groups.alive, now),
    dungeon: sortDungeon(groups.weak),
    graveyard: sortGraveyard(groups.dead),
  }
}

/** The epitaph (payload.why) to show on a tombstone, or null when there is none. */
export function epitaphOf(fact: Fact): string | null {
  const why = fact.payload.why.trim()
  return why === "" ? null : why
}

/**
 * Health as a whole number, rounded down, so the number shown never
 * contradicts the state: a weak fact (health below 60) never shows 60.
 */
export function formatHealth(health: number): string {
  return String(Math.floor(health))
}

export type WakeUpFormatOptions = {
  /** IANA time zone, e.g. "UTC". Defaults to the viewer's zone. */
  timeZone?: string
  /** Defaults to "en-GB". */
  locale?: string
}

/** A wake-up time as "2 Oct 2026, 11:22" (24-hour clock). */
export function formatWakeUp(ms: number, options: WakeUpFormatOptions = {}): string {
  const parts = new Intl.DateTimeFormat(options.locale ?? "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
  }).formatToParts(new Date(ms))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ""
  return `${part("day")} ${part("month")} ${part("year")}, ${part("hour")}:${part("minute")}`
}

/** History entry types that reset a fact's health (its last "review"). */
const REVIEW_TYPES = new Set(["created", "tended", "resurrected"])

/**
 * The health a fact had right after its last review (or when it was added or
 * resurrected), from engine.history(id). Undefined when there is none.
 * The card shows the difference as "lost since last review".
 */
export function lastReviewHealth(entries: readonly { type: string; health?: number }[]): number | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!
    if (REVIEW_TYPES.has(entry.type) && typeof entry.health === "number") return entry.health
  }
  return undefined
}
