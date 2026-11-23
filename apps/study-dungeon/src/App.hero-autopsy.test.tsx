// @vitest-environment jsdom
//
// The hero (tasks 12.1 and 12.2, Requirement 12) and the autopsy
// (task 10.3, Requirement 10), through the App. A real DecayEngine on
// InMemoryAdapter, a fixed clock, a fake tick scheduler, time zone UTC.
//
// Expected values come from the spec, not from running the code:
// - health = H × 0.5^(elapsed / half-life); new 2, shaky 5, solid 10 days
// - right: 100 and half-life doubled; wrong: 45 and half-life halved
// - alive ≥ 60, weak 10 to 60, dead < 10
// - souls: "tended" entries with a right answer; streak: consecutive days
//   with a "tended" entry, ending today or yesterday (Requirement 12.4-12.5)

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, screen, within } from "@testing-library/react"
import { makeAppKit } from "./test/app-kit"
import { day } from "./test/fixtures"
import { expandDock } from "./test/dock"
import { DAY_MS } from "./policy"
import { generateCauseSentences } from "./autopsy-sentences"
import { generateRescueSentence, withRescue } from "./rescue-sentence"
import { heroExtraText, previewBlockedText } from "./wording"

afterEach(cleanup)

const HOUR = 3_600_000
const right = { kind: "review", correct: true } as const
const wrong = { kind: "review", correct: false } as const

const button = (name: string) => screen.getByRole("button", { name })
const tab = (list: string) => screen.getByRole("tab", { name: new RegExp(`^${list}`) })
const hero = () => screen.getByRole("region", { name: "Your memory today" })
const heroCounts = () =>
  (["alive", "weak", "dead"] as const).map(
    (state) => hero().querySelector(`.shell-counter[data-state="${state}"] .shell-counter-count`)!.textContent
  )
const stat = (name: "souls" | "streak") => {
  const card = hero().querySelector(`[data-stat="${name}"]`)!
  return {
    number: card.querySelector(".sd-stat-number")!.textContent,
    label: card.querySelector(".sd-stat-label")!.textContent,
    icon: card.querySelector("svg") !== null,
  }
}

// Today is day 20, 13:00 UTC.
//   s1  new, added day 15 12:00
//       right day 16 12:00 (1 day at half-life 2: 70.7) → 100, half-life 4
//       right day 18 12:00 (2 days at 4: 70.7)          → 100, half-life 8
//       wrong day 20 12:00 (2 days at 8: 84.1)          → 45, half-life 4
//       today: 45 × 0.5^(1 h / 4 days) ≈ 44.7, weak
//       +30 days: 45 × 0.5^(30.04 / 4) ≈ 0.25, dead
//   s2  solid, added day 19 12:00, right day 19 18:00 → 100, half-life 20
//       today: 0.79 days → ≈ 97.3, alive; +30: 30.79 / 20 → 100 × 0.5^1.54 ≈ 34.4, weak
//   w2  solid, added day 12 13:00: today 8 days → 57.4, weak; +30: 38 days → 7.2, dead
//   d1  new, added day 0: dead at 2 × log2(10) ≈ 6.64 days
// Counts today 1 / 2 / 1; at +30 days 0 / 1 / 3.
// Souls: s1 two right, s2 one right → 3. Wrong answers do not count.
// Streak: reviews on days 16, 18, 19 and 20 → 20, 19, 18 in a row → 3
// (at +30 days it would be 0, so it must use the real time).
const TODAY = day(20) + 13 * HOUR

function setupHero() {
  const kit = makeAppKit()
  kit.add("d1", "new", day(0))
  kit.add("w2", "solid", day(12) + 13 * HOUR)
  kit.add("s1", "new", day(15) + 12 * HOUR)
  kit.add("s2", "solid", day(19) + 12 * HOUR)
  kit.engine.tend("s1", right, day(16) + 12 * HOUR)
  kit.engine.tend("s1", right, day(18) + 12 * HOUR)
  kit.engine.tend("s2", right, day(19) + 18 * HOUR)
  kit.engine.tend("s1", wrong, day(20) + 12 * HOUR)
  kit.renderApp(TODAY)
  return kit
}

