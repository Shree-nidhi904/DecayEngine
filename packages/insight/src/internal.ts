// Helpers shared by replay and whatIf. Not exported from index.ts.
// Source of truth: .kiro/specs/insight/design.md (section 4.1).
//
// Only the DecayEngineError codes named in the requirements are caught, and
// only around the one engine call that can raise them. Every other error,
// including anything the policy throws, goes through unchanged.

import { DecayEngine, DecayEngineError, InMemoryAdapter, MAX_TIMESTAMP } from "@decay-engine/engine"
import type { DecayEngineErrorCode, DecayPolicy, HistoryEntry, Item } from "@decay-engine/engine"
import type { HistoryProblem, ReplayReason, SkippedEntry } from "./types"

/** Deep copy through JSON. Items, history entries and events are JSON by the engine contract. */
export function jsonCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// The seven members of the engine's HistoryEntry union. `satisfies` makes the
// typecheck fail if the engine's union ever has a different set of types.
const ENTRY_TYPES = {
  created: true,
  tended: true,
  "state-changed": true,
  died: true,
  resurrected: true,
  "resurrect-failed": true,
  edited: true,
} satisfies Record<HistoryEntry["type"], true>

function isKnownType(type: unknown): boolean {
  return typeof type === "string" && Object.prototype.hasOwnProperty.call(ENTRY_TYPES, type)
}

/** A finite number from 0 to MAX_TIMESTAMP. */
export function checkTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_TIMESTAMP
}

function historyProblem(problem: HistoryProblem, index: number | null): ReplayReason {
  return { code: "invalid-history", problem, index }
}

/**
 * The checks of Requirement 2.1. Entry 0 first (empty, first-not-created,
 * created-time-mismatch), then each entry in order (other-item, bad-timestamp,
 * out-of-order, second-created, unknown-type). The first problem found wins.
 */
export function checkHistory(
  item: { id: string; createdAt: number },
  history: readonly HistoryEntry[]
): ReplayReason | null {
  if (!Array.isArray(history) || history.length === 0) return historyProblem("empty", null)
  const first = history[0]!
  if (first.type !== "created") return historyProblem("first-not-created", 0)
  if (first.timestamp !== item.createdAt) return historyProblem("created-time-mismatch", 0)

  for (let i = 0; i < history.length; i++) {
    const entry = history[i]!
    if (entry.itemId !== item.id) return historyProblem("other-item", i)
    if (!checkTime(entry.timestamp)) return historyProblem("bad-timestamp", i)
    if (i > 0 && entry.timestamp < history[i - 1]!.timestamp) return historyProblem("out-of-order", i)
    if (i > 0 && entry.type === "created") return historyProblem("second-created", i)
    if (!isKnownType(entry.type)) return historyProblem("unknown-type", i)
  }
  return null
}

/** null when horizonMs is absent or a positive finite number, otherwise the reason. */
export function checkHorizon(horizonMs: unknown): ReplayReason | null {
  if (horizonMs === undefined) return null
  if (typeof horizonMs === "number" && Number.isFinite(horizonMs) && horizonMs > 0) return null
  return {
    code: "invalid-options",
    option: "horizonMs",
    message: `horizonMs must be a positive finite number, got ${String(horizonMs)}`,
  }
}

function isEngineError(error: unknown, codes: readonly DecayEngineErrorCode[]): error is DecayEngineError {
  return error instanceof DecayEngineError && codes.includes(error.code)
}

const ADD_ITEM_CODES: readonly DecayEngineErrorCode[] = [
  "INVALID_TIMESTAMP",
  "INVALID_ID",
  "INVALID_IMPORTANCE",
  "INVALID_COST_MINUTES",
]

/**
 * A new throwaway engine on an InMemoryAdapter, with the item added at its
 * createdAt from its current payload, importance and costMinutes (L1).
 * The id generator is called once and returns the item's own id.
 */
