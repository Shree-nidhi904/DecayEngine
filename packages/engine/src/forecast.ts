// Forecast (Crystal Ball): which items die within a time horizon.
// Source of truth: .kiro/specs/engine/requirements.md (Requirement 17d).
//
// Internal module: the public API is engine.forecast, which validates `now`
// and horizonMs before calling this function.
//
// Each item is settled at `now` in memory (nothing is saved). Items dead at
// `now` are skipped. For the rest, findDeathAfter bisects for the earliest time
// at which the item is already dead, so view(diesAt) shows it dead
// (Requirement 17d.7, via the bisection rule in Requirement 17a).

import { findDeathAfter } from "./bisection"
import { settle } from "./settle"
import { MAX_TIMESTAMP } from "./types"
import type { DecayPolicy, ForecastEntry, Item } from "./types"

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Items that die in (now, now + horizonMs], soonest first, ties by id
 * ascending. Pure and read-only. Returned items are copies of the items as
 * settled at `now`.
 */
export function forecast<Payload, PolicyData>(
  items: Iterable<Item<Payload, PolicyData>>,
  now: number,
  horizonMs: number,
  policy: DecayPolicy<Payload, PolicyData, unknown>
): ForecastEntry<Payload, PolicyData>[] {
  // Never search past the largest valid timestamp, so view(diesAt) accepts every diesAt
  const end = Math.min(now + horizonMs, MAX_TIMESTAMP)
  const entries: ForecastEntry<Payload, PolicyData>[] = []

  for (const stored of items) {
    const item = settle(stored, policy, now).item
    if (item.state === "dead") continue

    // An item whose lastEventAt is after `now` is returned by settle as stored.
    // Search from its lastEventAt: healthAt is only defined forward from there,
    // and view() shows such an item as stored until that time.
    const from = Math.max(now, item.lastEventAt)
    if (from >= end) continue

    const diesAt = findDeathAfter(item, policy, from, end)
    if (diesAt === null || diesAt > end) continue

    entries.push({
      item: JSON.parse(JSON.stringify(item)) as Item<Payload, PolicyData>,
      diesAt,
    })
  }

  return entries.sort((a, b) => a.diesAt - b.diesAt || compareIds(a.item.id, b.item.id))
}
