// whatIf: the same replay as replay(), with one extra tend at time `at`.
// Source of truth: .kiro/specs/insight/requirements.md (Requirements 6 to 9)
// and design.md (sections 5 and 6).
//
// Whether `at` is valid is the engine's call: everything up to `at` is
// replayed and view(at) says whether the item is dead then. The what-if replay
// stops at the next recorded resurrection (the life that contains `at`), and
// the baseline uses the same cut, so diesAt and baselineDiesAt describe the
// same life. Neither number is checked against the other: with a policy whose
// tends can shorten a life, diesAt may be earlier.

import { DecayEngineError, MAX_FORECAST_HORIZON_MS } from "@decay-engine/engine"
import type { DecayPolicy, HistoryEntry, Item } from "@decay-engine/engine"
import { deathTime } from "./death-time"
import { checkHistory, checkHorizon, checkTime, jsonCopy, replayRange, startReplay, viewItem } from "./internal"
import type { ExtraTend, SkippedEntry, StopPoint, WhatIfOptions, WhatIfReason, WhatIfResult } from "./types"

// null when the event survives JSON, otherwise why not.
function eventProblem(event: unknown): string | null {
  let text: string | undefined
  try {
    text = JSON.stringify(event)
  } catch (error) {
    return `the event cannot be converted to JSON: ${error instanceof Error ? error.message : String(error)}`
  }
  if (text === undefined) return `the event is ${typeof event}, which JSON cannot represent`
  return null
}

function fail<Payload, PolicyData>(reason: WhatIfReason): WhatIfResult<Payload, PolicyData> {
  return { ok: false, reason }
}

/**
 * Replays the item with one extra tend at `at`, and returns the death of the
 * life that contains `at`, next to the same death without the extra tend.
 *
 * @param policy - The app's policy.
 * @param item - The item; only id, createdAt, payload, importance and costMinutes are read.
 * @param history - The item's recorded history, oldest first.
 * @param extra - `at`, strictly after createdAt and while the item is not dead, and the event.
 * @param options - horizonMs.
 * @returns `{ ok: true, diesAt, baselineDiesAt, ... }` or `{ ok: false, reason }`.
 *   Never throws for bad input; errors from the policy itself go through unchanged.
 */
export function whatIf<Payload, PolicyData, Event>(
  policy: DecayPolicy<Payload, PolicyData, Event>,
  item: Item<Payload, PolicyData>,
  history: readonly HistoryEntry[],
  extra: ExtraTend<Event>,
  options: WhatIfOptions = {}
): WhatIfResult<Payload, PolicyData> {
  const input = jsonCopy(item)
  const entries = jsonCopy(history) as HistoryEntry[]
  const opts = options ?? {}

  const historyReason = checkHistory(input, entries)
  if (historyReason !== null) return fail({ code: "replay-failed", reason: historyReason })
  const horizonReason = checkHorizon(opts.horizonMs)
  if (horizonReason !== null) return fail({ code: "replay-failed", reason: horizonReason })
  const horizonMs = opts.horizonMs ?? MAX_FORECAST_HORIZON_MS

  const at: unknown = extra?.at
  if (!checkTime(at)) {
    return fail({
      code: "invalid-at",
      message: `at must be a finite number from 0 to MAX_TIMESTAMP, got ${typeof at === "number" ? String(at) : typeof at}`,
    })
  }
  if (at <= input.createdAt) {
    return fail({ code: "at-not-after-creation", at, createdAt: input.createdAt })
  }
  const problem = eventProblem(extra.event)
  if (problem !== null) return fail({ code: "invalid-event", message: problem })
  const event = jsonCopy(extra.event)

  const id = input.id
  // k: first entry after `at`. cut: first recorded resurrection at or after k.
  let k = entries.findIndex((e) => e.timestamp > at)
  if (k === -1) k = entries.length
  let cut = entries.findIndex((e, i) => i >= k && e.type === "resurrected")
  if (cut === -1) cut = entries.length

  // What-if engine: everything up to `at`, then the extra tend.
  const startedW = startReplay(policy, input)
  if ("reason" in startedW) return fail({ code: "replay-failed", reason: startedW.reason })
  const w = startedW.engine
  const skipped: SkippedEntry[] = []
  const before = replayRange(w, id, entries, 1, k, skipped)
  if ("reason" in before) return fail({ code: "replay-failed", reason: before.reason })

  const atView = viewItem(w, id, at)
  if (atView.state === "dead") {
    if (atView.diedAt === undefined) {
      // The engine sets diedAt on every dead item; this is never reached.
      throw new Error(`whatIf: the engine returned dead item ${id} without diedAt`)
    }
    return fail({ code: "at-item-dead", at, diedAt: atView.diedAt })
  }

  w.tend(id, event, at)
  let last = at

  // The rest of the life that contains `at`.
  let stoppedAt: StopPoint | null = null
  for (let i = k; i < cut; i++) {
    const entry = entries[i]!
    if (entry.type === "tended") {
      try {
        w.tend(id, entry.event as Event, entry.timestamp)
      } catch (error) {
        if (error instanceof DecayEngineError && error.code === "ITEM_ALREADY_DEAD") {
          // In the what-if world this tend could not have happened.
          stoppedAt = { index: i, timestamp: entry.timestamp, why: "died-before-entry" }
          break
        }
        throw error
      }
      last = entry.timestamp
    } else if (entry.type === "edited" || entry.type === "resurrect-failed") {
      skipped.push({ index: i, type: entry.type, timestamp: entry.timestamp })
    }
  }
  if (stoppedAt === null && cut < entries.length) {
    stoppedAt = { index: cut, timestamp: entries[cut]!.timestamp, why: "next-life" }
  }
  const diesAt = deathTime(w, id, last, { horizonMs })

  // Baseline engine: the same entries up to the same cut, no extra tend.
  const startedB = startReplay(policy, input)
  if ("reason" in startedB) return fail({ code: "replay-failed", reason: startedB.reason })
  const b = startedB.engine
  const baseline = replayRange(b, id, entries, 1, cut, [])
  if ("reason" in baseline) return fail({ code: "replay-failed", reason: baseline.reason })
  const lastB = baseline.last ?? input.createdAt
  const baselineDiesAt = deathTime(b, id, lastB, { horizonMs })

  return {
    ok: true,
    at,
    diesAt,
    baselineDiesAt,
    item: viewItem(w, id, last),
    history: w.history(id),
    stoppedAt,
    skipped,
  }
}
