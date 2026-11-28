// Keeps a copy of a snapshot that could not be read, so a "reset all data"
// after a load failure does not destroy the only copy. Reset leaves these keys
// alone on purpose, so the text can still be recovered from the browser's
// storage by hand or by a later app version.

import { snapshotKey, type StorageLike } from "./storage"

/**
 * Copies the stored snapshot text to `decay-engine:<namespace>:corrupt-<now>`.
 * @returns The key written, or null when nothing was stored or the copy failed
 *   (for example no room); this never throws.
 */
export function quarantineSnapshot(storage: StorageLike, namespace: string, now: number): string | null {
  try {
    const text = storage.getItem(snapshotKey(namespace))
    if (text === null) return null
    const key = `${snapshotKey(namespace)}:corrupt-${now}`
    storage.setItem(key, text)
    return key
  } catch {
    return null
  }
}
