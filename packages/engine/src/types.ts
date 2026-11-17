// Core types for the Decay Engine.
// Source of truth: .kiro/specs/engine/design.md (Core Types) and
// .kiro/specs/engine/requirements.md (Type Contract).
//
// Payload, PolicyData and Event must be JSON-serializable
// (no functions, symbols, undefined as values, NaN, Infinity, or negative zero).

export type Item<Payload, PolicyData> = {
  id: string
  payload: Payload // Must be JSON-serializable
  policyData: PolicyData // Must be JSON-serializable
  health: number // 0..100, as of lastEventAt
  state: "alive" | "weak" | "dead"
  createdAt: number
  lastEventAt: number
  diedAt?: number
  timesResurrected: number
  importance: number // 1..3, user-set
  costMinutes: number // positive integer, at most 600
}

export interface DecayPolicy<Payload, PolicyData, Event> {
  thresholds: { weak: number; dead: number }
  init(payload: Payload, now: number): PolicyData
  healthAt(item: Item<Payload, PolicyData>, now: number): number
  applyEvent(
    item: Item<Payload, PolicyData>,
    event: Event,
    now: number
  ): {
    health: number
    policyData: PolicyData
  }
  nextDueAt(item: Item<Payload, PolicyData>, now: number): number | null
  resurrect(
    item: Item<Payload, PolicyData>,
    event: Event,
    now: number
  ):
    | { ok: true; payload?: Payload; policyData?: PolicyData }
    | { ok: false; reason: string }
}

export type TriageCandidate<Payload, PolicyData> = {
  item: Item<Payload, PolicyData>
  value: number
  valuePerMinute: number
  diesAt: number | null
}

export type TriageResult<Payload, PolicyData> = {
  picks: TriageCandidate<Payload, PolicyData>[]
  others: TriageCandidate<Payload, PolicyData>[]
}

export type AutopsyReport<Event> = {
  createdAt: number
  diedAt: number
  wentWeakAt: number | null
  lifeStartedAt: number
  lastTend: { at: number; event: Event } | null
  silenceMs: number
  tends: Array<{ at: number; event: Event; gapBeforeMs: number | null }>
  timesResurrected: number
  failedResurrections: number
}

export type ForecastEntry<Payload, PolicyData> = {
  item: Item<Payload, PolicyData>
  diesAt: number
}

// Returned by engine.resurrect so the app can tell a won fight from a lost one
export type ResurrectOutcome = { ok: true } | { ok: false; reason: string }

// 10 years in milliseconds. Maximum search horizon for triage diesAt.
export const MAX_FORECAST_HORIZON_MS = 315360000000

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

// In-memory state representation
export type EngineState<Payload, PolicyData> = {
  items: Map<string, Item<Payload, PolicyData>>
  history: Map<string, HistoryEntry[]>
}

// Storage representation (JSON-serializable)
export type StoredSnapshot = {
  schemaVersion: number
  items: Array<Item<unknown, unknown>>
  history: Array<HistoryEntry>
}

export interface StorageAdapter {
  /**
   * Load the complete snapshot from storage.
   * Returns null if no snapshot exists.
   * Throws if storage is corrupt or inaccessible.
   */
  load(): StoredSnapshot | null

  /**
   * Save the complete snapshot to storage.
   * Replaces any existing snapshot atomically.
   * Throws if save fails.
   */
  save(snapshot: StoredSnapshot): void
}

// ID generator is a plain function
export type IdGenerator = () => string
