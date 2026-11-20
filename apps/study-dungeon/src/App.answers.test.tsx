// @vitest-environment jsdom
//
// Answer checking through the App: picking is the default, the options come
// from the other facts' answers, and the "Answer by" setting is saved.
// Written by - Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, screen, within } from "@testing-library/react"
import { makeAppKit, MemoryStorage } from "./test/app-kit"
import { day } from "./test/fixtures"
import { ANSWER_CHECK_KEY } from "./answer-check"

afterEach(cleanup)

function setup(stored: Record<string, string> = {}) {
  const kit = makeAppKit(new MemoryStorage({ "study-dungeon:started": "1", "study-dungeon:tour-done": "1", ...stored }), {
    answerCheck: "choices",
  })
  // w1 is weak at day 8 (solid: 57.4); the others give the wrong options.
  kit.add("w1", "solid", day(0))
  kit.add("a1", "solid", day(8))
  kit.add("a2", "solid", day(8))
  kit.add("a3", "solid", day(8))
  kit.renderApp(day(8))
  return kit
}

describe("answer checking in the App", () => {
  it("a fight asks you to pick from four: the answer and three other facts' answers", () => {
    setup()
    fireEvent.click(screen.getByRole("button", { name: "Fight the weakest" }))
    const fight = screen.getByRole("dialog", { name: "Fight" })
    const options = within(within(fight).getByRole("group", { name: "Choose the answer" })).getAllByRole("button")
    expect(options.map((b) => b.querySelector(".sd-choice-text")!.textContent).sort()).toEqual([
      "Answer a1",
      "Answer a2",
      "Answer a3",
      "Answer w1",
    ])
    expect(within(fight).queryByRole("button", { name: "I knew it" })).toBeNull()
  })

  it("a wrong pick is saved as a wrong answer", () => {
    const kit = setup()
    fireEvent.click(screen.getByRole("button", { name: "Fight the weakest" }))
    fireEvent.click(screen.getByRole("button", { name: /Answer a2/ }))
    const last = kit.engine.history("w1").at(-1)!
    expect(last).toMatchObject({ type: "tended", health: 45, event: { correct: false } })
  })

  it("the Answer by setting switches to typing and is remembered", () => {
    const kit = setup()
    fireEvent.change(screen.getByRole("combobox", { name: "Answer by" }), { target: { value: "typed" } })
    expect(kit.storage.getItem(ANSWER_CHECK_KEY)).toBe("typed")
    fireEvent.click(screen.getByRole("button", { name: "Fight the weakest" }))
    expect(screen.getByRole("textbox", { name: "Your answer" })).toBeTruthy()
  })

  it("a saved setting wins over the default", () => {
    setup({ [ANSWER_CHECK_KEY]: "self" })
    fireEvent.click(screen.getByRole("button", { name: "Fight the weakest" }))
    expect(screen.getByRole("button", { name: "Show answer" })).toBeTruthy()
  })
})
