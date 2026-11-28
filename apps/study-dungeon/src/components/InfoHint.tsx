// An "(i)" button beside a field (feedback list, point 13). It opens and closes a
// short note under the field. A real button, so it works by keyboard and touch,
// never by hover alone. The note's id is for the field's aria-describedby.

import { useState } from "react"

export interface InfoHintProps {
  /** The field's name, for the button's accessible name ("What is importance?"). */
  buttonLabel: string
  /** The explanation. */
  note: string
  /** Gives the note an id the field can point to while the note is open. */
  noteId: string
  /** Told when the note opens or closes, so the field can add or drop it from aria-describedby. */
  onToggle?: (open: boolean) => void
}

export function InfoHint({ buttonLabel, note, noteId, onToggle }: InfoHintProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="sd-info-button"
        aria-label={buttonLabel}
        aria-expanded={open}
        aria-controls={noteId}
        onClick={() => {
          setOpen(!open)
          onToggle?.(!open)
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      <p id={noteId} className="sd-info-note" hidden={!open}>
        {note}
      </p>
    </>
  )
}
