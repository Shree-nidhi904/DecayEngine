// groupHouses (task 4.4; Req 10.2): houses by trimmed relationship, people
// without a tag in "Others" (last), houses by name, people by name then id,
// and every person exactly once. Fixed times only.

import { describe, expect, it } from "vitest"
import fc from "fast-check"
import type { Person } from "./policy"
import { loadSampleData } from "./sample-data"
import { OTHERS_HOUSE, groupHouses } from "./street"
import { T0, makeEngine } from "./test/fixtures"

/** A lit person as engine.view would return one; groupHouses reads only id, name and relationship. */
function person(id: string, name: string, relationship: string): Person {
  return {
    id,
    payload: { name, relationship, rhythmDays: 30, lastContactAt: T0 },
    policyData: { lastContactAt: T0 },
    health: 100,
    state: "alive",
    createdAt: T0,
    lastEventAt: T0,
    timesResurrected: 0,
    importance: 2,
    costMinutes: 10,
  }
}

const shape = (houses: ReturnType<typeof groupHouses>) =>
  houses.map((h) => [h.name, h.people.map((p) => p.payload.name)] as const)

describe("groupHouses", () => {
  it('groups by trimmed relationship, puts people without one in "Others", and puts "Others" last', () => {
    const houses = groupHouses([
      person("p1", "Tomas Novak", ""),
      person("p2", "Priya Raman", "Family"),
      person("p3", "Dan Okafor", " Work "),
      person("p4", "Grace Liu", "   "),
      person("p5", "Sunita Rao", "Family  "),
      person("p6", "Ayesha Khan", "College"),
    ])
    expect(OTHERS_HOUSE).toBe("Others")
    expect(shape(houses)).toEqual([
      ["College", ["Ayesha Khan"]],
      ["Family", ["Priya Raman", "Sunita Rao"]],
      ["Work", ["Dan Okafor"]],
      ["Others", ["Grace Liu", "Tomas Novak"]],
    ])
  })

  it("sorts people in a house by name, then by id when names repeat", () => {
    const houses = groupHouses([
      person("p9", "Mira Castell", "Work"),
      person("p2", "Joel Kim", "Work"),
      person("p3", "Mira Castell", "Work"),
    ])
    expect(houses).toHaveLength(1)
    expect(houses[0]!.people.map((p) => p.id)).toEqual(["p2", "p3", "p9"])
  })

  it('a tag that is literally "Others" joins the Others house, still last', () => {
    const houses = groupHouses([person("p1", "Leo Marchetti", "Others"), person("p2", "Nia Bello", ""), person("p3", "Joel Kim", "Zebra crossing")])
    expect(shape(houses)).toEqual([
      ["Zebra crossing", ["Joel Kim"]],
      ["Others", ["Leo Marchetti", "Nia Bello"]],
    ])
  })

  it("an empty street has no houses", () => {
    expect(groupHouses([])).toEqual([])
  })

  it("the sample street has the five houses of design section 6.2", () => {
    const engine = makeEngine()
    loadSampleData(engine, T0)
    expect(shape(groupHouses(engine.view(T0)))).toEqual([
      ["College", ["Ayesha Khan", "Meera Joshi", "Sam Rivera"]],
      ["Family", ["Harun Aziz", "Priya Raman", "Sunita Rao"]],
      ["Neighbours", ["Grace Liu", "Leo Marchetti"]],
      ["Work", ["Dan Okafor", "Joel Kim", "Nia Bello"]],
      ["Others", ["Tomas Novak"]],
    ])
  })

  it("every person appears exactly once, in a house named by their tag, with Others last", () => {
    const entry = fc.record({
      name: fc.constantFrom("Mira Castell", "Dan Okafor", "Grace Liu", "Joel Kim", "Ayesha Khan"),
      relationship: fc.constantFrom("", " ", "Family", " Family ", "Work", "college", "Others"),
    })
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 20 }), (entries) => {
        const people = entries.map((e, i) => person(`p${i + 1}`, e.name, e.relationship))
        const houses = groupHouses(people)

        const seen = houses.flatMap((h) => h.people.map((p) => p.id))
        expect(seen.slice().sort()).toEqual(people.map((p) => p.id).sort())
        expect(new Set(houses.map((h) => h.name)).size).toBe(houses.length)

        for (const house of houses) {
          for (const p of house.people) expect(p.payload.relationship.trim() || OTHERS_HOUSE).toBe(house.name)
        }
        const others = houses.findIndex((h) => h.name === OTHERS_HOUSE)
        if (others !== -1) expect(others).toBe(houses.length - 1)
      }),
      { numRuns: 100 }
    )
  })
})
