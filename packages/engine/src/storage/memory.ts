// In-memory storage adapter, used for testing.
//
// Keeps one snapshot in a private field. Both load() and save() copy the
// snapshot, so callers can never modify stored data through a reference they
// hold. Nothing persists across process restarts.
//
// Copies use a JSON round-trip. StoredSnapshot is JSON-safe by contract (no
// NaN, Infinity, -0, functions, symbols or undefined values), so the round-trip
// is lossless for valid snapshots, and it matches what LocalStorageAdapter
// does. structuredClone is avoided because the package's ES2022 lib does not
// declare it.
//
// Source of truth: .kiro/specs/engine/design.md (Storage Adapter Interface,
// InMemoryAdapter) and .kiro/specs/engine/requirements.md (Requirement 12.7).

import type { StorageAdapter, StoredSnapshot } from "./interface"

function deepCopy(snapshot: StoredSnapshot): StoredSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as StoredSnapshot
}

/** Keeps the snapshot in memory. For tests and demos; nothing survives a reload. */
export class InMemoryAdapter implements StorageAdapter {
  private stored: StoredSnapshot | null = null

  /** @returns A copy of the last saved snapshot, or null if nothing was saved. */
  load(): StoredSnapshot | null {
    return this.stored === null ? null : deepCopy(this.stored)
  }

  /** @param snapshot - Stored as a copy, replacing the previous one. */
  save(snapshot: StoredSnapshot): void {
    // Copy fully before assigning, so a failed copy leaves the old snapshot intact.
    const copy = deepCopy(snapshot)
    this.stored = copy
  }
}
