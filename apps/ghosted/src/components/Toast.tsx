// A small message in the bottom-right corner (feedback list, point 18), for
// words such as "Backup saved as …". A bar shrinks over 5 seconds and the
// message goes. A problem stays until dismissed. The words are already read
// by the App's live region, so the toast itself is not a live region.
import { useEffect, useRef } from "react"
import { liveText } from "../wording"
import "../styles/sheet.css"

/** How long a message stays, in ms. */
export const TOAST_MS = 5000

export interface ToastProps {
  text: string
  problem: boolean
  onDone: () => void
  /** setTimeout, injectable for tests. */
  schedule?: (run: () => void, ms: number) => () => void
}

const browserSchedule = (run: () => void, ms: number) => {
  const id = setTimeout(run, ms)
  return () => clearTimeout(id)
}

export function Toast({ text, problem, onDone, schedule = browserSchedule }: ToastProps) {
  // The latest onDone, so a re-render of the App does not restart the 5 seconds.
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => (problem ? undefined : schedule(() => done.current(), TOAST_MS)), [problem, schedule])
  // A popover goes to the browser's top layer, above an open Settings pop-up (never behind its backdrop).
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
    <div className="gh-corner-toast" ref={box} data-problem={problem ? "" : undefined}>
      <p className="gh-corner-toast-text">{text}</p>
      <button type="button" className="gh-button gh-corner-toast-close" onClick={onDone}>
        {liveText.dismiss}
      </button>
      {!problem && <span className="gh-corner-toast-bar" aria-hidden="true" />}
    </div>
  )
}
