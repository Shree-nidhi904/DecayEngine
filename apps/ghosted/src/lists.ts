// Grouping, ordering and small facts for the person views (design sections
// 4.1 and 4.4; Req 11, 13.1, 16.2). Pure: every time is passed in, nothing
// reads the clock, and nothing repeats a policy formula (the Still lit order
// and "starts fading" call ghostedPolicy.nextDueAt).

import type { HistoryEntry } from "@decay-engine/engine"
import type { ItemState } from "@decay-engine/shell"
import { ghostedPolicy, type Person, type PersonPayload } from "./policy"
import { DAY_MS } from "./time"

/** The state a view shows: "litAgain" is alive after at least one reconnect (Req 16.2). */
export type ShownState = ItemState | "litAgain"

/** The Street and the three lists, as the section navigation names them (Req 11.5). */
export type SectionId = "street" | "fading" | "empty" | "still"

/** What every read-only view gets from the App, computed once per render (design section 4.1). */
export interface StreetView {
  /** realNow + previewOffsetMs. */
  now: number
  realNow: number
  /** engine.view(now). */
  people: readonly Person[]
  /** id → diesAt, from engine.forecast(now, MAX_FORECAST_HORIZON_MS). */
  darkAt: ReadonlyMap<string, number>
  /** Bumped after every write. */
  version: number
}

/** Set while previewing ("Future preview · nothing is saved"); every write control shows it. */
export type BlockedReason = string | undefined

/** Plain lexicographic id order, the engine's tie-break (independent of locale). */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** dead, weak, litAgain (alive and reconnected at least once) or alive. */
export function shownState(person: Person): ShownState {
  if (person.state === "alive" && person.timesResurrected > 0) return "litAgain"
  return person.state
}

/**
 * The time of the last contact the user logged: the latest "tended" or
 * "resurrected" entry, or the date given when the person was added. Never
 * policyData.lastContactAt, which a text moves back in time (Req 13.1).
 */
export function lastLoggedContactAt(history: readonly HistoryEntry[], payload: PersonPayload): number {
  let latest: number | null = null
  for (const entry of history) {
    if (entry.type !== "tended" && entry.type !== "resurrected") continue
    if (latest === null || entry.timestamp >= latest) latest = entry.timestamp
  }
  return latest ?? payload.lastContactAt
}

/** Fading: weak people, lowest freshness first, ties by id (Req 11.1). */
export function sortFading(people: readonly Person[]): Person[] {
  return people
    .filter((p) => p.state === "weak")
    .sort((a, b) => a.health - b.health || compareIds(a.id, b.id))
}

/**
 * Empty windows: dead people, most recently dark first, ties by id: the
 * engine's graveyard order, rebuilt from `people` because a death seen in a
 * preview exists only in view(now) (Req 11.2).
 */
export function sortEmpty(people: readonly Person[]): Person[] {
  return people
    .filter((p) => p.state === "dead")
    .sort((a, b) => (b.diedAt ?? 0) - (a.diedAt ?? 0) || compareIds(a.id, b.id))
}

/** A Still lit row: the person and when they start fading. */
export type StillLitRow = { person: Person; fadesAt: number }

/** Still lit: alive people, soonest to fade first (ghostedPolicy.nextDueAt), ties by id (Req 11.3). */
export function sortStillLit(people: readonly Person[], now: number): StillLitRow[] {
  const rows: StillLitRow[] = []
  for (const person of people) {
    if (person.state !== "alive") continue
    const fadesAt = ghostedPolicy.nextDueAt(person, now)
    if (fadesAt === null) continue // cannot happen for a lit person; never shown as "fading in NaN days"
    rows.push({ person, fadesAt })
  }
  return rows.sort((a, b) => a.fadesAt - b.fadesAt || compareIds(a.person.id, b.person.id))
}

/** Whole days until a lit person starts fading, rounded up, never below 0. */
export function daysUntilFading(fadesAt: number, now: number): number {
  return Math.max(0, Math.ceil((fadesAt - now) / DAY_MS))
}

/** The hero's person: the weak person with the lowest freshness, ties by id (Req 8.1). */
export function heroTarget(people: readonly Person[]): Person | undefined {
  return sortFading(people)[0]
}

/** How many people are in each state. */
export function stateCounts(people: readonly Person[]): Record<ItemState, number> {
  const counts: Record<ItemState, number> = { alive: 0, weak: 0, dead: 0 }
  for (const p of people) counts[p.state]++
  return counts
}

/** The first word of a name: "Dan" for "Dan Okafor" (the hero's button, the Street's windows). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

/** Freshness as shown: rounded down, so 59.6 never reads as a lit 60 (design section 4.1). */
export function shownFreshness(health: number): number {
  return Math.floor(health)
}
