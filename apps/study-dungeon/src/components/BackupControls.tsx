// "Back up" and "Restore" beside the other settings (backup.ts). Back up
// downloads your facts as a JSON file. Restore reads one, checks it, asks
// before replacing everything, then reloads.
//
// Written by - Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import { useRef, useState } from "react"
import { applyBackup, checkBackup, makeBackup } from "../backup"
import type { FlagStorage } from "../first-run"
import { backupText } from "../wording"
import { useModalDialog } from "./useModalDialog"

export interface BackupControlsProps {
  storage: FlagStorage
  reload: () => void
  /** Says something in the App's live region. */
  announce: (text: string, problem?: boolean) => void
  /** Set while previewing: Restore is a write, so it is blocked. Back up still works. */
  restoreDisabledReason?: string
  /** Today, for the file name. */
  today: () => Date
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function ConfirmRestore({ facts, onConfirm, onCancel }: { facts: number; onConfirm: () => void; onCancel: () => void }) {
  const ref = useModalDialog()
  return (
    <dialog
      ref={ref}
      className="sd-confirm"
      aria-labelledby="sd-restore-text"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <p id="sd-restore-text" className="sd-confirm-text">
        {backupText.confirm(facts)}
      </p>
      <div className="sd-confirm-actions">
        <button type="button" className="sd-button sd-button-quiet" onClick={onCancel}>
          {backupText.cancel}
        </button>
        <button type="button" className="sd-button sd-button-danger" onClick={onConfirm}>
          {backupText.confirmButton}
        </button>
      </div>
    </dialog>
  )
}

export function BackupControls({ storage, reload, announce, restoreDisabledReason, today }: BackupControlsProps) {
  const file = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ snapshot: unknown; facts: number } | null>(null)
  const restoreDisabled = restoreDisabledReason !== undefined

  return (
    <div className="sd-backup">
      <button
        type="button"
        className="sd-button sd-button-quiet"
        onClick={() => {
          const text = makeBackup(storage, today())
          if (text === null) {
            announce(backupText.nothing)
            return
          }
          download(`study-dungeon-${today().toISOString().slice(0, 10)}.json`, text)
          announce(backupText.saved)
        }}
      >
        {backupText.backUp}
      </button>
      <button
        type="button"
        className="sd-button sd-button-quiet"
        aria-disabled={restoreDisabled ? true : undefined}
        title={restoreDisabled ? restoreDisabledReason : undefined}
        onClick={() => {
          if (!restoreDisabled) file.current?.click()
        }}
      >
        {backupText.restore}
      </button>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label={backupText.restore}
        onChange={async (event) => {
          const chosen = event.currentTarget.files?.[0]
          event.currentTarget.value = ""
          if (chosen === undefined) return
          const check = checkBackup(await chosen.text())
          if (!check.ok) {
            announce(check.reason, true)
            return
          }
          setPending({ snapshot: check.snapshot, facts: check.facts })
        }}
      />
      {pending !== null && (
        <ConfirmRestore
          facts={pending.facts}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            try {
              applyBackup(storage, pending.snapshot)
            } catch {
              setPending(null)
              announce(backupText.failed, true)
              return
            }
            reload()
          }}
        />
      )}
    </div>
  )
}
