// Parse and validate the storage format, and convert between the in-memory
// EngineState (Maps) and the StoredSnapshot passed to storage adapters (arrays).
// Source of truth: .kiro/specs/engine/design.md (Snapshot Structure, Storage)
// and .kiro/specs/engine/requirements.md (Requirement 15).
//
// Internal module: not exported from src/index.ts.

import { DecayEngineError } from "./errors"
import type { EngineState, HistoryEntry, Item, StoredSnapshot } from "./types"

// Snapshot schema version this engine reads and writes.
export const SCHEMA_VERSION = 1

const ITEM_STATES = ["alive", "weak", "dead"] as const

// Required item fields (Requirement 15.2). diedAt is optional.
const REQUIRED_ITEM_FIELDS = [
  "id",
  "payload",
  "policyData",
  "health",
  "state",
  "createdAt",
  "lastEventAt",
  "timesResurrected",
  "importance",
  "costMinutes",
] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function invalidField(field: string, rule: string): DecayEngineError {
  return new DecayEngineError("INVALID_ITEM_DATA", `Invalid item field "${field}": ${rule}`)
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

/**
 * Validates one stored item and returns a typed copy containing exactly the
 * item fields. Throws DecayEngineError("INVALID_ITEM_DATA") naming the field
 * that failed (Requirement 15.2 to 15.5).
 */
export function validateItem(item: unknown): Item<unknown, unknown> {
  if (!isPlainObject(item)) {
    throw new DecayEngineError("INVALID_ITEM_DATA", "Item must be an object")
  }

  for (const field of REQUIRED_ITEM_FIELDS) {
    if (!hasOwn(item, field) || item[field] === undefined) {
      throw invalidField(field, "required field is missing")
    }
  }

  const {
    id,
    payload,
    policyData,
    health,
    state,
    createdAt,
    lastEventAt,
    diedAt,
    timesResurrected,
    importance,
    costMinutes,
  } = item

  if (typeof id !== "string" || id.length === 0) {
    throw invalidField("id", "must be a non-empty string")
  }
  if (typeof health !== "number" || !Number.isFinite(health) || health < 0 || health > 100) {
    throw invalidField("health", "must be a number from 0 to 100")
  }
  if (typeof state !== "string" || !(ITEM_STATES as readonly string[]).includes(state)) {
    throw invalidField("state", 'must be "alive", "weak" or "dead"')
  }
  if (!isTimestamp(createdAt)) {
    throw invalidField("createdAt", "must be a finite number greater than or equal to 0")
  }
  if (!isTimestamp(lastEventAt)) {
    throw invalidField("lastEventAt", "must be a finite number greater than or equal to 0")
  }
  if (diedAt !== undefined && !isTimestamp(diedAt)) {
    throw invalidField("diedAt", "must be a finite number greater than or equal to 0, or absent")
  }
  if (
    typeof timesResurrected !== "number" ||
    !Number.isInteger(timesResurrected) ||
    timesResurrected < 0
  ) {
    throw invalidField("timesResurrected", "must be a non-negative integer")
  }
  if (
    typeof importance !== "number" ||
    !Number.isInteger(importance) ||
    importance < 1 ||
    importance > 3
  ) {
    throw invalidField("importance", "must be an integer from 1 to 3")
  }
  if (
    typeof costMinutes !== "number" ||
    !Number.isInteger(costMinutes) ||
    costMinutes < 1 ||
    costMinutes > 600
  ) {
    throw invalidField("costMinutes", "must be a positive integer at most 600")
  }
  if (state === "dead" && diedAt === undefined) {
    throw invalidField("diedAt", "missing diedAt for dead item")
  }
  if (state === "dead" && health > 0) {
    throw invalidField("health", "must be 0 for a dead item")
  }

  const result: Item<unknown, unknown> = {
    id,
    payload,
    policyData,
    health,
    state: state as Item<unknown, unknown>["state"],
    createdAt,
    lastEventAt,
    timesResurrected,
    importance,
    costMinutes,
  }
  if (diedAt !== undefined) {
    result.diedAt = diedAt as number
  }
  return result
}

/**
 * Validates a loaded snapshot and converts it to an EngineState.
 * - UNSUPPORTED_SCHEMA_VERSION when schemaVersion is a number other than SCHEMA_VERSION
 * - INVALID_SNAPSHOT when the snapshot structure is wrong
 * - INVALID_ITEM_DATA when an item field is invalid (see validateItem)
 *
 * Payload and PolicyData are opaque to the engine; the caller (the engine,
 * which owns the policy) supplies their types.
 */
export function parseSnapshot<Payload, PolicyData>(
  data: unknown
): EngineState<Payload, PolicyData> {
  if (!isPlainObject(data)) {
    throw new DecayEngineError("INVALID_SNAPSHOT", "Snapshot must be an object")
  }

  // Check the version before the rest of the structure, so a snapshot from a
  // different version reports the version problem rather than a shape problem.
  const { schemaVersion } = data
  if (typeof schemaVersion !== "number") {
    throw new DecayEngineError("INVALID_SNAPSHOT", "Snapshot schemaVersion must be a number")
  }
  if (schemaVersion !== SCHEMA_VERSION) {
    throw new DecayEngineError(
      "UNSUPPORTED_SCHEMA_VERSION",
      `Unsupported snapshot schemaVersion ${String(schemaVersion)}; expected ${SCHEMA_VERSION}`
    )
  }

  if (!Array.isArray(data.items)) {
    throw new DecayEngineError("INVALID_SNAPSHOT", "Snapshot items must be an array")
  }
  if (!Array.isArray(data.history)) {
    throw new DecayEngineError("INVALID_SNAPSHOT", "Snapshot history must be an array")
  }

  const items = new Map<string, Item<Payload, PolicyData>>()
  const history = new Map<string, HistoryEntry[]>()

  for (const raw of data.items) {
    const item = validateItem(raw) as Item<Payload, PolicyData>
    if (items.has(item.id)) {
      throw new DecayEngineError("INVALID_SNAPSHOT", `Snapshot has duplicate item id "${item.id}"`)
    }
    items.set(item.id, item)
    history.set(item.id, [])
  }

  // History is stored flat; group it per item, keeping stored order
  // (entries are already sorted by timestamp, ties in insertion order).
  for (const entry of data.history) {
    if (!isPlainObject(entry) || typeof entry.itemId !== "string") {
      throw new DecayEngineError(
        "INVALID_SNAPSHOT",
        "Snapshot history entries must be objects with a string itemId"
      )
    }
    const entries = history.get(entry.itemId)
    if (entries === undefined) {
      throw new DecayEngineError(
        "INVALID_SNAPSHOT",
        `Snapshot history entry refers to unknown item "${entry.itemId}"`
      )
    }
    entries.push({ ...entry } as HistoryEntry)
  }

  return { items, history }
}

/**
 * Converts an EngineState to a JSON-safe StoredSnapshot.
 * Items keep Map order; history is flattened per item in Map order.
 * diedAt is omitted when undefined so the snapshot holds no undefined values.
 */
export function serializeSnapshot<Payload, PolicyData>(
  engineState: EngineState<Payload, PolicyData>
): StoredSnapshot {
  const items: Array<Item<unknown, unknown>> = []
  for (const item of engineState.items.values()) {
    const { diedAt, ...rest } = item
    const stored: Item<unknown, unknown> = { ...rest }
    if (diedAt !== undefined) {
      stored.diedAt = diedAt
    }
    items.push(stored)
  }

  const history: HistoryEntry[] = []
  for (const entries of engineState.history.values()) {
    for (const entry of entries) {
      history.push({ ...entry })
    }
  }

  return { schemaVersion: SCHEMA_VERSION, items, history }
}
