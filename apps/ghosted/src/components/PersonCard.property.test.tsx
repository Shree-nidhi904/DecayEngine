// Property 11: State in three ways (task 4.2, design section 7.3; Req 16.1,
// 16.2). For any generated person, the card and its window show the light
// state, the glyph and the word that match shownState(person). People come
// from real engine replays (test/generators.ts); fixed times only.

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import fc from "fast-check"
import { MAX_FORECAST_HORIZON_MS } from "@decay-engine/engine"
import { PersonCard } from "./PersonCard"
import { glyphOf } from "./icons"
import { shownState } from "../lists"
import { stateWords } from "../wording"
import { personAt, scenario } from "../test/generators"
import { one } from "../test/dom"

afterEach(cleanup)

const noop = () => {}
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

describe("PersonCard state", () => {
  // Feature: ghosted, Property 11: State in three ways
  it("Property 11: the card and its window show the light state, glyph and word of shownState", () => {
    fc.assert(
      fc.property(scenario(), (s) => {
        const { person, now, engine } = personAt(s)
        const shown = shownState(person)
        const darkAt = engine.forecast(now, MAX_FORECAST_HORIZON_MS).find((e) => e.item.id === person.id)?.diesAt ?? null
        const { container, unmount } = render(
          <PersonCard
            person={person}
            now={now}
            darkAt={darkAt}
            engine={engine}
            history={engine.history(person.id)}
            blocked={undefined}
            formatDate={isoDay}
            onReachOut={noop}
            onReconnect={noop}
            onAutopsy={noop}
            onEdit={noop}
            onRemove={noop}
          />
        )
        const card = one(container, ".gh-card")
        const stateLine = one(container, ".gh-card-state")
        const pane = one(container, ".gh-pane")
        const glyph = stateLine.querySelector("[data-glyph]")?.getAttribute("data-glyph")
        const word = stateLine.textContent
        const litAgainShown = container.textContent?.includes(stateWords.litAgain) ?? false
        unmount()

        // Light: the window's state and the card's state.
        expect(card.getAttribute("data-state")).toBe(shown)
        expect(pane.getAttribute("data-state")).toBe(shown)
        // Glyph and word.
        expect(glyph).toBe(glyphOf[shown])
        expect(word).toBe(stateWords[shown])
        // "lit again" only for a lit person who was reconnected.
        expect(litAgainShown).toBe(person.state === "alive" && person.timesResurrected > 0)
      }),
      { numRuns: 100 }
    )
  })
})
