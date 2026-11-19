// "Reset all data" (task 11.4, Requirement 13.6).
// The button asks "Reset all data? This cannot be undone." in a native modal
// <dialog> (Cancel first, so it has focus; Escape cancels). Confirming calls
// onConfirm; the App removes the keys and reloads. Disabled while previewing:
// the button stays visible and focusable, says why, and opens nothing.

import { useState, type ReactNode } from "react"
import { resetText } from "../wording"
import { useModalDialog } from "./useModalDialog"
import "../styles/dialogs.css"
import "../styles/hero.css"

export interface ResetDataProps {
  onConfirm: () => void
  /** When set, the button is disabled with this reason. */
  disabledReason?: string
  /** Other settings shown before the reset button, in the same area (the sound switch). */
  children?: ReactNode
}

function ConfirmResetDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const ref = useModalDialog()
  return (
    <dialog
      ref={ref}
      className="sd-confirm"
      aria-labelledby="sd-reset-text"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <p id="sd-reset-text" className="sd-confirm-text">
        {resetText.confirm}
      </p>
      <div className="sd-confirm-actions">
        <button type="button" className="sd-button sd-button-quiet" onClick={onCancel}>
          {resetText.cancel}
        </button>
        <button type="button" className="sd-button sd-button-danger" onClick={onConfirm}>
          {resetText.confirmButton}
        </button>
      </div>
    </dialog>
  )
}

export function ResetData({ onConfirm, disabledReason, children }: ResetDataProps) {
  const [asking, setAsking] = useState(false)
  const disabled = disabledReason !== undefined
  return (
    <div className="sd-settings">
      {children}
      <button
        type="button"
        className="sd-button sd-button-quiet"
        aria-disabled={disabled ? true : undefined}
        title={disabled ? disabledReason : undefined}
        onClick={() => {
          if (disabled) return
          setAsking(true)
        }}
      >
        {resetText.button}
      </button>
      {asking && !disabled && (
        <ConfirmResetDialog
          onConfirm={() => {
            setAsking(false)
            onConfirm()
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </div>
  )
}
