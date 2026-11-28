// Storage problems, in words (task 18.3; design.md "Storage Errors").
//
// The app keeps everything in localStorage, so three things can go wrong:
// - full: a save hits the browser's storage quota. The engine guarantees a
//   failed save changes nothing, so the app can say so and keep working.
// - unavailable: localStorage is missing or blocked (some private modes).
// - corrupt: the saved snapshot cannot be read back. This happens when the
//   engine is built, at startup, so it must be caught there; otherwise the
//   page is left blank.
//
// Pure: these functions only look at an error and decide what it means.
//

import { DecayEngineError } from "@decay-engine/engine"
import { PersistError } from "@decay-engine/persist"

export type WriteProblem = "full" | "unavailable" | "stale"
export type LoadProblem = "corrupt" | "unavailable"
export type StorageProblem = WriteProblem | LoadProblem

/** One plain sentence per problem, for the live region and the problem screen. */
export const storageProblemText: Readonly<Record<StorageProblem, string>> = {
  full: "Storage full. Your browser has no room left for Study Dungeon, so that change was not saved. Remove a few facts, or free some browser storage, and try again.",
  unavailable:
    "Study Dungeon cannot use your browser's storage, so nothing can be saved. Private browsing or blocked site data can cause this.",
  stale:
    "Another tab changed your Study Dungeon data, so that change was not saved. Reload this page to see the latest, then try again.",
  corrupt:
    "Your saved facts could not be read. They may have been changed outside Study Dungeon. Reset all data to start again.",
}

/**
 * What a failed write (addItem, edit, tend, resurrect, remove, tick) means
 * for storage, or null when it is not a storage problem (the caller should
 * rethrow those).
 */
export function classifyWriteError(error: unknown): WriteProblem | null {
  if (isQuotaError(error)) return "full"
  if (error instanceof DecayEngineError && error.code === "STORAGE_UNAVAILABLE") return "unavailable"
  // Another tab (or a restore) wrote after this tab loaded; VersionedAdapter refused to overwrite it.
  if (error instanceof PersistError && error.code === "STALE_WRITE") return "stale"
  return null
}

/**
 * The only codes the engine's snapshot parser throws (serialization.ts).
 * Anything else from the constructor is a bug, not bad stored data.
 */
const CORRUPT_SNAPSHOT_CODES: ReadonlySet<string> = new Set([
  "INVALID_SNAPSHOT",
  "UNSUPPORTED_SCHEMA_VERSION",
  "INVALID_ITEM_DATA",
])

/**
 * What a failure while building the engine (which loads the snapshot) means,
 * or null when it is not a storage problem. Only use this around the
 * engine's constructor: the same engine codes mean bad input elsewhere.
 */
export function classifyLoadError(error: unknown): LoadProblem | null {
  if (error instanceof DecayEngineError) {
    if (error.code === "STORAGE_UNAVAILABLE") return "unavailable"
    if (CORRUPT_SNAPSHOT_CODES.has(error.code)) return "corrupt"
    return null
  }
  // Data from a newer app, or a broken migration: not readable by this build.
  if (error instanceof PersistError && (error.code === "UNSUPPORTED_APP_DATA_VERSION" || error.code === "MIGRATION_FAILED")) {
    return "corrupt"
  }
  // VersionedAdapter.load passes JSON.parse's SyntaxError through unchanged.
  if (error instanceof SyntaxError) return "corrupt"
  // Reading localStorage itself can throw a SecurityError when site data is blocked.
  if (isNamedError(error, "SecurityError")) return "unavailable"
  return null
}

export type SafeEngine<E> =
  | { ok: true; engine: E }
  | { ok: false; problem: LoadProblem; error: unknown }

/**
 * Builds the engine, turning a storage problem into a result instead of a
 * crash. Errors that are not storage problems are rethrown (they are bugs).
 */
export function createEngineSafely<E>(create: () => E): SafeEngine<E> {
  try {
    return { ok: true, engine: create() }
  } catch (error) {
    const problem = classifyLoadError(error)
    if (problem === null) throw error
    return { ok: false, problem, error }
  }
}

/**
 * Browsers report a full quota differently: "QuotaExceededError" (code 22)
 * in most, "NS_ERROR_DOM_QUOTA_REACHED" (code 1014) in older Firefox.
 */
function isQuotaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const { name, code } = error as { name?: unknown; code?: unknown }
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014
}

function isNamedError(error: unknown, name: string): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === name
}
