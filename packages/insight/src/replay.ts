// replay: rebuilds an item from its history in a throwaway engine.
// Source of truth: .kiro/specs/insight/requirements.md (Requirements 2 to 4, 8, 9)
// and design.md (section 4).
//
// Known limits (the history does not record them): the replay starts from the
// item's current payload, importance and costMinutes; edited and
// resurrect-failed entries are skipped; policyData is rebuilt by the policy,
// never copied from the input item. See the README.

import { MAX_FORECAST_HORIZON_MS } from "@decay-engine/engine"
import type { DecayPolicy, HistoryEntry, Item } from "@decay-engine/engine"
import { deathTime } from "./death-time"
import { checkHistory, checkHorizon, checkTime, jsonCopy, replayRange, startReplay, viewItem } from "./internal"
import type { ReplayOptions, ReplayResult, SkippedEntry } from "./types"

/**
 * Rebuilds the item in a new DecayEngine on an InMemoryAdapter: addItem at
 * createdAt, then tend or resurrect for each recorded tended or resurrected
 * entry, with the recorded events and timestamps, then tick(until).
 *
 * @param policy - The app's policy (the same one that made the history).
 * @param item - The item; only id, createdAt, payload, importance and costMinutes are read.
 * @param history - The item's recorded history, oldest first.
 * @param options - until (default: the last entry's timestamp) and horizonMs.
 * @returns The replayed item, its history, its death time and the skipped
 *   entries, or `{ ok: false, reason }`. Never throws for bad input; errors
 *   from the policy itself go through unchanged.
 */
export function replay<Payload, PolicyData, Event>(
  policy: DecayPolicy<Payload, PolicyData, Event>,
  item: Item<Payload, PolicyData>,
  history: readonly HistoryEntry[],
  options: ReplayOptions = {}
): ReplayResult<Payload, PolicyData> {
  const input = jsonCopy(item)
  const entries = jsonCopy(history) as HistoryEntry[]
  const opts = options ?? {}

  const historyReason = checkHistory(input, entries)
  if (historyReason !== null) return { ok: false, reason: historyReason }

  const lastTimestamp = entries[entries.length - 1]!.timestamp
  let until = lastTimestamp
  if (opts.until !== undefined) {
    if (!checkTime(opts.until) || opts.until < lastTimestamp) {
      return {
        ok: false,
        reason: {
          code: "invalid-options",
          option: "until",
          message: `until must be a finite number from 0 to MAX_TIMESTAMP, at or after the last entry (${lastTimestamp}), got ${String(opts.until)}`,
        },
      }
    }
    until = opts.until
  }

  const horizonReason = checkHorizon(opts.horizonMs)
  if (horizonReason !== null) return { ok: false, reason: horizonReason }
  const horizonMs = opts.horizonMs ?? MAX_FORECAST_HORIZON_MS

  const started = startReplay(policy, input)
  if ("reason" in started) return { ok: false, reason: started.reason }
  const { engine } = started

  const skipped: SkippedEntry[] = []
  const replayed = replayRange(engine, input.id, entries, 1, entries.length, skipped)
  if ("reason" in replayed) return { ok: false, reason: replayed.reason }

  // Every replayed call is at or before lastTimestamp <= until, so this never goes backward.
  engine.tick(until)

  return {
    ok: true,
    item: viewItem(engine, input.id, until),
    history: engine.history(input.id),
    diesAt: deathTime(engine, input.id, until, { horizonMs }),
    until,
    skipped,
  }
}