describe("hero section", () => {
  it("shows the eyebrow, how many facts are weakening, the counts, souls banished and the streak", () => {
    setupHero()
    expect(within(hero()).getByText("Your memory today")).toBeTruthy()
    expect(within(hero()).getByText("2 facts are weakening")).toBeTruthy()
    expect(heroCounts()).toEqual(["1", "2", "1"])
    expect(stat("souls")).toEqual({ number: "3", label: "souls banished", icon: true })
    expect(stat("streak")).toEqual({ number: "3", label: "days in a row", icon: true })
  })

  it("shows each count card with its icon, number and list name", () => {
    setupHero()
    const cards = [...hero().querySelectorAll(".shell-counter")].map((li) => ({
      state: li.getAttribute("data-state"),
      icon: li.querySelector(".shell-icon svg")?.getAttribute("data-icon"),
      number: li.querySelector(".shell-counter-count")!.textContent,
      label: li.querySelector(".shell-counter-label")!.textContent,
    }))
    expect(cards).toEqual([
      { state: "alive", icon: "candle", number: "1", label: "Crypt" },
      { state: "weak", icon: "monster", number: "2", label: "Dungeon" },
      { state: "dead", icon: "tombstone", number: "1", label: "Graveyard" },
    ])
  })

  it("Fight the weakest opens the fight with the lowest-health weak fact", () => {
    // s1 (44.7) is weaker than w2 (57.4).
    setupHero()
    fireEvent.click(within(hero()).getByRole("button", { name: "Fight the weakest" }))
    const fight = screen.getByRole("dialog", { name: "Fight" })
    expect(fight.querySelector(".sd-dialog-question")!.textContent).toBe("Question s1")
  })

  it("the counts follow the time machine; souls and the streak stay on the real time", () => {
    setupHero()
    expandDock()
    fireEvent.click(button("+30 days"))
    expect(heroCounts()).toEqual(["0", "1", "3"])
    expect(within(hero()).getByText("1 fact is weakening")).toBeTruthy()
    expect(stat("souls").number).toBe("3")
    expect(stat("streak").number).toBe("3")
  })

  it("Fight the weakest is disabled while previewing, says why and opens nothing", () => {
    setupHero()
    expandDock()
    fireEvent.click(button("+7 days"))
    const fight = within(hero()).getByRole("button", { name: "Fight the weakest" })
    expect(fight.getAttribute("aria-disabled")).toBe("true")
    expect(fight.getAttribute("title")).toBe(previewBlockedText)
    fireEvent.click(fight)
    expect(screen.queryAllByRole("dialog")).toEqual([])
  })

  it("with no weak facts but some alive, says the Crypt is quiet and offers no fight", () => {
    const kit = makeAppKit()
    kit.add("a1", "solid", day(10)) // day 11: 100 × 0.5^0.1 ≈ 93.3, alive
    kit.add("d1", "new", day(0)) // dead
    kit.renderApp(day(11))
    expect(within(hero()).getByText("All quiet in the Crypt. Every fact is sleeping soundly.")).toBeTruthy()
    expect(within(hero()).queryByRole("button", { name: "Fight the weakest" })).toBeNull()
    expect(heroCounts()).toEqual(["1", "0", "1"])
  })

  it("with no facts, points to Add fact; souls and streak are 0", () => {
    makeAppKit().renderApp(day(1))
    expect(within(hero()).getByText("No facts yet. Use Add fact to put your first one in the Crypt.")).toBeTruthy()
    expect(heroCounts()).toEqual(["0", "0", "0"])
    expect(stat("souls")).toMatchObject({ number: "0", label: "souls banished" })
    expect(stat("streak")).toMatchObject({ number: "0", label: "days in a row" })
  })
})

