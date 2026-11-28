// The sidecar record kept next to the engine snapshot. The snapshot itself
// stays in the engine's own format (schemaVersion 1), so backup, restore and
// reset keep working; everything the engine knows nothing about lives here.

import { metaKey, type StorageLike } from "./storage"

type Reader = Pick<StorageLike, "getItem">
type Writer = Pick<StorageLike, "setItem">

export interface Meta {
  /** Version of the app-level data inside the snapshot (payload and policyData shapes). */
  appDataVersion: number
  /** Counts successful saves. A tab may only save over the revision it loaded. */
  revision: number
  /** Epoch ms of the last save, from the injected clock. */
  updatedAt: number
  /** The browser profile that made the last save; created on the first save and carried forward. */
  deviceId: string
}

/** Data saved before this package existed has no meta; it counts as version 0, revision 0. */
export const NO_META: Meta = { appDataVersion: 0, revision: 0, updatedAt: 0, deviceId: "" }

function isMeta(value: unknown): value is Meta {
  if (typeof value !== "object" || value === null) return false
  const m = value as Record<string, unknown>
  return (
    Number.isInteger(m.appDataVersion) &&
    (m.appDataVersion as number) >= 0 &&
    Number.isInteger(m.revision) &&
    (m.revision as number) >= 0 &&
    typeof m.updatedAt === "number" &&
    typeof m.deviceId === "string"
  )
}

/** Reads the meta record. A missing or unreadable one is treated as NO_META, never an error. */
export function readMeta(storage: Reader, namespace: string): Meta {
  const text = storage.getItem(metaKey(namespace))
  if (text === null) return NO_META
  try {
    const parsed: unknown = JSON.parse(text)
    return isMeta(parsed) ? parsed : NO_META
  } catch {
    return NO_META
  }
}

export function writeMeta(storage: Writer, namespace: string, meta: Meta): void {
  storage.setItem(metaKey(namespace), JSON.stringify(meta))
}

/**
 * Marks the stored data as changed by something other than a normal save
 * (a restore from backup, a cloud pull). Any tab that loaded earlier will then
 * fail its next save with STALE_WRITE instead of overwriting the new data.
 */
export function bumpRevision(storage: Reader & Writer, namespace: string, now: number): void {
  const current = readMeta(storage, namespace)
  writeMeta(storage, namespace, { ...current, revision: current.revision + 1, updatedAt: now })
}
