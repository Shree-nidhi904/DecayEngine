// Autopsy: the facts of how an item died, read from its history.
// Source of truth: .kiro/specs/engine/requirements.md (Requirement 17c).
//
// Written by Claude Code (not hand-written); see docs/KIRO_LOG.md.
//
// Internal module: the public API is engine.autopsy.
//
// Facts only, never sentences: apps turn the report into words.
// "This life" runs from the most recent resurrection (or creation) up to and
// including the most recent death. It is found by position in the history,
// not by timestamp, so a resurrection and a death recorded at the same
// moment are still told apart.

import { DecayEngineError } from "./errors"
import { settle } from "./settle"
import type { AutopsyReport, DecayPolicy, HistoryEntry, Item } from "./types"

/**
 * Builds the autopsy report for an item that is dead at `now`. Pure and
 * read-only: the item is settled in memory (so a death that has happened but
 * was never ticked is found, with its bisected diedAt) and nothing is saved.
 * `now` must already be validated by the caller (the engine).
 */
export function autopsy<Payload, PolicyData, Event>(
  item: Item<Payload, PolicyData>,
  history: readonly HistoryEntry[],
  policy: DecayPolicy<Payload, PolicyData, unknown>,
  now: number
): AutopsyReport<Event> {
  const settled = settle(item, policy, now)
  const dead = settled.item
  if (dead.state !== "dead" || dead.diedAt === undefined) {
    throw new DecayEngineError(
      "AUTOPSY_REQUIRES_DEAD_ITEM",
      `autopsy failed: item ${item.id} is ${dead.state} at now=${now}; autopsy requires a dead item`
    )
  }
  const diedAt = dead.diedAt

  // Stored history plus anything settling just found (always later entries).
  const entries = [...history, ...settled.historyEntries]

  // This life: after the last "resurrected" entry, up to and including the last "died".
  const deathIndex = findLastIndex(entries, (e) => e.type === "died")
  const end = deathIndex === -1 ? entries.length : deathIndex
  const lastResurrection = findLastIndex(entries.slice(0, end), (e) => e.type === "resurrected")
  const lifeStartedAt = lastResurrection === -1 ? dead.createdAt : entries[lastResurrection]!.timestamp
  const life = entries.slice(lastResurrection + 1, end)

  let wentWeakAt: number | null = null
  const tends: AutopsyReport<Event>["tends"] = []
  let previousAt = lifeStartedAt

  for (const entry of life) {
    if (entry.type === "state-changed") {
      if (entry.from === "alive" && entry.to === "weak") {
        wentWeakAt = entry.timestamp
      } else if (entry.to === "alive") {
        // Recovered before dying: the weak spell did not lead to this death.
        wentWeakAt = null
      }
    } else if (entry.type === "tended") {
      tends.push({
        at: entry.timestamp,
        event: entry.event as Event,
        gapBeforeMs: entry.timestamp - previousAt,
      })
      previousAt = entry.timestamp
    }
  }

  const last = tends[tends.length - 1]
  const lastTend = last === undefined ? null : { at: last.at, event: last.event }

  return {
    createdAt: dead.createdAt,
    diedAt,
    wentWeakAt,
    lifeStartedAt,
    lastTend,
    silenceMs: diedAt - (lastTend?.at ?? lifeStartedAt),
    tends,
    timesResurrected: dead.timesResurrected,
    failedResurrections: entries.filter((e) => e.type === "resurrect-failed").length,
  }
}

function findLastIndex<T>(array: readonly T[], predicate: (value: T) => boolean): number {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i]!)) return i
  }
  return -1
}