export function startReplay<Payload, PolicyData, Event>(
  policy: DecayPolicy<Payload, PolicyData, Event>,
  item: Item<Payload, PolicyData>
): { engine: DecayEngine<Payload, PolicyData, Event> } | { reason: ReplayReason } {
  const id = item.id
  const engine = new DecayEngine<Payload, PolicyData, Event>(policy, new InMemoryAdapter(), () => id)
  try {
    engine.addItem(
      { payload: item.payload, importance: item.importance, costMinutes: item.costMinutes },
      item.createdAt
    )
  } catch (error) {
    if (isEngineError(error, ADD_ITEM_CODES)) {
      return { reason: { code: "invalid-item", engineCode: error.code, message: error.message } }
    }
    throw error
  }
  return { engine }
}

function diverged(
  index: number,
  entry: HistoryEntry,
  entryType: "tended" | "resurrected",
  engineCode: "ITEM_ALREADY_DEAD" | "ITEM_NOT_DEAD" | "RESURRECT_REFUSED",
  policyReason: string | null
): ReplayReason {
  return { code: "diverged", index, timestamp: entry.timestamp, entryType, engineCode, policyReason }
}

/**
 * Turns one recorded entry into an engine call: tended to tend, resurrected to
 * resurrect, with the recorded event and timestamp. Other types make no call.
 * Returns a "diverged" reason when the replayed item is not in the state the
 * recorded entry needs, otherwise null.
 */
export function step<Payload, PolicyData, Event>(
  engine: DecayEngine<Payload, PolicyData, Event>,
  id: string,
  entry: HistoryEntry,
  index: number
): ReplayReason | null {
  if (entry.type === "tended") {
    try {
      engine.tend(id, entry.event as Event, entry.timestamp)
    } catch (error) {
      if (isEngineError(error, ["ITEM_ALREADY_DEAD"])) {
        return diverged(index, entry, "tended", "ITEM_ALREADY_DEAD", null)
      }
      throw error
    }
    return null
  }
  if (entry.type === "resurrected") {
    let outcome: ReturnType<DecayEngine<Payload, PolicyData, Event>["resurrect"]>
    try {
      outcome = engine.resurrect(id, entry.event as Event, entry.timestamp)
    } catch (error) {
      if (isEngineError(error, ["ITEM_NOT_DEAD"])) {
        return diverged(index, entry, "resurrected", "ITEM_NOT_DEAD", null)
      }
      throw error
    }
    if (!outcome.ok) {
      return diverged(index, entry, "resurrected", "RESURRECT_REFUSED", outcome.reason)
    }
    return null
  }
  return null
}

/**
 * Replays entries[from] to entries[to - 1] in order. Edited and
 * resurrect-failed entries are pushed to `skipped`; state-changed and died
 * entries are ignored (the engine writes its own).
 *
 * @returns The reason if an entry diverged, otherwise the timestamp of the
 *   last tend or resurrection replayed (null if there was none).
 */
export function replayRange<Payload, PolicyData, Event>(
  engine: DecayEngine<Payload, PolicyData, Event>,
  id: string,
  entries: readonly HistoryEntry[],
  from: number,
  to: number,
  skipped: SkippedEntry[]
): { reason: ReplayReason } | { last: number | null } {
  let last: number | null = null
  for (let i = from; i < to; i++) {
    const entry = entries[i]!
    if (entry.type === "tended" || entry.type === "resurrected") {
      const reason = step(engine, id, entry, i)
      if (reason !== null) return { reason }
      last = entry.timestamp
    } else if (entry.type === "edited" || entry.type === "resurrect-failed") {
      skipped.push({ index: i, type: entry.type, timestamp: entry.timestamp })
    }
  }
  return { last }
}

/** The engine's view of the item at `at`. The item is always there: it is never removed. */
export function viewItem<Payload, PolicyData, Event>(
  engine: DecayEngine<Payload, PolicyData, Event>,
  id: string,
  at: number
): Item<Payload, PolicyData> {
  const item = engine.view(at).find((i) => i.id === id)
  if (item === undefined) {
    throw new Error(`insight: the replay engine has no item ${id}`)
  }
  return item
}
