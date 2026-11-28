// @vitest-environment jsdom
//
// "Fight the weakest" (feedback list, point 11): it shows the Dungeon and runs
// through every weak fact, weakest first. Facts at day 10 (health 100 × 0.5^(days / half-life)):
//   w3  shaky (half-life 5), added day 4  → 100 × 0.5^(6/5) ≈ 43.5, weak (weakest)
//   w1  solid (half-life 10), added day 0 → 100 × 0.5^1 = 50, weak
//   w2  shaky, added day 6                → 100 × 0.5^(4/5) ≈ 57.4, weak
//   a   solid, added day 10               → 100, alive

import "./test/dialog-polyfill"
import { cleanup, fireEvent, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { makeAppKit } from "./test/app-kit"
import { day } from "./test/fixtures"

afterEach(cleanup)

const button = (name: string) => screen.getByRole("button", { name })
const fightDialog = () => screen.getByRole("dialog", { name: "Fight" })

function setup(weakIds: Array<[string, "shaky" | "solid", number]>) {
  const kit = makeAppKit()
  for (const [id, knowledge, at] of weakIds) kit.add(id, knowledge, day(at))
  kit.add("a", "solid", day(10))
  kit.renderApp(day(10))
  return kit
}

describe("Fight the weakest", () => {
  it("runs through every weak fact, weakest first, one after the other", () => {
    const kit = setup([["w1", "solid", 0], ["w2", "shaky", 6], ["w3", "shaky", 4]])
    fireEvent.click(button("Fight the weakest"))
    expect(within(fightDialog()).getByText("Question w3")).toBeTruthy()
    expect(within(fightDialog()).getByText("Fight 1 of 3")).toBeTruthy()
    fireEvent.click(button("Show answer"))
    fireEvent.click(button("I knew it"))
    fireEvent.click(button("Close"))
    expect(within(fightDialog()).getByText("Question w1")).toBeTruthy()
    expect(within(fightDialog()).getByText("Fight 2 of 3")).toBeTruthy()
    fireEvent.click(button("Walk away"))
    expect(within(fightDialog()).getByText("Question w2")).toBeTruthy()
    fireEvent.click(button("Walk away"))
    expect(screen.queryByRole("dialog", { name: "Fight" })).toBeNull()
    // Only the answered fact was tended.
    expect(kit.engine.history("w3").some((e) => e.type === "tended")).toBe(true)
    expect(kit.engine.history("w1").some((e) => e.type === "tended")).toBe(false)
  })

  it("shows the Dungeon list even when another list was open", () => {
    setup([["w1", "solid", 0], ["w2", "shaky", 6]])
    fireEvent.click(screen.getByRole("tab", { name: /^Crypt/ }))
    expect(screen.getByRole("tab", { name: /^Crypt/ }).getAttribute("aria-selected")).toBe("true")
    fireEvent.click(button("Fight the weakest"))
    expect(screen.getByRole("tab", { name: /^Dungeon/ }).getAttribute("aria-selected")).toBe("true")
  })

  it("one weak fact is a plain fight, with no 'Fight 1 of 1' line", () => {
    setup([["w1", "solid", 0]])
    fireEvent.click(button("Fight the weakest"))
    expect(within(fightDialog()).getByText("Question w1")).toBeTruthy()
    expect(within(fightDialog()).queryByText(/^Fight \d+ of \d+$/)).toBeNull()
  })
})
