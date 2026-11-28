// Tells a tab when another tab (or a restore) changed the saved data.
//
// Browsers fire a `storage` event in every OTHER tab of the same origin when
// localStorage changes, never in the tab that made the change. VersionedAdapter
// writes the meta record on every save, so a change to either of this
// namespace's keys means the data in memory is out of date.

import { metaKey, snapshotKey } from "./storage"

/** The slice of `window` this needs; tests pass a small fake. */
export interface StorageEventTarget {
  addEventListener(type: "storage", listener: (event: { key: string | null }) => void): void
  removeEventListener(type: "storage", listener: (event: { key: string | null }) => void): void
}

/**
 * Calls `onChange` when another tab changes this namespace's snapshot or meta
 * record, or clears all storage (event key null).
 * @returns A function that stops watching.
 */
export function watchForeignChanges(
  namespace: string,
  onChange: () => void,
  target: StorageEventTarget = globalThis as unknown as StorageEventTarget
): () => void {
  const watched = new Set([snapshotKey(namespace), metaKey(namespace)])
  const listener = (event: { key: string | null }) => {
    if (event.key === null || watched.has(event.key)) onChange()
  }
  target.addEventListener("storage", listener)
  return () => target.removeEventListener("storage", listener)
}
