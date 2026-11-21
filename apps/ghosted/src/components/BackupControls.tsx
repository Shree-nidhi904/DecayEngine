// "Back up" and "Restore" in the toolbar (task 5.3, design sections 4.4
// BackupControls and 9.3; Req 21.1-21.4, 12.5). Adapted from
// apps/study-dungeon/src/components/BackupControls.tsx; no import from
// apps/study-dungeon (Req 21.1).
//
// Changed from the copy: the file is ghosted-backup-YYYY-MM-DD.json (the
// date in the app's time zone); the confirmation before replacing anything
// is the App's ConfirmDialog ("Replace your street with N people from this
// file? This cannot be undone."), opened through onRestoreChecked, so the
// App writes through runGatedWrite and then reloads; the file is read with a
// FileReader; Restore is blocked during a preview with the reason, like every
// other write control.
//
// - Back up only reads, so it also works during a preview. It downloads
//   makeBackup's text through a Blob URL, which never leaves the browser.
// - Restore reads the chosen file and calls checkBackup, which builds a
//   throwaway engine from it. A refusal is announced with its reason and
//   nothing changes (Req 21.4); a good file goes to onRestoreChecked.
//
// Engine calls: none.

import { useId, useRef } from "react"
import { checkBackup, makeBackup, type RestoreCheck } from "../backup"
import type { FlagStorage } from "../first-run"
import type { BlockedReason } from "../lists"
import { isoDateAt } from "../person-form"
import { backupText } from "../wording"
import "../styles/layout.css"

export interface BackupControlsProps {
  storage: FlagStorage
  /** Says something in the App's live region. */
  announce: (text: string, problem?: boolean) => void
  /** Set while previewing: Restore is a write, so it is blocked. Back up still works. */
  restoreBlocked: BlockedReason
  /** The real time now, for the file name. */
  today: () => Date
  /** The time zone of the file name's date. The viewer's when omitted. */
  timeZone?: string
  /** A checked backup: the App asks before replacing anything. */
  onRestoreChecked: (check: Extract<RestoreCheck, { ok: true }>) => void
  /** Saves the file. Defaults to a download through a Blob URL. */
  download?: (fileName: string, text: string) => void
}

/** Downloads `text` as a file through a Blob URL (local only, no network). */
function downloadFile(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }))
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  link.click()
  // Give the browser a moment to start the download before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A chosen file's text. */
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

export function BackupControls({
  storage,
  announce,
  restoreBlocked,
  today,
  timeZone,
  onRestoreChecked,
  download = downloadFile,
}: BackupControlsProps) {
  const file = useRef<HTMLInputElement>(null)
  const blockedId = useId()
  const blocked = restoreBlocked !== undefined

  function backUp() {
    const now = today()
    const text = makeBackup(storage, now)
    if (text === null) {
      announce(backupText.nothing)
      return
    }
    const name = backupText.fileName(isoDateAt(now.getTime(), timeZone))
    download(name, text)
    announce(backupText.saved(name))
  }

  async function restoreFrom(chosen: File) {
    let text: string
    try {
      text = await readFileText(chosen)
    } catch {
      // A file that cannot be read is treated like one that is not JSON.
      text = ""
    }
    const check = checkBackup(text)
    if (!check.ok) {
      announce(check.reason, true)
      return
    }
    onRestoreChecked(check)
  }

  return (
    <>
      <button type="button" className="gh-button" data-action="back-up" onClick={backUp}>
        {backupText.backUp}
      </button>
      <button
        type="button"
        className="gh-button"
        data-action="restore"
        aria-disabled={blocked ? "true" : undefined}
        aria-describedby={blocked ? blockedId : undefined}
        title={restoreBlocked}
        onClick={blocked ? undefined : () => file.current?.click()}
      >
        {backupText.restore}
      </button>
      {blocked && (
        <span id={blockedId} className="gh-visually-hidden">
          {restoreBlocked}
        </span>
      )}
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        tabIndex={-1}
        data-input="restore"
        aria-label={backupText.restore}
        onChange={(event) => {
          const chosen = event.currentTarget.files?.[0]
          event.currentTarget.value = ""
          if (chosen === undefined || blocked) return
          void restoreFrom(chosen)
        }}
      />
    </>
  )
}
