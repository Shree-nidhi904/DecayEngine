// One house on the Street: a roof and a wall around its windows (task 4.1,
// design section 4.4; Req 10.1, 10.4, 16.1). Ported from the wireframe's
// .house / .roof / .hbody. Each person is one window button whose name says
// the person, the state word and the freshness; inside it the window light,
// the first name, and the glyph with the state word (light, glyph and word).

import type { CSSProperties } from "react"
import { firstName, shownFreshness, shownState } from "../lists"
import type { Person } from "../policy"
import { stateWords } from "../wording"
import { StateGlyph } from "./icons"
import { Window } from "./Window"
import "../styles/street.css"

export interface HouseProps {
  name: string
  people: readonly Person[]
  onOpen: (person: Person) => void
  /** The person just tended or reconnected: their window flashes once. */
  relitId?: string
}

/** Columns per house, as the wireframe: 1 for one person, 2 for two or three, 3 for more. */
export function houseColumns(count: number): number {
  return count > 3 ? 3 : count < 2 ? 1 : 2
}

/** "Mira Castell, flickering, freshness 44": the window button's accessible name. */
export function windowName(person: Person): string {
  return `${person.payload.name}, ${stateWords[shownState(person)]}, freshness ${shownFreshness(person.health)}`
}

/**
 * Width of one window column. The wireframe used 76px; 88px leaves room for
 * the longest state word, "flickering", at the label's 11px on one line,
 * even when a three-column house is squeezed to the street's width at 320px.
 * Three columns are 288px, the content box at 320px, so the street never
 * scrolls sideways (Req 24.4).
 */
export const WINDOW_COLUMN_PX = 88

/** A house's widest size: its columns plus the wall's padding (the CSS caps it at 100%). */
export function houseWidth(columns: number): number {
  return columns * WINDOW_COLUMN_PX + 24
}

export function House({ name, people, onOpen, relitId }: HouseProps) {
  const columns = houseColumns(people.length)
  const style = { "--c": String(columns), "--w": `${houseWidth(columns)}px` } as CSSProperties

  return (
    <div className="gh-house" style={style}>
      <div className="gh-house-roof" aria-hidden="true" />
      <div className="gh-house-body">
        <h3 className="gh-house-name">{name}</h3>
        <ul className="gh-wins">
          {people.map((person) => {
            const state = shownState(person)
            return (
              <li key={person.id}>
                <button
                  type="button"
                  className="gh-win"
                  data-state={state}
                  aria-label={windowName(person)}
                  onClick={() => onOpen(person)}
                >
                  <Window health={person.health} state={state} size="street" relight={person.id === relitId} />
                  {/* Moths around a lit window (task 4.4): shown and moving only without reduced motion (motion.css). */}
                  {person.state === "alive" && (
                    <span className="gh-moths" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                  <span className="gh-win-name">{firstName(person.payload.name)}</span>
                  <span className="gh-win-meta gh-state" data-state={state}>
                    <StateGlyph state={state} />
                    {stateWords[state]}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
