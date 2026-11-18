// Public API of @decay-engine/engine.

export { MAX_FORECAST_HORIZON_MS, MAX_TIMESTAMP } from "./types"

export { deriveState, validateThresholds } from "./state-derivation"

export { DecayEngineError } from "./errors"
export type { DecayEngineErrorCode } from "./errors"

export type {
  Item,
  DecayPolicy,
  TriageCandidate,
  TriageResult,
  AutopsyReport,
  ForecastEntry,
  ResurrectOutcome,
  HistoryEntry,
  EngineState,
  StoredSnapshot,
  IdGenerator,
} from "./types"

export type { StorageAdapter } from "./storage/interface"
export { InMemoryAdapter } from "./storage/memory"
export { LocalStorageAdapter } from "./storage/local-storage"

export { DecayEngine } from "./engine"

export { checkPolicy } from "./check-policy"
