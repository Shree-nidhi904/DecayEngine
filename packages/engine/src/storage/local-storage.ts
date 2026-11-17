// Browser localStorage storage adapter.
//
// This is the only file in the package that touches a browser API. It stores
// the whole snapshot as one JSON string under the key `decay-engine:${namespace}`,
// so each app keeps separate data.
//
// The package compiles without the DOM lib, so localStorage is reached through
// globalThis and typed with the small StorageLike interface below. It is looked
// up on every load() and save() call rather than once in the constructor.
//
// Errors:
// - localStorage missing (undefined or null): throws DecayEngineError
//   STORAGE_UNAVAILABLE.
// - getItem/setItem throwing (for example quota exceeded): the original error
//   propagates unchanged.
// - Stored text that is not valid JSON: the SyntaxError from JSON.parse
//   propagates unchanged.
//
// load() does not validate the parsed value. The engine validates it with
// parseSnapshot after loading.
//
// Source of truth: .kiro/specs/engine/design.md (Storage Adapter Interface,
// LocalStorageAdapter) and .kiro/specs/engine/requirements.md
// (Requirements 12.4, 12.7, 12.8).

import { DecayEngineError } from "../errors"
import type { StorageAdapter, StoredSnapshot } from "./interface"

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function getLocalStorage(operation: string): StorageLike {
  const storage = (globalThis as { localStorage?: StorageLike | null }).localStorage
  if (storage === undefined || storage === null) {
    throw new DecayEngineError(
      "STORAGE_UNAVAILABLE",
      `LocalStorageAdapter.${operation} failed: localStorage is not available`
    )
  }
  return storage
}

export class LocalStorageAdapter implements StorageAdapter {
  private readonly key: string

  constructor(namespace: string) {
    this.key = `decay-engine:${namespace}`
  }

  load(): StoredSnapshot | null {
    const text = getLocalStorage("load").getItem(this.key)
    if (text === null) {
      return null
    }
    return JSON.parse(text) as StoredSnapshot
  }

  save(snapshot: StoredSnapshot): void {
    getLocalStorage("save").setItem(this.key, JSON.stringify(snapshot))
  }
}
