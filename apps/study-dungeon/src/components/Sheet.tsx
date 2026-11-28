// A side sheet for Settings and the Profile (feedback list, point 7). A native
// <dialog> that stays mounted while closed, so what is inside keeps running:
// the sync panel keeps syncing by itself, and a setting keeps its state.
// Opening it remembers the button that opened it and gives focus back on close.
// Escape and the Close button both call onClose.
import { useEffect, useRef, type ReactNode } from "react"

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  /** For the title's id and the CSS. */
  id: string
  children: ReactNode
}

/** Where to put the pop-up's scroll when it opens again right after a remount (the memory model switch). */
let scrollToRestore: number | null = null
export function rememberSheetScroll(id: string): void {
  const dialog = document.getElementById(id)
  scrollToRestore = dialog === null ? null : dialog.scrollTop
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
      dialog.scrollTop = scrollToRestore ?? 0
      scrollToRestore = null
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
      className="sd-sheet"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        // React passes a nested dialog's "cancel" up to this handler (the reset confirmation inside
        // Settings): only a cancel aimed at the sheet itself closes the sheet.
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        onClose()
      }}
    >
      <div className="sd-sheet-head">
        <h2 id={`${id}-title`} className="sd-sheet-title">
          {title}
        </h2>
        <button type="button" className="sd-button sd-button-quiet sd-sheet-close" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="sd-sheet-body">{children}</div>
    </dialog>
  )
}
