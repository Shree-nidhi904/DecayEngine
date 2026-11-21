// Houses on the Street (task 4.4, design section 4.4; Req 10.2). Pure.
//
// People are grouped by their trimmed relationship tag. People without a tag
// live in one house, "Others" (a tag that is literally "Others" joins it).
// Houses are sorted by name with "Others" last; people within a house by
// name, then by id, so the order never depends on insertion order. Every
// person appears exactly once.

import { compareIds } from "./lists"
import type { Person } from "./policy"
import { streetText } from "./wording"

export type HouseGroup = { name: string; people: Person[] }

/** The house for people without a relationship tag. */
export const OTHERS_HOUSE = streetText.others

const byText = (a: string, b: string) => a.localeCompare(b, "en-GB")

export function groupHouses(people: readonly Person[]): HouseGroup[] {
  const houses = new Map<string, Person[]>()
  for (const person of people) {
    const name = person.payload.relationship.trim() || OTHERS_HOUSE
    const members = houses.get(name)
    if (members === undefined) houses.set(name, [person])
    else members.push(person)
  }
  return [...houses.entries()]
    .sort(([a], [b]) => {
      if (a === OTHERS_HOUSE) return b === OTHERS_HOUSE ? 0 : 1
      if (b === OTHERS_HOUSE) return -1
      return byText(a, b) || compareIds(a, b)
    })
    .map(([name, members]) => ({
      name,
      people: members.sort((a, b) => byText(a.payload.name, b.payload.name) || compareIds(a.id, b.id)),
    }))
}
