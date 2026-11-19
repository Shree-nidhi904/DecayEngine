// @vitest-environment jsdom
//
// The fight when the answer is checked (answer-check.ts): picking from
// options or typing. You cannot claim a right answer: the engine records
// what you actually answered. A real DecayEngine on InMemoryAdapter, fixed
// times; solid starts at half-life 10 days, a right answer doubles it, a
// wrong one sets health 45 and halves it.
//
// Written by Claude Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import "../test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FightDialog } from "./FightDialog"
import { ChallengeDialog } from "./ChallengeDialog"
import { day, makeEngine } from "../test/fixtures"

afterEach(cleanup)

const OPTIONS = ["Answer f1", "Wrong one", "Wrong two", "Wrong three"]

function setup(check: "choices" | "typed", sleepsUntil?: () => string | null) {
  const { engine, add, viewOf } = makeEngine()
  add("f1", "solid", day(0))
  const fact = viewOf("f1", day(3))
  const onResult = vi.fn()
  render(
    <FightDialog
      engine={engine}
      now={() => day(3)}
      fact={fact}
      onWrite={vi.fn()}
      onClose={vi.fn()}
      onResult={onResult}
      check={check}
      choices={check === "choices" ? OPTIONS : null}
      sleepsUntil={sleepsUntil}
    />
  )
  return { engine, viewOf, onResult, user: userEvent.setup() }
}

const tended = (engine: ReturnType<typeof makeEngine>["engine"]) =>
  engine.history("f1").filter((e) => e.type === "tended").map((e) => (e as { event: { correct: boolean } }).event.correct)

describe("FightDialog: picking from options", () => {
  it("shows the options instead of the answer, and no I knew it", () => {
    setup("choices")
    const group = screen.getByRole("group", { name: "Choose the answer" })
    expect(within(group).getAllByRole("button").map((b) => b.querySelector(".sd-choice-text")!.textContent)).toEqual(OPTIONS)
    expect(screen.queryByRole("button", { name: "I knew it" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Show answer" })).toBeNull()
  })

  it("picking the right answer records a right answer", async () => {
    const { user, engine, viewOf, onResult } = setup("choices", () => "It sleeps until 8 Nov 2026.")
    await user.click(screen.getByRole("button", { name: /Answer f1/ }))
    expect(tended(engine)).toEqual([true])
    expect(viewOf("f1", day(3)).policyData.halfLifeDays).toBe(20)
    expect(onResult).toHaveBeenCalledWith("correct")
    expect(screen.getByRole("status").textContent).toBe("Correct! Health → 100, half-life doubled")
    expect(screen.getByText("It sleeps until 8 Nov 2026.")).toBeTruthy()
  })

  it("picking a wrong answer records a wrong answer and marks the right one", async () => {
    const { user, engine, viewOf, onResult } = setup("choices")
    await user.click(screen.getByRole("button", { name: /Wrong two/ }))
    expect(tended(engine)).toEqual([false])
    expect(viewOf("f1", day(3)).health).toBe(45)
    expect(onResult).toHaveBeenCalledWith("incorrect")
    const marks = Object.fromEntries(
      screen.getAllByRole("button").filter((b) => b.classList.contains("sd-choice-option")).map((b) => [b.querySelector(".sd-choice-text")!.textContent, b.getAttribute("data-mark")])
    )
    expect(marks).toEqual({ "Answer f1": "right", "Wrong two": "wrong", "Wrong one": "other", "Wrong three": "other" })
  })

  it("focus starts on the options, not on one, so Enter answers nothing; C picks the third", async () => {
    const { user, engine } = setup("choices")
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Choose the answer" }))
    await user.keyboard("{Enter}")
    expect(tended(engine)).toEqual([])
    await user.keyboard("c")
    expect(tended(engine)).toEqual([false]) // "Wrong two"
  })

  it("answers once: the options are disabled afterwards", async () => {
    const { user, engine } = setup("choices")
    await user.click(screen.getByRole("button", { name: /Wrong one/ }))
    await user.click(screen.getByRole("button", { name: /Answer f1/ }))
    expect(tended(engine)).toEqual([false])
  })
})

describe("FightDialog: typing the answer", () => {
  it("a matching answer counts as right", async () => {
    const { user, engine } = setup("typed")
    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "answer F1{Enter}")
    expect(tended(engine)).toEqual([true])
    expect(screen.getByText("Answer f1")).toBeTruthy()
  })

  it("a different answer counts as wrong, and the real answer is shown", async () => {
    const { user, engine } = setup("typed")
    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "no idea")
    await user.click(screen.getByRole("button", { name: "Check" }))
    expect(tended(engine)).toEqual([false])
    expect(screen.getByText("You wrote: “no idea”")).toBeTruthy()
    expect(screen.getByText("Answer f1")).toBeTruthy()
  })

  it("an empty answer cannot be checked", async () => {
    const { user, engine } = setup("typed")
    await user.click(screen.getByRole("button", { name: "Check" }))
    expect(tended(engine)).toEqual([])
  })
})

describe("ChallengeDialog: checked", () => {
  it("hides the answer until you pick, and a right pick resurrects", async () => {
    const { engine, add, viewOf } = makeEngine()
    add("d1", "new", day(0)) // dead after about 6.6 days
    const fact = viewOf("d1", day(10))
    const user = userEvent.setup()
    render(
      <ChallengeDialog
        engine={engine}
        now={() => day(10)}
        fact={fact}
        onWrite={vi.fn()}
        onClose={vi.fn()}
        check="choices"
        choices={["Answer d1", "Nope", "Nah"]}
      />
    )
    expect(screen.queryByText("Answer")).toBeNull()
    await user.click(screen.getByRole("button", { name: /Answer d1/ }))
    expect(viewOf("d1", day(10)).state).toBe("alive")
  })
})
