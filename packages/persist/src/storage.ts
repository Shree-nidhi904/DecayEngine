// Access to the browser's localStorage without the DOM lib (same approach as
// the engine's LocalStorageAdapter): looked up through globalThis on every
// call, typed with a small interface so tests can pass a fake.

import { DecayEngineError } from "@decay-engine/engine"

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Returns the global localStorage, or throws STORAGE_UNAVAILABLE like the engine adapter. */
export function globalStorage(operation: string): StorageLike {
  const storage = (globalThis as { localStorage?: StorageLike | null }).localStorage
  if (storage === undefined || storage === null) {
    throw new DecayEngineError(
      "STORAGE_UNAVAILABLE",
      `persist.${operation} failed: localStorage is not available`
    )
  }
  return storage
}

/** The key the engine snapshot lives under. Must match LocalStorageAdapter. */
export function snapshotKey(namespace: string): string {
  return `decay-engine:${namespace}`
}

/** The key for the sidecar record: app-data version, revision, device. */
export function metaKey(namespace: string): string {
  return `decay-engine:${namespace}:meta`
}
