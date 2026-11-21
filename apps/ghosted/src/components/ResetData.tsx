// "Reset all data" (task 4.6, design section 4.4 ResetData; Req 20.7, 12.5).
// Written for Ghosted from design section 4.4, on Ghosted's ConfirmDialog;
// no import from apps/study-dungeon (Req 21.1).
//
// A quiet button that opens a ConfirmDialog ("Reset all data? This cannot be
// undone."). Only on confirm does it call onConfirm, where the App runs
// resetAllData (exactly RESET_KEYS, then a reload) through runGatedWrite.
// Cancel and Escape change nothing. While previewing, the button stays
// visible and focusable, is aria-disabled with the reason, and opens nothing.

import { useId, useState } from "react"
import type { BlockedReason } from "../lists"
import { resetText } from "../wording"
import { ConfirmDialog } from "./ConfirmDialog"
import "../styles/layout.css"

export interface ResetDataProps {
  /** The App: runGatedWrite(previewing, () => resetAllData(storage, reload)). */
  onConfirm: () => void
  blocked: BlockedReason
}

export function ResetData({ onConfirm, blocked }: ResetDataProps) {
  const [confirming, setConfirming] = useState(false)
  const blockedId = useId()

  return (
    <>
      {blocked === undefined ? (
        <button type="button" className="gh-button" data-action="reset" onClick={() => setConfirming(true)}>
          {resetText.button}
        </button>
      ) : (
        <>
          <button
            type="button"
            className="gh-button"
            data-action="reset"
            aria-disabled="true"
            aria-describedby={blockedId}
            title={blocked}
            onClick={() => {}}
          >
            {resetText.button}
          </button>
          <span id={blockedId} className="gh-visually-hidden">
            {blocked}
          </span>
        </>
      )}
      {confirming && (
        <ConfirmDialog
          message={resetText.confirm}
          confirmLabel={resetText.confirmLabel}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            onConfirm()
          }}
        />
      )}
    </>
  )
}
