// A StorageAdapter that keeps the engine's snapshot exactly where and how
// LocalStorageAdapter does (key `decay-engine:<namespace>`, one JSON string),
// and adds two things the engine's adapter lacks:
//
// 1. Migration. A sidecar record (`decay-engine:<namespace>:meta`) holds the
//    app-data version; load() runs any pending migrations and writes the
//    result back, after keeping a copy of the old text.
// 2. A write guard. The sidecar also holds a revision, bumped on every save.
//    A tab remembers the revision it loaded or last saved; if the stored one
//    differs, another tab (or a restore) wrote in between, and save() throws
//    PersistError STALE_WRITE instead of overwriting that data.
//
// Errors from the browser (missing storage, quota, bad JSON) propagate
// unchanged, as with LocalStorageAdapter, so each app's storage-errors.ts
// keeps classifying them. load() does not validate the snapshot; the engine
// does that with parseSnapshot after loading.
//
// Not atomic across tabs: two tabs saving within the same instant can both pass
// the revision check, because localStorage has no compare-and-set. The guard
// closes the common case (a stale tab saving minutes later), not that race.

import type { StorageAdapter, StoredSnapshot } from "@decay-engine/engine"
import { PersistError } from "./errors"
import { readMeta, writeMeta } from "./meta"
import { CURRENT_APP_DATA_VERSION, migrateSnapshot, MIGRATIONS, type Migration } from "./migrations"
import { globalStorage, snapshotKey, type StorageLike } from "./storage"

export interface VersionedAdapterOptions {
  /** Defaults to the global localStorage, looked up on every call. */
  storage?: StorageLike
  /** Epoch ms for meta.updatedAt. Defaults to Date.now. */
  now?: () => number
  /** Makes a device id on first use. Defaults to crypto.randomUUID. */
  makeId?: () => string
  /** The version this build writes. Defaults to CURRENT_APP_DATA_VERSION. */
  targetVersion?: number
  /** The step list. Defaults to MIGRATIONS. */
  migrations?: readonly Migration[]
}

export class VersionedAdapter implements StorageAdapter {
  private readonly namespace: string
  private readonly options: VersionedAdapterOptions
  /** The revision this tab last loaded or saved. */
  private revision = 0

  /** @param namespace - Same value as LocalStorageAdapter, for example "ghosted". */
  constructor(namespace: string, options: VersionedAdapterOptions = {}) {
    this.namespace = namespace
    this.options = options
  }

  private storage(operation: string): StorageLike {
    return this.options.storage ?? globalStorage(operation)
  }

  private target(): number {
    return this.options.targetVersion ?? CURRENT_APP_DATA_VERSION
  }

  private now(): number {
    return (this.options.now ?? Date.now)()
  }

  private newId(): string {
    return (this.options.makeId ?? (() => globalThis.crypto.randomUUID()))()
  }

  /**
   * @returns The stored snapshot, migrated to the current app-data version,
   *   or null if nothing is stored.
   * @throws DecayEngineError STORAGE_UNAVAILABLE when localStorage is missing.
   * @throws The SyntaxError from JSON.parse for stored text that is not JSON.
   * @throws PersistError UNSUPPORTED_APP_DATA_VERSION for data from a newer app,
   *   MIGRATION_FAILED for a broken step.
   */
  load(): StoredSnapshot | null {
    const storage = this.storage("load")
    const meta = readMeta(storage, this.namespace)
    this.revision = meta.revision
    const text = storage.getItem(snapshotKey(this.namespace))
    if (text === null) return null

    const parsed = JSON.parse(text) as StoredSnapshot
    const target = this.target()
    if (meta.appDataVersion === target) return parsed

    const migrated = migrateSnapshot(parsed, meta.appDataVersion, target, this.options.migrations ?? MIGRATIONS)
    this.writeMigrated(storage, text, meta.appDataVersion, migrated, meta.revision)
    return migrated
  }

  /**
   * Writes the snapshot, replacing the previous one, and bumps the revision.
   * @throws PersistError STALE_WRITE when the stored revision is not the one this tab has.
   * @throws DecayEngineError STORAGE_UNAVAILABLE when localStorage is missing.
   * @throws Errors from localStorage.setItem (for example quota exceeded), unchanged.
   *   When the snapshot write fails, the previous meta record is restored.
   */
  save(snapshot: StoredSnapshot): void {
    const storage = this.storage("save")
    const previous = readMeta(storage, this.namespace)
    if (previous.revision !== this.revision) {
      throw new PersistError(
        "STALE_WRITE",
        `Saved data changed since it was loaded (revision ${previous.revision}, expected ${this.revision})`
      )
    }
    const next = {
      appDataVersion: this.target(),
      revision: previous.revision + 1,
      updatedAt: this.now(),
      deviceId: previous.deviceId || this.newId(),
    }
    // Meta first: if the snapshot write then fails (quota), only meta needs undoing.
    writeMeta(storage, this.namespace, next)
    try {
      storage.setItem(snapshotKey(this.namespace), JSON.stringify(snapshot))
    } catch (error) {
      try {
        writeMeta(storage, this.namespace, previous)
      } catch {
        // Storage is failing; the stale revision then shows up as STALE_WRITE on the next save.
      }
      throw error
    }
    this.revision = next.revision
  }

  /** Keeps the pre-migration text, then writes the migrated snapshot. Failures here do not stop the load. */
  private writeMigrated(
    storage: StorageLike,
    oldText: string,
    fromVersion: number,
    migrated: StoredSnapshot,
    revision: number
  ): void {
    try {
      storage.setItem(`${snapshotKey(this.namespace)}:pre-migration-v${fromVersion}`, oldText)
      const meta = {
        appDataVersion: this.target(),
        revision: revision + 1,
        updatedAt: this.now(),
        deviceId: this.newId(),
      }
      writeMeta(storage, this.namespace, meta)
      storage.setItem(snapshotKey(this.namespace), JSON.stringify(migrated))
      this.revision = meta.revision
    } catch {
      // No room to write back. The migrated snapshot still loads in memory and
      // the next successful save writes it.
    }
  }
}
