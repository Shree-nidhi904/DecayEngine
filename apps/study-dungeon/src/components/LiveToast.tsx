// The short message after a minute tick moved facts (task L3, Requirement
// 23.3 to 23.5, design "Live State Changes", The toast). Written by Kiro.
//
// It sits at the top of the time dock, inside the dock's own box, so it
// never covers the dock's controls, the Triage panel or anything else: the
// dock grows by its height and the page's bottom room follows through
// --dock-h (world.css). It is not a live region and has no role: the App
// says the same words once through its one polite live region (announce),
// so the visible text is aria-hidden whenever it was announced. It never
// takes focus; its only focusable part is the quiet Dismiss button (never
// the primary class: Play stays the dock's only filled button).
//
// With motion it fades in, stays about six seconds and fades out
// (live.css); the end of that animation removes it. Under reduced motion it
// does not move: it stays until Dismiss, or until the next minute tick.

import { useEffect, useRef } from "react"
import { liveText } from "../wording"
import "../styles/live.css"

export interface LiveToastProps {
  text: string
  /** True when the App's live region said these words, so the visible copy is hidden from screen readers. */
  announced: boolean
  /** Dismiss, or the end of the fade-out. */
  onDone: () => void
}

export function LiveToast({ text, announced, onDone }: LiveToastProps) {
  // The fade's end (a native listener, so it hears the unprefixed event; only the toast's own animation counts).
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const toast = ref.current
    if (toast === null) return
    const ended = (event: Event) => {
      if (event.target === toast) onDone()
    }
    toast.addEventListener("animationend", ended)
    return () => toast.removeEventListener("animationend", ended)
  }, [onDone])
  return (
    <div ref={ref} className="sd-toast">
      <p className="sd-toast-text" aria-hidden={announced ? "true" : undefined}>
        {text}
      </p>
      <button type="button" className="sd-button sd-button-quiet sd-toast-dismiss" onClick={onDone}>
        {liveText.dismiss}
      </button>
    </div>
  )
}
