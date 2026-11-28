// An (i) button beside a field's label that shows a short note under it
// (feedback list, point 13). A toggle, so it works with a tap, a click and the
// keyboard (never hover alone). The note stays in the page while shown, and the
// button says whether it is open (aria-expanded).
import { useId, useState } from "react"
import { fieldHelpText } from "../wording"
import "../styles/sheet.css"

export function useFieldHelp(field: string, note: string) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const noteId = `${id}-help`
  const button = (
    <button
      type="button"
      className="gh-field-help"
      aria-label={fieldHelpText.show(field)}
      aria-expanded={open}
      aria-controls={noteId}
      onClick={() => setOpen((o) => !o)}
    >
      i
    </button>
  )
  const text = open ? (
    <p id={noteId} className="gh-field-help-text">
      {note}
    </p>
  ) : (
    <span id={noteId} hidden />
  )
  return { button, text }
}
