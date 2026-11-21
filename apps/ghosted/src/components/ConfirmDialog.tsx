// A confirmation before something that cannot be undone (task 4.6, design
// section 4.4 ConfirmDialog; Req 13.5, 20.7, 24.2, 24.3): removing a person
// and resetting all data. Modelled on Study Dungeon's ConfirmRemoveDialog,
// not imported from it (Req 21.1).
//
// A native modal <dialog> through useModalDialog: focus opens on the message
// (tabindex -1), never on a button; it stays inside; Escape cancels; on
// close, focus goes back to the opener (the App falls back to the hero
// heading when the opener is gone). Cancel comes first. The confirm button is
// outlined in --rust, so nothing here is filled. Engine calls: none; the App
// writes through runGatedWrite in onConfirm.

import { useId } from "react"
import { dialogText } from "../wording"
import { useModalDialog } from "./useModalDialog"
import "../styles/layout.css"
import "../styles/dialogs.css"

export interface ConfirmDialogProps {
  /** "Remove Mira Castell? This cannot be undone." or "Reset all data? This cannot be undone." */
  message: string
  /** "Remove" or "Reset all data". */
  confirmLabel: string
  onConfirm: () => void
  /** Cancel and Escape. */
  onCancel: () => void
}

export function ConfirmDialog({ message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useModalDialog()
  const messageId = useId()

  return (
    <dialog
      ref={ref}
      className="gh-dialog gh-confirm"
      aria-labelledby={messageId}
      onCancel={(event) => {
        // Escape: let React unmount the dialog instead of the browser closing it.
        event.preventDefault()
        onCancel()
      }}
    >
      <p id={messageId} className="gh-dialog-message" tabIndex={-1} data-autofocus>
        {message}
      </p>
      <div className="gh-dialog-actions">
        <button type="button" className="gh-button" data-action="cancel" onClick={onCancel}>
          {dialogText.cancel}
        </button>
        <button type="button" className="gh-button gh-button-danger" data-action="confirm" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
