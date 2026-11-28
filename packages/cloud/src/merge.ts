// Merges two snapshots of the same app: this device's and the cloud's.
//
// - An item on one side only is kept.
// - An item on both sides: the one with the later lastEventAt wins; a tie keeps
//   this device's.
// - History entries are the union, once each (same type, item and time), in
//   time order.
//
// Limit: there are no deletion records, so an item removed on one device and
// still present on the other comes back. That is why a merge is offered only
// as one of three choices in a conflict, never done silently.

import type { StoredSnapshot } from "@decay-engine/engine"

type Entry = StoredSnapshot["history"][number]
type StoredItem = StoredSnapshot["items"][number]

export function mergeSnapshots(local: StoredSnapshot, remote: StoredSnapshot): StoredSnapshot {
  const items = new Map<string, StoredItem>()
  for (const item of remote.items) items.set(item.id, item)
  for (const item of local.items) {
    const other = items.get(item.id)
    if (other === undefined || item.lastEventAt >= other.lastEventAt) items.set(item.id, item)
  }

  const seen = new Set<string>()
  const history: Entry[] = []
  for (const entry of [...local.history, ...remote.history]) {
    const key = `${entry.type}|${entry.itemId}|${entry.timestamp}`
    if (seen.has(key)) continue
    seen.add(key)
    history.push(entry)
  }
  history.sort((a, b) => a.timestamp - b.timestamp)

  return { schemaVersion: local.schemaVersion, items: [...items.values()], history }
}

interface BackupShape {
  app: string
  version: number
  exportedAt: string
  snapshot: StoredSnapshot
}

function parseBackup(text: string): BackupShape | null {
  try {
    const value = JSON.parse(text) as Partial<BackupShape>
    if (typeof value !== "object" || value === null || typeof value.snapshot !== "object" || value.snapshot === null) return null
    return value as BackupShape
  } catch {
    return null
  }
}

/**
 * Merges two backup files' text into one backup file's text (this device's
 * wrapper), or null when either is not a readable backup.
 */
export function mergeBackups(localText: string, remoteText: string): string | null {
  const local = parseBackup(localText)
  const remote = parseBackup(remoteText)
  if (local === null || remote === null || local.app !== remote.app) return null
  return JSON.stringify({ ...local, snapshot: mergeSnapshots(local.snapshot, remote.snapshot) })
}

/**
 * Whether two backup files hold the same data. The wrapper (export time and so on)
 * is ignored; only the snapshot counts. Unreadable text is never "the same".
 */
export function sameBackupData(aText: string, bText: string): boolean {
  const a = parseBackup(aText)
  const b = parseBackup(bText)
  return a !== null && b !== null && JSON.stringify(a.snapshot) === JSON.stringify(b.snapshot)
}
