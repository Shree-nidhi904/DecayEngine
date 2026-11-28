// The Street (task 4.4, design section 4.4; Req 10.1-10.5, 16.1, 25.1).
// Ported from the wireframe's .plot.street: a heading, the note that the
// light shows how recently you were in touch (never how much anyone
// matters), the houses grouped by relationship (street.ts), and a legend
// with each glyph and word. Fog drifts and headlights sweep along the kerb
// only without reduced motion (motion.css); under reduced motion the fog is
// still and the headlights are not shown. Engine calls: none.

import { useId, useMemo, type RefObject } from "react"
import type { Person } from "../policy"
import { groupHouses } from "../street"
import { freshnessText, stateWords, streetText } from "../wording"
import { Glyph } from "./icons"
import { House } from "./House"
import { Sky, StreetGhost } from "./Haunt"
import { Branch, Road, Skyline } from "./Scene"
import type { Crossing } from "../preview-crossings"
import "../styles/street.css"
import "../styles/motion.css"
import "../styles/scene.css"

export interface StreetProps {
  people: readonly Person[]
  /** Opens the person's card (the App's { kind: "person" } dialog). */
  onOpen: (person: Person) => void
  /** The Street's h2 (tabindex -1), the section navigation's focus target. */
  headingRef: RefObject<HTMLHeadingElement>
  /** The person just tended or reconnected: one relight flash. */
  relitId?: string
  /** Haunt pass (Req 1.4): who crosses in the time machine's preview. */
  crossed?: ReadonlyMap<string, Crossing>
  /** Haunt pass: the people picked for a Triage session. */
  picked?: ReadonlySet<string>
}

/** The legend: circle "lit", triangle "flickering", cross "boarded up" (Req 10.3). */
const LEGEND = [
  { shape: "circle", word: stateWords.alive, state: "alive" },
  { shape: "triangle", word: stateWords.weak, state: "weak" },
  { shape: "cross", word: stateWords.dead, state: "dead" },
] as const

export function Street({ people, onOpen, headingRef, relitId, crossed, picked }: StreetProps) {
  const headingId = useId()
  const houses = useMemo(() => groupHouses(people), [people])
  const anyDark = people.some((p) => p.state === "dead")

  return (
    <section className="gh-plot gh-street" data-section="street" aria-labelledby={headingId}>
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="gh-plot-title">
        {streetText.title}
      </h2>
      <p className="gh-plot-sub">{freshnessText.streetNote}</p>
      <div className="gh-street-scene" data-dark={anyDark ? "" : undefined}>
        {/* Haunt pass: the sky, a ghost when a window is dark, and the flashlight (haunt.css, motion.css). */}
        <Sky />
        {/* Art direction pass: the town on the horizon, then fog, then the houses. */}
        <Skyline />
        <span className="gh-fog" aria-hidden="true" />
        <StreetGhost />
        <div className="gh-houses">
          {houses.map((house, index) => (
            <House
              key={house.name}
              variant={index}
              name={house.name}
              people={house.people}
              onOpen={onOpen}
              relitId={relitId}
              crossed={crossed}
              picked={picked}
            />
          ))}
        </div>
        <Road />
        <span className="gh-headlights" aria-hidden="true" />
        <span className="gh-groundfog" aria-hidden="true" />
        <Branch />
        <span className="gh-flashlight" aria-hidden="true" />
      </div>
      <ul className="gh-legend">
        {LEGEND.map(({ shape, word, state }) => (
          <li key={state} className="gh-state" data-state={state}>
            <Glyph shape={shape} />
            {word}
          </li>
        ))}
      </ul>
    </section>
  )
}
