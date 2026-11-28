// A short message in the bottom right corner (feedback list, point 18), for
// things like "Backup downloaded". A bar under the words runs down for five
// seconds, then the toast closes itself. Close closes it sooner. The App's live
// region says the same words, so the visible copy is hidden from screen readers.

import { useEffect, useRef } from "react"
import { toastText } from "../wording"
import "../styles/topbar.css"

/** How long the toast stays, in milliseconds. The bar in topbar.css runs for the same time. */
export const CORNER_TOAST_MS = 5000

export interface CornerToastProps {
  text: string
  onDone: () => void
}

export function CornerToast({ text, onDone }: CornerToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDone, CORNER_TOAST_MS)
    return () => clearTimeout(timer)
  }, [onDone])
  // A popover goes to the browser's top layer, above an open Settings pop-up, so the message is never behind its backdrop.
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = box.current
    if (element === null || typeof element.showPopover !== "function") return
    element.setAttribute("popover", "manual")
    try {
      element.showPopover()
    } catch {
      // Already shown, or not supported: the fixed position still shows it.
    }
    return () => {
      try {
        element.hidePopover()
      } catch {
        // Already gone.
      }
    }
  }, [])
  return (
    <div className="sd-corner-toast" ref={box}>
      <p className="sd-corner-toast-text" aria-hidden="true">
        {text}
      </p>
      <button type="button" className="sd-button sd-button-quiet sd-corner-toast-close" onClick={onDone}>
        {toastText.dismiss}
      </button>
      <span className="sd-corner-toast-bar" aria-hidden="true" />
    </div>
  )
}
