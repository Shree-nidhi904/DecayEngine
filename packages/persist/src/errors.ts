// Errors raised by @decay-engine/persist. The engine's own DecayEngineError
// code list is frozen, so these are a separate class with a separate code set.

export type PersistErrorCode =
  /** Another tab or a restore changed the saved data after this tab loaded it. */
  | "STALE_WRITE"
  /** The saved data was written by a newer version of the app than this one. */
  | "UNSUPPORTED_APP_DATA_VERSION"
  /** A migration step threw, or the migration list has a gap. */
  | "MIGRATION_FAILED"

export class PersistError extends Error {
  readonly code: PersistErrorCode

  constructor(code: PersistErrorCode, message: string) {
    super(message)
    this.name = "PersistError"
    this.code = code
  }
}
