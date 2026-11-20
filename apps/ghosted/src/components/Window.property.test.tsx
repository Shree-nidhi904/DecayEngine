// Property 10: Light follows freshness (task 4.1, design section 7.3; Req 16.3).
// People come from real engine replays (test/generators.ts); fixed times only.

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import fc from "fast-check"
import { Window } from "./Window"
import { shownState } from "../lists"
import { personAt, scenario } from "../test/generators"
import { litOf, one } from "../test/dom"

afterEach(cleanup)

describe("Window light", () => {
  // Feature: ghosted, Property 10: Light follows freshness
  it("Property 10: --lit is within 5e-5 of health / 100, and 0 for a dead person", () => {
    fc.assert(
      fc.property(scenario(), (s) => {
        const { person } = personAt(s)
        const { container, unmount } = render(
          <Window health={person.health} state={shownState(person)} size="card" />
        )
        const lit = Number(litOf(one(container, ".gh-pane")))
        unmount()

        expect(Number.isFinite(lit)).toBe(true)
        if (person.state === "dead") expect(lit).toBe(0)
        else expect(Math.abs(lit - person.health / 100)).toBeLessThanOrEqual(5e-5)
      }),
      { numRuns: 100 }
    )
  })
})
