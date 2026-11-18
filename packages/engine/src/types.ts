// Core types for the Decay Engine.
// Source of truth: .kiro/specs/engine/design.md (Core Types) and
// .kiro/specs/engine/requirements.md (Type Contract).
//
// Payload, PolicyData and Event must be JSON-serializable
// (no functions, symbols, undefined as values, NaN, Infinity, or negative zero).

/**
 * One tracked thing. The engine stores it and derives its state; the policy
 * decides how its health changes.
 *
 * @typeParam Payload - App data about the item. JSON-serializable.
 * @typeParam PolicyData - Data the policy keeps for the item. JSON-serializable.
 */
export type Item<Payload, PolicyData> = {
  /** Unique id from the engine's id generator. */
  id: string
  /** App data. The engine stores it but never reads it. Must be JSON-serializable. */
  payload: Payload // Must be JSON-serializable
  /** Policy data, from policy.init and later policy.applyEvent. Must be JSON-serializable. */
  policyData: PolicyData // Must be JSON-serializable
  /** Health from 0 to 100 as of lastEventAt. Use view(now) for health at another time. */
  health: number // 0..100, as of lastEventAt
  /** Derived from health and policy.thresholds; never set directly. */
  state: "alive" | "weak" | "dead"
  /** When addItem created the item (ms). */
  createdAt: number
  /** When health was last computed and stored (ms). */
  lastEventAt: number
  /** When the item died (ms); present only while it is dead. */
  diedAt?: number
  /** How many times the item has been brought back. */
  timesResurrected: number
  /** How much the user cares about the item: an integer from 1 to 3. Used by triage. */
  importance: number // 1..3, user-set
  /** Minutes it takes to tend the item: an integer from 1 to 600. Used by triage. */
  costMinutes: number // positive integer, at most 600
}

/**
 * The app's decay rules. Every function must be pure and synchronous: the same
 * inputs give the same output, with no side effects and no clock reads.
 *
 * @typeParam Payload - App data about an item.
 * @typeParam PolicyData - Data the policy keeps per item.
 * @typeParam Event - What the app passes to tend and resurrect.
 */
export interface DecayPolicy<Payload, PolicyData, Event> {
  /**
   * State boundaries: alive when health ≥ weak, weak when dead ≤ health < weak,
   * dead when health < dead. Requires 0 < dead < weak ≤ 100.
   */
  thresholds: { weak: number; dead: number }
  /**
   * Starting policy data for a new item.
   * @param payload - The payload passed to addItem.
   * @param now - Creation time in milliseconds.
   * @returns JSON-serializable policy data.
   */
  init(payload: Payload, now: number): PolicyData
  /**
   * Health of the item at `now`, decaying from item.health at item.lastEventAt.
   * Must never increase with time between events. The engine clamps the result
   * to 0-100 and throws INVALID_HEALTH for a non-finite value.
   * @param item - The item as stored (or as settled by the engine).
   * @param now - Time in milliseconds, at or after item.lastEventAt.
   * @returns Health from 0 to 100.
   */
  healthAt(item: Item<Payload, PolicyData>, now: number): number
  /**
   * Applies an event to a living item that the engine has settled at `now`.
   * @param item - The item settled at `now`.
   * @param event - The event passed to engine.tend.
   * @param now - Time in milliseconds.
   * @returns The new health (clamped to 0-100 by the engine) and policy data.
   */
  applyEvent(
    item: Item<Payload, PolicyData>,
    event: Event,
    now: number
  ): {
    health: number
    policyData: PolicyData
  }
  /**
   * When the item next needs attention.
   * @param item - The item settled at `now`.
   * @param now - Time in milliseconds.
   * @returns A timestamp in milliseconds (at or before `now` means due), or null for never.
   */
  nextDueAt(item: Item<Payload, PolicyData>, now: number): number | null
  /**
   * Decides whether a dead item can come back. Synchronous.
   * @param item - The dead item settled at `now`.
   * @param event - The event passed to engine.resurrect (for example the user's answer).
   * @param now - Time in milliseconds.
   * @returns `{ ok: true }` with optional replacement payload and policyData,
   *   or `{ ok: false, reason }`.
   */
  resurrect(
    item: Item<Payload, PolicyData>,
    event: Event,
    now: number
  ):
    | { ok: true; payload?: Payload; policyData?: PolicyData }
    | { ok: false; reason: string }
}

