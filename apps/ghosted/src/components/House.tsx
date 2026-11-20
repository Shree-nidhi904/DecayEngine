// One house on the Street: a roof and a wall around its windows (task 4.1,
// design section 4.4; Req 10.1, 10.4, 16.1). Ported from the wireframe's
// .house / .roof / .hbody. Each person is one window button whose name says
// the person, the state word and the freshness; inside it the window light,
// the first name, and the glyph with the state word (light, glyph and word).

import type { CSSProperties } from "react"
import { shownFreshness, shownState } from "../lists"
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

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name

export function House({ name, people, onOpen, relitId }: HouseProps) {
  const columns = houseColumns(people.length)
  // The wireframe's widths: 76px per column plus the wall's padding, never wider than the street.
  const style = { "--c": String(columns), "--w": `${columns * 76 + 24}px` } as CSSProperties

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
