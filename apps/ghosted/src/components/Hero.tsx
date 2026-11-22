// The hero (task 4.5, design section 4.4; Req 8.1-8.7, 16.1, 20.1, 20.9).
// Ported from the wireframe's .hero: what needs attention, one filled
// button, and the big counters (the shell's Counters: glyph, count and list
// name). Five cases, checked in this order:
//
//   first run             "Welcome to the street."      Load sample street (+ quiet Start empty)
//   no people             "No windows yet."              Add a person
//   N flickering          "N windows are flickering"     Reach out to <first name>
//   none fading, ≥1 dark  "Nobody is fading."            See the empty windows
//   everyone lit          "Every window is lit."         Look at the street
//
// While previewing, the eyebrow names the previewed day and every button
// here is blocked: visible, focusable, aria-disabled with the reason, and
// its activation does nothing (Req 8.5). Engine calls: none.
//
// Task P4 (Req 35): when the App passes `loss`, one plain line straight after
// the h2 says how many windows start to flicker and go dark in the next 7
// days. The App works it out at the real time and leaves it out while
// previewing and on the first run.

import { useId, useMemo, type ReactNode, type RefObject } from "react"
import { Counters } from "@decay-engine/shell"
import { firstName, heroTarget, stateCounts, type BlockedReason, type SectionId } from "../lists"
import type { LossForecast } from "../loss-forecast"
import type { Person } from "../policy"
import { ghostedShellTheme } from "../theme"
import { ghostedWording, heroText } from "../wording"
import { ghostedIcons } from "./icons"
import "../styles/layout.css"

export interface HeroProps {
  /** engine.view(now). */
  people: readonly Person[]
  /** needsFirstRun(storage, people.length). */
  firstRun: boolean
  /** Set while previewing, for example "3 Mar 2027". */
  previewDate?: string
  blocked: BlockedReason
  /** The h2 (tabindex -1): the focus target after the splash and the fallback when a dialog's opener is gone. */
  headingRef: RefObject<HTMLHeadingElement>
  onReachOut: (person: Person) => void
  /** Moves focus to that section's heading. */
  onGoTo: (section: SectionId) => void
  onLoadSample: () => void
  /** The App marks started and opens "Add a person". */
  onStartEmpty: () => void
  onAdd: () => void
  /**
   * The loss forecast for the next 7 days at the real time (task P4, Req 35).
   * The App passes undefined while previewing and on the first run;
   * lossForecast gives null when nobody is lit or flickering. Either way the
   * line is not shown.
   */
  loss?: LossForecast | null
}

export type HeroCase = "first-run" | "empty" | "fading" | "dark" | "lit"

type Action = { label: string; run: () => void }

export function Hero({
  people,
  firstRun,
  previewDate,
  blocked,
  headingRef,
  onReachOut,
  onGoTo,
  onLoadSample,
  onStartEmpty,
  onAdd,
  loss,
}: HeroProps) {
  const id = useId()
  const headingId = `${id}-message`
  const blockedId = `${id}-blocked`
  const counts = useMemo(() => stateCounts(people), [people])
  const target = useMemo(() => heroTarget(people), [people])

  let heroCase: HeroCase
  let message: string
  let primary: Action
  let quiet: Action | null = null
  if (firstRun) {
    heroCase = "first-run"
    message = heroText.welcome
    primary = { label: heroText.loadSample, run: onLoadSample }
    quiet = { label: heroText.startEmpty, run: onStartEmpty }
  } else if (people.length === 0) {
    heroCase = "empty"
    message = heroText.noWindows
    primary = { label: heroText.addPerson, run: onAdd }
  } else if (target !== undefined) {
    heroCase = "fading"
    message = heroText.flickering(counts.weak)
    primary = { label: heroText.reachOutTo(firstName(target.payload.name)), run: () => onReachOut(target) }
  } else if (counts.dead > 0) {
    heroCase = "dark"
    message = heroText.nobodyFading
    primary = { label: heroText.seeEmpty, run: () => onGoTo("empty") }
  } else {
    heroCase = "lit"
    message = heroText.allLit
    primary = { label: heroText.lookAtStreet, run: () => onGoTo("street") }
  }

  /** A hero button: active, or aria-disabled with the reason while previewing. */
  const button = (action: Action, filled: boolean, role: "primary" | "quiet"): ReactNode => {
    const className = filled ? "gh-button gh-button-primary gh-hero-action" : "gh-button gh-hero-action"
    if (blocked === undefined) {
      return (
        <button type="button" className={className} data-hero-action={role} onClick={action.run}>
          {action.label}
        </button>
      )
    }
    return (
      <button
        type="button"
        className={className}
        data-hero-action={role}
        aria-disabled="true"
        aria-describedby={blockedId}
        title={blocked}
        onClick={() => {}}
      >
        {action.label}
      </button>
    )
  }

  return (
    <section className="gh-hero" aria-labelledby={headingId} data-case={heroCase}>
      <div className="gh-hero-main">
        {previewDate !== undefined && <p className="gh-hero-eyebrow">{heroText.previewEyebrow(previewDate)}</p>}
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="gh-hero-title">
          {message}
        </h2>
        {/* A plain line: no live region, role or tabindex, so a tick never announces it (Req 35.10). */}
        {loss !== undefined && loss !== null && (
          <p className="gh-hero-loss">{heroText.lossForecast(loss.fade, loss.dark)}</p>
        )}
        <div className="gh-hero-actions">
          {button(primary, true, "primary")}
          {quiet !== null && button(quiet, false, "quiet")}
        </div>
        {blocked !== undefined && (
          <p id={blockedId} className="gh-hero-blocked">
            {blocked}
          </p>
        )}
      </div>
      <div className="gh-hero-stats">
        <Counters
          alive={counts.alive}
          weak={counts.weak}
          dead={counts.dead}
          theme={ghostedShellTheme}
          wording={ghostedWording}
          icons={ghostedIcons}
        />
      </div>
    </section>
  )
}
