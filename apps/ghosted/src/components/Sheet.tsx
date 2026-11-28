// A side sheet for Settings and the Profile (feedback list, points 7 and 21).
// A native <dialog> that stays mounted while closed, so what is inside keeps
// running: the sync panel keeps syncing by itself, and a setting keeps its
// state. Opening it remembers the button that opened it and gives focus back
// on close. Escape and Close both call onClose. A cancel from a dialog opened
// inside the sheet (the reset or restore confirmation) is that dialog's own,
// so it is ignored here and one Escape closes only the inner dialog.
import { useEffect, useRef, type ReactNode } from "react"
import { topBarText } from "../wording"
import "../styles/sheet.css"

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  /** For the title's id. */
  id: string
  children: ReactNode
}

export function Sheet({ open, onClose, title, id, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) return
    if (open && !dialog.open) {
      const active = document.activeElement
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null
      if (typeof dialog.showModal === "function") dialog.showModal()
      else dialog.setAttribute("open", "")
      dialog.scrollTop = 0
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close()
      else dialog.removeAttribute("open")
      const back = opener.current
      opener.current = null
      if (back !== null && back.isConnected) back.focus({ preventScroll: true })
    }
  }, [open])
  return (
    <dialog
      ref={ref}
      id={id}
      className="gh-sheet"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        onClose()
      }}
      onClose={(event) => {
        // The browser closed it (for example Escape twice): keep the App's state in step.
        if (event.target === event.currentTarget && open) onClose()
      }}
    >
      <div className="gh-sheet-head">
        <h2 id={`${id}-title`} className="gh-sheet-title">
          {title}
        </h2>
        <button type="button" className="gh-button gh-sheet-close" onClick={onClose}>
          {topBarText.close}
        </button>
      </div>
      <div className="gh-sheet-body">{children}</div>
    </dialog>
  )
}
