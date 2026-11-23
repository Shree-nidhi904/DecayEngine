// Public types of @decay-engine/insight.
// Source of truth: .kiro/specs/insight/design.md (section 3.2).
//
// Every result and reason is plain JSON: "no value" is null, never undefined.

import type { HistoryEntry, Item } from "@decay-engine/engine"

/**
 * The engine's death-time precision in milliseconds. Matches the engine's
 * BISECT_PRECISION_MS in packages/engine/src/bisection.ts (engine Requirement 17a),
 * which the engine does not export, so the number is written again here.
 * Two engine death times for the same crossing, worked out over different
 * intervals, differ by at most this much.
 */
export const DEATH_TIME_PRECISION_MS = 60_000

/** Options for deathTime. horizonMs defaults to the engine's MAX_FORECAST_HORIZON_MS (10 years). */
export type DeathTimeOptions = { horizonMs?: number }

/**
 * Options for replay.
 * until: the time the replay engine ticks to after the last entry (default: the last entry's timestamp).
 * horizonMs: how far ahead to look for the death (default MAX_FORECAST_HORIZON_MS).
 */
export type ReplayOptions = { until?: number; horizonMs?: number }

/** Options for whatIf. */
export type WhatIfOptions = { horizonMs?: number }

/** The one tend whatIf inserts. */
export type ExtraTend<Event> = { at: number; event: Event }

/** A recorded entry that replay does not turn into an engine call. */
export type SkippedEntry = {
  /** Position in the recorded history. */
  index: number
  type: "edited" | "resurrect-failed"
  timestamp: number
}

/** What is wrong with a recorded history, in the order replay checks for it. */
export type HistoryProblem =
  | "empty"
  | "first-not-created"
  | "created-time-mismatch"
  | "other-item"
  | "bad-timestamp"
  | "out-of-order"
  | "second-created"
  | "unknown-type"

/** Why replay could not rebuild the item. */
export type ReplayReason =
  | { code: "invalid-history"; problem: HistoryProblem; index: number | null }
  | { code: "invalid-item"; engineCode: string; message: string }
  | { code: "invalid-options"; option: "until" | "horizonMs"; message: string }
  | {
      code: "diverged"
      index: number
      timestamp: number
      entryType: "tended" | "resurrected"
      engineCode: "ITEM_ALREADY_DEAD" | "ITEM_NOT_DEAD" | "RESURRECT_REFUSED"
      policyReason: string | null
    }

/** Result of replay. */
export type ReplayResult<Payload, PolicyData> =
  | {
      ok: true
      /** The replay engine's view(until) of the item. */
      item: Item<Payload, PolicyData>
      /** The replay engine's history for the item. */
      history: HistoryEntry[]
      /** deathTime(replay engine, id, until), or null if it does not die within the horizon. */
      diesAt: number | null
      until: number
      skipped: SkippedEntry[]
    }
  | { ok: false; reason: ReplayReason }

/** Where whatIf stopped replaying recorded entries. */
export type StopPoint = {
  index: number
  timestamp: number
  why: "next-life" | "died-before-entry"
}

/** Why whatIf could not answer. */
export type WhatIfReason =
  | { code: "invalid-at"; message: string }
  | { code: "at-not-after-creation"; at: number; createdAt: number }
  | { code: "at-item-dead"; at: number; diedAt: number }
  | { code: "invalid-event"; message: string }
  | { code: "replay-failed"; reason: ReplayReason }

/** Result of whatIf. */
export type WhatIfResult<Payload, PolicyData> =
  | {
      ok: true
      at: number
      /** Death of the life that contains `at`, with the extra tend. */
      diesAt: number | null
      /** Death of the same life without the extra tend, worked out the same way. */
      baselineDiesAt: number | null
      /** The what-if engine's view of the item at its last replayed call. */
      item: Item<Payload, PolicyData>
      /** The what-if engine's history; it does not tick past the last call. */
      history: HistoryEntry[]
      stoppedAt: StopPoint | null
      skipped: SkippedEntry[]
    }
  | { ok: false; reason: WhatIfReason }
