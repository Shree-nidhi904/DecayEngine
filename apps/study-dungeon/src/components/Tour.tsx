// The first-run tour (task 11.5, Requirement 13.5): four short steps (the
// Crypt, the Dungeon, Fight, the time machine), shown once right after first
// run. The App decides when to show it and saves the "done" flag.
//
// It is a small panel, not a modal: the page stays usable behind it. Each
// step outlines the part it talks about (data-tour-active). Keyboard: focus
// starts on Next; Tab reaches Skip tour, Back and Next; Enter or Space
// presses them; Escape skips the tour. Scrolling to a step's target is
// instant, so nothing moves on its own (reduced motion).

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { tourText } from "../wording"
import "../styles/tour.css"

export type TourStepId = keyof typeof tourText.steps

/** The steps in order, each with the part of the page it outlines. */
export const TOUR_STEPS: readonly { id: TourStepId; target: string }[] = [
  { id: "crypt", target: "#sd-tab-alive" },
  { id: "dungeon", target: "#sd-tab-weak" },
  // The hero's "Fight the weakest", else the first Fight on a card. With no
  // facts there is none, and the step is text only.
  { id: "fight", target: ".sd-hero-action, .sd-lists .shell-item-card .shell-button-primary" },
  { id: "timeMachine", target: ".shell-time-machine" },
]

/** Marks the part of the page the current step is about. */
export const TOUR_TARGET_ATTRIBUTE = "data-tour-active"

export interface TourProps {
  /** Finished or skipped. The App saves the flag and hides the tour. */
  onDone: () => void
}

export function Tour({ onDone }: TourProps) {
  const [index, setIndex] = useState(0)
  const nextRef = useRef<HTMLButtonElement>(null)
  const ids = { title: useId(), body: useId() }
  const step = TOUR_STEPS[index]!
  const text = tourText.steps[step.id]
  const last = index === TOUR_STEPS.length - 1

  // Focus stays on Next (or Done), so Enter walks through the tour.
  useEffect(() => {
    nextRef.current?.focus()
  }, [index])

  // Outline this step's target, and bring it into view without animating.
  useEffect(() => {
    const target = document.querySelector(step.target)
    if (!(target instanceof HTMLElement)) return
    target.setAttribute(TOUR_TARGET_ATTRIBUTE, "")
    if (typeof target.scrollIntoView === "function") target.scrollIntoView({ block: "nearest" })
    return () => target.removeAttribute(TOUR_TARGET_ATTRIBUTE)
  }, [step.target])

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") return
    event.preventDefault()
    onDone()
  }

  return (
    <aside
      className="sd-tour"
      aria-label={tourText.label}
      aria-describedby={ids.body}
      data-step={step.id}
      onKeyDown={onKeyDown}
    >
      {/* Read out when the step changes, since focus stays on Next. */}
      <div aria-live="polite" aria-atomic="true">
        <p className="sd-tour-progress num">{tourText.progress(index + 1, TOUR_STEPS.length)}</p>
        <h2 id={ids.title} className="sd-tour-title">
          {text.title}
        </h2>
        <p id={ids.body} className="sd-tour-body">
          {text.body}
        </p>
      </div>
      <div className="sd-tour-actions">
        <button type="button" className="sd-button sd-button-quiet sd-tour-skip" onClick={onDone}>
          {tourText.skip}
        </button>
        {index > 0 && (
          <button type="button" className="sd-button sd-button-quiet" onClick={() => setIndex(index - 1)}>
            {tourText.back}
          </button>
        )}
        <button
          ref={nextRef}
          type="button"
          className="sd-button sd-button-primary"
          onClick={() => (last ? onDone() : setIndex(index + 1))}
        >
          {last ? tourText.done : tourText.next}
        </button>
      </div>
    </aside>
  )
}