describe("hero: the loss forecast line (task P4, Requirement 20)", () => {
  const NOTHING = "Nothing will weaken or die in the next 7 days."
  const lossLine = () => hero().querySelector<HTMLElement>(".sd-hero-loss")

  it("setupHero() at TODAY shows the zero sentence", () => {
    // s1 (45 at day 20 12:00, half-life 4) dies 8.68 days later, 8.14 days from TODAY;
    // s2 (100 at day 19 18:00, half-life 20) weakens 14.74 days later, 13.95 days from TODAY;
    // w2 (solid, added day 12 13:00) dies at day 45.76; d1 is dead.
    setupHero()
    expect(lossLine()!.textContent).toBe(NOTHING)
  })

  it("sits straight after the h2 and before the Start with … line and the button", () => {
    setupHero()
    const heading = hero().querySelector("h2")!
    const line = lossLine()!
    expect(line.tagName).toBe("P")
    expect(heading.nextElementSibling).toBe(line)
    const startWith = line.nextElementSibling as HTMLElement
    expect(startWith.classList.contains("sd-hero-sub")).toBe(true)
    expect(startWith.textContent!.startsWith("Start with ")).toBe(true)
    expect(startWith.nextElementSibling).toBe(within(hero()).getByRole("button", { name: "Fight the weakest" }))
  })

  it("is gone at +7 days, where the preview forecast shows instead; Back to today brings it back with the same words", () => {
    setupHero()
    expandDock()
    fireEvent.click(button("+7 days"))
    expect(lossLine()).toBeNull()
    // Nothing changes state between TODAY and +7 days (the case above), so the preview line is the "no changes" one.
    expect(hero().querySelector(".sd-hero-forecast")!.textContent).toBe(heroExtraText.forecast(0, 0))

    fireEvent.click(button("Back to today"))
    expect(hero().querySelector(".sd-hero-forecast")).toBeNull()
    expect(lossLine()!.textContent).toBe(NOTHING)
  })

  it("is hidden with no facts and when every fact is dead (Req 20.8)", () => {
    const empty = makeAppKit()
    empty.renderApp(day(1))
    expect(lossLine()).toBeNull()
    cleanup()

    const dead = makeAppKit()
    dead.add("d1", "new", day(0)) // dead at 6.64 days
    dead.renderApp(day(10))
    expect(within(hero()).getByText("Nothing is weakening. Your graves are waiting in the Graveyard.")).toBeTruthy()
    expect(lossLine()).toBeNull()
  })

  it("with no weak facts but some alive, sits alone under the quiet heading", () => {
    const kit = makeAppKit()
    kit.add("a1", "solid", day(10)) // weakens 7.37 days later, day 17.37: 6.37 days from day 11
    kit.renderApp(day(11))
    const heading = hero().querySelector("h2")!
    expect(heading.textContent).toBe("All quiet in the Crypt. Every fact is sleeping soundly.")
    expect(heading.nextElementSibling).toBe(lossLine())
    expect(lossLine()!.textContent).toBe("If you do nothing, in the next 7 days 1 fact weakens.")
  })
})

