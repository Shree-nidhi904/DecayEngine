// Confirmation before a fact is removed (task 6.3, Requirement 6).
// A native modal <dialog>: focus stays inside it, and Escape cancels.

import { useEffect, useRef } from "react"
import { removeCancelLabel, removeConfirmText, studyDungeonWording } from "../wording"

export interface ConfirmRemoveDialogProps {
  /** The fact's question, shown so the user knows what is being removed. */
  question: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmRemoveDialog({ question, onConfirm, onCancel }: ConfirmRemoveDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) return
    if (!dialog.open) dialog.showModal()
    // close() fires "close", not "cancel", so this does not call onCancel.
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={ref}
      className="sd-confirm"
      aria-labelledby="sd-confirm-text"
      onCancel={(event) => {
        // Escape: let React unmount the dialog instead of the browser closing it.
        event.preventDefault()
        onCancel()
      }}
    >
      <p id="sd-confirm-text" className="sd-confirm-text">
        {removeConfirmText}
      </p>
      <p className="sd-confirm-question">{question}</p>
      <div className="sd-confirm-actions">
        {/* Cancel comes first, so it has focus when the dialog opens. */}
        <button type="button" className="sd-button sd-button-quiet" onClick={onCancel}>
          {removeCancelLabel}
        </button>
        <button type="button" className="sd-button sd-button-danger" onClick={onConfirm}>
          {studyDungeonWording.actions.remove}
        </button>
      </div>
    </dialog>
  )
}
