// Error type thrown by the engine. Callers branch on `code`, not on the message text.

export type DecayEngineErrorCode =
  | "MISSING_POLICY"
  | "MISSING_STORAGE_ADAPTER"
  | "MISSING_ID_GENERATOR"
  | "INVALID_THRESHOLDS"
  | "INVALID_TIMESTAMP"
  | "INVALID_HEALTH"
  | "INVALID_ID"
  | "DUPLICATE_ID"
  | "ITEM_NOT_FOUND"
  | "ITEM_ALREADY_DEAD"
  | "ITEM_NOT_DEAD"
  | "TIME_WENT_BACKWARD"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "INVALID_SNAPSHOT"
  | "INVALID_ITEM_DATA"
  | "INVALID_BUDGET"
  | "INVALID_HORIZON"
  | "AUTOPSY_REQUIRES_DEAD_ITEM"
  | "INVALID_IMPORTANCE"
  | "INVALID_COST_MINUTES"
  | "EDIT_REQUIRES_FIELD"
  | "STORAGE_UNAVAILABLE"

export class DecayEngineError extends Error {
  constructor(
    public readonly code: DecayEngineErrorCode,
    message: string
  ) {
    super(message)
    this.name = "DecayEngineError"
  }
}