describe("autopsy", () => {
  /** The open autopsy dialog. */
  const autopsy = () => screen.getByRole("dialog", { name: "Autopsy" })

  function openAutopsyOf(question: string) {
    fireEvent.click(tab("Graveyard"))
    const card = screen.getByText(question).closest("article")!
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "Autopsy" }))
  }

  it("a grave's Autopsy shows the epitaph, the chart summed up in words and the cause sentences", () => {
    // d1: new (half-life 2), never reviewed, added day 0. Dies at
    // 2 × log2(10) ≈ 6.64 days, on 7 Oct 2026, just under 10.
    const kit = makeAppKit()
    kit.add("d1", "new", day(0), "Art history quiz.")
    kit.renderApp(day(10))
    openAutopsyOf("Question d1")

    const dialog = autopsy()
    expect(dialog.querySelector("blockquote")!.textContent).toBe("Art history quiz.")
    expect(within(dialog).getByRole("img").getAttribute("aria-label")).toBe(
      "Health from 2026-10-01 to 2026-10-07: it started at 100 and fell to 9. No right answers, no wrong answers."
    )

    const shown = [...dialog.querySelectorAll(".shell-autopsy-sentence")].map((p) => p.textContent)
    // Never reviewed, half-life 2: the developer's cause sentence comes first.
    expect(shown[0]).toBe("It was never reviewed, so it faded with a half-life of 2 days.")
    const fact = kit.engine.view(day(10)).find((f) => f.id === "d1")!
    const report = kit.engine.autopsy("d1", day(10))
    const causes = generateCauseSentences(report, fact.payload, { halfLifeAtDeath: 2, timeZone: "UTC" })
    const rescue = generateRescueSentence(fact, kit.engine.history("d1"), report, { timeZone: "UTC" })
    // The rescue line (task R1, Req 22.7) is second, straight after the cause; the rest follow unchanged.
    expect(shown).toEqual(withRescue(causes, rescue))
    expect(shown).toHaveLength(causes.length + 1)
    // Weak at 1.474 d (2 Oct); a right review then gives half-life 4 and death 13.29 d later (15 Oct): 8.12 d longer.
    expect(shown[1]).toBe(
      "A review on 2 Oct 2026, when it went weak, would have kept it alive until 15 Oct 2026, 8 days longer."
    )
    expect(shown.slice(2)).toEqual(causes.slice(1))

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }))
    expect(screen.queryAllByRole("dialog")).toEqual([])
  })

  it("Challenge inside the autopsy closes it and opens the challenge", () => {
    const kit = makeAppKit()
    kit.add("d1", "new", day(0))
    kit.renderApp(day(10))
    openAutopsyOf("Question d1")
    fireEvent.click(within(autopsy()).getByRole("button", { name: "Challenge" }))
    expect(screen.queryByRole("dialog", { name: "Autopsy" })).toBeNull()
    const challenge = screen.getByRole("dialog", { name: "Challenge" })
    expect(challenge.querySelector(".sd-dialog-question")!.textContent).toBe("Question d1")
  })

  it("works while previewing, for a fact dead only on the previewed day; Challenge is disabled", () => {
    // p1: solid, added day 10. Dies at 10 × log2(10) ≈ 33.22 days later,
    // day 43.22 (13 Nov 2026). Previewed at +34 days (day 44): dead, but
    // nothing about the death is saved.
    const kit = makeAppKit()
    kit.add("p1", "solid", day(10))
    kit.renderApp(day(10))
    fireEvent.change(screen.getByRole("slider", { name: "Days ahead" }), { target: { value: String(34 * DAY_MS) } })
    openAutopsyOf("Question p1")

    const dialog = autopsy()
    expect(within(dialog).getByRole("img").getAttribute("aria-label")).toBe(
      "Health from 2026-10-11 to 2026-11-13: it started at 100 and fell to 9. No right answers, no wrong answers."
    )
    const challenge = within(dialog).getByRole("button", { name: "Challenge" })
    expect(challenge.getAttribute("aria-disabled")).toBe("true")
    expect(challenge.getAttribute("title")).toBe(previewBlockedText)
    fireEvent.click(challenge)
    expect(screen.queryByRole("dialog", { name: "Challenge" })).toBeNull()
    expect(autopsy()).toBeTruthy()
    // The rescue line shows in the preview too (Req 22.9): weak at day 17.37, a right review then
    // gives half-life 20, 66.44 − 25.85 = 40.59 days longer. Nothing about it is stored.
    const second = dialog.querySelectorAll(".shell-autopsy-sentence")[1]!.textContent
    expect(second).toMatch(/^A review on .+, when it went weak, would have kept it alive until .+, 40 days longer\.$/)
    expect(kit.engine.history("p1").map((e) => e.type)).toEqual(["created"])
  })
})
