// Back up and restore: your facts and their whole history as one JSON file,
// so clearing the browser does not lose them. A backup is checked by building
// a real engine from it before anything is replaced.
//
// Written by - Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import { DecayEngine } from "@decay-engine/engine"
import { studyDungeonPolicy, type FactPayload, type FactPolicyData, type ReviewEvent } from "./policy"
import { ENGINE_STORAGE_KEY, STARTED_FLAG, type FlagStorage } from "./first-run"

export const BACKUP_APP = "study-dungeon"
export const BACKUP_VERSION = 1

export type Backup = { app: typeof BACKUP_APP; version: number; exportedAt: string; snapshot: unknown }

/** The saved engine snapshot as a backup file's text, or null when nothing is saved yet. */
export function makeBackup(storage: Pick<FlagStorage, "getItem">, exportedAt: Date): string | null {
  const text = storage.getItem(ENGINE_STORAGE_KEY)
  if (text === null) return null
  const backup: Backup = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: exportedAt.toISOString(), snapshot: JSON.parse(text) }
  return JSON.stringify(backup, null, 2)
}

export type RestoreCheck = { ok: true; snapshot: unknown; facts: number } | { ok: false; reason: string }

/** Reads a backup file's text and checks the engine can load it. Changes nothing. */
export function checkBackup(text: string): RestoreCheck {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, reason: "This file is not a Study Dungeon backup (it is not JSON)." }
  }
  const backup = data as Partial<Backup> | null
  if (backup === null || typeof backup !== "object" || backup.app !== BACKUP_APP || backup.snapshot === undefined) {
    return { ok: false, reason: "This file is not a Study Dungeon backup." }
  }
  if (typeof backup.version !== "number" || backup.version > BACKUP_VERSION) {
    return { ok: false, reason: "This backup is from a newer version of the app." }
  }
  try {
    const engine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(
      studyDungeonPolicy,
      { load: () => JSON.parse(JSON.stringify(backup.snapshot)), save: () => {} },
      () => "unused"
    )
    // view needs a time; any valid one will do, nothing is saved.
    return { ok: true, snapshot: backup.snapshot, facts: engine.view(Date.UTC(2000, 0, 1)).length }
  } catch {
    return { ok: false, reason: "This backup is damaged and cannot be loaded." }
  }
}

/** Replaces the saved facts with a checked backup's snapshot. The app reloads afterwards. */
export function applyBackup(storage: Pick<FlagStorage, "setItem">, snapshot: unknown): void {
  storage.setItem(ENGINE_STORAGE_KEY, JSON.stringify(snapshot))
  storage.setItem(STARTED_FLAG, "1")
}