/** A weak item considered by engine.triage. */
export type TriageCandidate<Payload, PolicyData> = {
  /** Copy of the item settled at `now`. */
  item: Item<Payload, PolicyData>
  /** (100 − health) × (1 − health ÷ 100) × importance. */
  value: number
  /** value ÷ costMinutes. */
  valuePerMinute: number
  /** When the item dies if left alone (1-minute precision), or null if not within 10 years. */
  diesAt: number | null
}

/** Result of engine.triage. */
export type TriageResult<Payload, PolicyData> = {
  /** The best-value set that fits the budget, by valuePerMinute descending, ties by id. */
  picks: TriageCandidate<Payload, PolicyData>[]
  /** The other weak items, by diesAt ascending (null last), ties by id. */
  others: TriageCandidate<Payload, PolicyData>[]
}

/**
 * Facts about a dead item's current life and death, from engine.autopsy.
 * "This life" runs from the last resurrection (or creation) to death.
 */
export type AutopsyReport<Event> = {
  /** When the item was created (ms). */
  createdAt: number
  /** When the item died (ms). */
  diedAt: number
  /** Last alive-to-weak crossing in this life, or null if it never went weak or recovered. */
  wentWeakAt: number | null
  /** createdAt, or the time of the last resurrection. */
  lifeStartedAt: number
  /** The last tend in this life, or null if never tended. */
  lastTend: { at: number; event: Event } | null
  /** Milliseconds from the last tend (or lifeStartedAt) to diedAt. */
  silenceMs: number
  /** Every tend in this life, oldest first, with the gap since the previous tend or lifeStartedAt. */
  tends: Array<{ at: number; event: Event; gapBeforeMs: number | null }>
  /** From the item. */
  timesResurrected: number
  /** Number of resurrect-failed entries in the item's whole history. */
  failedResurrections: number
}

/** One predicted death from engine.forecast. */
export type ForecastEntry<Payload, PolicyData> = {
  /** Copy of the item settled at `now`. */
  item: Item<Payload, PolicyData>
  /** Earliest time (1-minute precision) at which view() shows the item dead. */
  diesAt: number
}

/** Returned by engine.resurrect so the app can tell a won fight from a lost one. */
export type ResurrectOutcome = { ok: true } | { ok: false; reason: string }

/** 10 years in milliseconds. Maximum search horizon for triage diesAt. */
export const MAX_FORECAST_HORIZON_MS = 315360000000

/** Largest valid JavaScript timestamp (Requirement 11.3). */
export const MAX_TIMESTAMP = 8_640_000_000_000_000

/**
 * One entry in an item's history log. Every entry has the item id, the time
 * it happened and the item's health right after.
 */
export type HistoryEntry =
  | {
      type: "created"
      itemId: string
      timestamp: number
      health: number
    }
  | {
      type: "tended"
      itemId: string
      timestamp: number
      health: number
      event: unknown
    }
  | {
      type: "state-changed"
      itemId: string
      timestamp: number
      health: number
      from: "alive" | "weak" | "dead"
      to: "alive" | "weak" | "dead"
    }
  | {
      type: "died"
      itemId: string
      timestamp: number
      health: number
    }
  | {
      type: "resurrected"
      itemId: string
      timestamp: number
      health: number
      event: unknown
    }
  | {
      type: "resurrect-failed"
      itemId: string
      timestamp: number
      health: number
      event: unknown
      reason: string
    }
  | {
      type: "edited"
      itemId: string
      timestamp: number
      health: number
      fieldsChanged: string[]
    }

/** In-memory state: items and their history, keyed by item id. */
export type EngineState<Payload, PolicyData> = {
  items: Map<string, Item<Payload, PolicyData>>
  history: Map<string, HistoryEntry[]>
}

/** What storage adapters load and save. JSON-serializable. */
export type StoredSnapshot = {
  schemaVersion: number
  items: Array<Item<unknown, unknown>>
  history: Array<HistoryEntry>
}

/**
 * Where the engine keeps its data. Synchronous, and always works on a whole
 * snapshot. The package provides InMemoryAdapter and LocalStorageAdapter.
 */
export interface StorageAdapter {
  /**
   * Load the complete snapshot from storage.
   * Returns null if no snapshot exists.
   * Throws if storage is corrupt or inaccessible.
   *
   * @returns The saved snapshot, or null if none exists.
   */
  load(): StoredSnapshot | null

  /**
   * Save the complete snapshot to storage.
   * Replaces any existing snapshot atomically.
   * Throws if save fails.
   *
   * @param snapshot - The complete snapshot to store.
   */
  save(snapshot: StoredSnapshot): void
}

/** Returns a new, unique, non-empty id each time it is called. */
export type IdGenerator = () => string
