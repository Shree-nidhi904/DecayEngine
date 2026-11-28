// Migrations for the app-level data inside a snapshot.
//
// The engine's snapshot format (schemaVersion 1) is frozen, so a migration
// never changes that; it rewrites items (payload, policyData) and history
// entries when an app changes their shape. Steps are pure functions on the
// parsed snapshot and run in order, from the stored appDataVersion up to the
// current one.

import type { StoredSnapshot } from "@decay-engine/engine"
import { PersistError } from "./errors"

export interface Migration {
  /** The appDataVersion this step reads. */
  from: number
  /** The appDataVersion it produces; always from + 1. */
  to: number
  migrate(snapshot: StoredSnapshot): StoredSnapshot
}

/** The app-data version this build writes. Add a step to MIGRATIONS and raise it together. */
export const CURRENT_APP_DATA_VERSION = 1

/**
 * Version 0 is data saved before this package existed (no meta record). Its
 * shape is the same as version 1, so the step changes nothing.
 */
export const MIGRATIONS: readonly Migration[] = [{ from: 0, to: 1, migrate: (snapshot) => snapshot }]

/**
 * Brings a snapshot up to `target`. Returns it unchanged when it is already
 * there. Throws PersistError for data from a newer app (UNSUPPORTED_APP_DATA_VERSION)
 * or a broken step list or step (MIGRATION_FAILED).
 */
export function migrateSnapshot(
  snapshot: StoredSnapshot,
  fromVersion: number,
  target: number = CURRENT_APP_DATA_VERSION,
  migrations: readonly Migration[] = MIGRATIONS
): StoredSnapshot {
  if (fromVersion > target) {
    throw new PersistError(
      "UNSUPPORTED_APP_DATA_VERSION",
      `Saved data is version ${fromVersion}, newer than this app's version ${target}`
    )
  }
  let version = fromVersion
  let current = snapshot
  while (version < target) {
    const step = migrations.find((m) => m.from === version)
    if (step === undefined || step.to !== version + 1) {
      throw new PersistError("MIGRATION_FAILED", `No migration from app data version ${version}`)
    }
    try {
      current = step.migrate(current)
    } catch (error) {
      throw new PersistError(
        "MIGRATION_FAILED",
        `Migration from version ${version} failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    version = step.to
  }
  return current
}
