// Copied from apps/study-dungeon/src/backup.ts (Ghosted design section 1.3).
// Changed: the Ghosted app name and policy; the refusal reasons name the
// actual problem (Req 21.4); checkBackup counts people; applyBackup also sets
// OWN_PEOPLE_FLAG (Req 15.2). No import from apps/study-dungeon (Req 21.1).
//
// Back up and restore: your people and their whole history as one JSON file,
// so clearing the browser does not lose them. A backup is checked by building
// a real engine from it before anything is replaced (Req 21.3).

import { DecayEngine } from "@decay-engine/engine"
import { bumpRevision } from "@decay-engine/persist"
import { STORAGE_NAMESPACE } from "./engine-instance"
import { ghostedPolicy, type ContactEvent, type PersonPayload, type PersonPolicyData } from "./policy"
import { ENGINE_STORAGE_KEY, OWN_PEOPLE_FLAG, STARTED_FLAG, type FlagStorage } from "./first-run"
import { backupRefusals } from "./wording"

export const BACKUP_APP = "ghosted"
export const BACKUP_VERSION = 1

export type Backup = { app: typeof BACKUP_APP; version: number; exportedAt: string; snapshot: unknown }

/** The saved engine snapshot as a backup file's text, or null when nothing is saved yet (Req 21.2). */
export function makeBackup(storage: Pick<FlagStorage, "getItem">, exportedAt: Date): string | null {
  const text = storage.getItem(ENGINE_STORAGE_KEY)
  if (text === null) return null
  const backup: Backup = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: exportedAt.toISOString(), snapshot: JSON.parse(text) }
  return JSON.stringify(backup, null, 2)
}

export type RestoreCheck = { ok: true; snapshot: unknown; people: number } | { ok: false; reason: string }

/** Reads a backup file's text and checks the engine can load it. Changes nothing. */
export function checkBackup(text: string): RestoreCheck {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, reason: backupRefusals.notJson }
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: backupRefusals.notGhosted }
  }
  const backup = data as Partial<Record<keyof Backup, unknown>>
  if (typeof backup.app === "string" && backup.app !== BACKUP_APP) {
    return { ok: false, reason: backupRefusals.otherApp }
  }
  if (backup.app !== BACKUP_APP || backup.snapshot === undefined) {
    return { ok: false, reason: backupRefusals.notGhosted }
  }
  if (typeof backup.version !== "number" || backup.version > BACKUP_VERSION) {
    return { ok: false, reason: backupRefusals.newerVersion }
  }
  try {
    const engine = new DecayEngine<PersonPayload, PersonPolicyData, ContactEvent>(
      ghostedPolicy,
      { load: () => JSON.parse(JSON.stringify(backup.snapshot)), save: () => {} },
      () => "unused"
    )
    // view needs a time; any valid one will do, nothing is saved.
    return { ok: true, snapshot: backup.snapshot, people: engine.view(Date.UTC(2000, 0, 1)).length }
  } catch {
    return { ok: false, reason: backupRefusals.damaged }
  }
}

/** Replaces the saved people with a checked backup's snapshot. The app reloads afterwards. */
export function applyBackup(storage: Pick<FlagStorage, "getItem" | "setItem">, snapshot: unknown): void {
  storage.setItem(ENGINE_STORAGE_KEY, JSON.stringify(snapshot))
  // Tabs that loaded the old data must reload before saving, not write over the restore.
  bumpRevision(storage, STORAGE_NAMESPACE, Date.now())
  storage.setItem(STARTED_FLAG, "1")
  storage.setItem(OWN_PEOPLE_FLAG, "1")
}
