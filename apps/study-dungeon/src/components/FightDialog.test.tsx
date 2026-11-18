// @vitest-environment jsdom
//
// Tests for the fight (task 7.1, Requirement 8.1-8.5). A real DecayEngine on
// InMemoryAdapter, fixed times through the injected now(); never the clock.
//
// Expected values come from the spec, not from running the code:
// - health = H × 0.5^(elapsed / half-life); "solid" starts at half-life 10 (1.1, 1.4)
// - right answer: health 100, half-life × 2; wrong: health 45, half-life ÷ 2 (2.1, 2.2)
// - alive ≥ 60, weak 10 to 60, dead < 10 (1.5)

import "../test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FightDialog } from "./FightDialog"
import { day, makeEngine } from "../test/fixtures"

afterEach(cleanup)

function setup(knowledge: "new" | "shaky" | "solid", openAt: number, answerAt: number = openAt) {
  const { engine, add, viewOf } = makeEngine()
  add("f1", knowledge, day(0))
  const fact = viewOf("f1", openAt)
  const onWrite = vi.fn()
  const onClose = vi.fn()
  render(<FightDialog engine={engine} now={() => answerAt} fact={fact} onWrite={onWrite} onClose={onClose} />)
  return { engine, viewOf, fact, onWrite, onClose, user: userEvent.setup() }
}

const button = (name: string) => screen.getByRole("button", { name })
const buttonNames = () => screen.queryAllByRole("button").map((b) => b.textContent)

describe("FightDialog", () => {
  it("starts with the question, Show answer and Walk away, and hides the answer", () => {
    setup("solid", day(3))
    expect(screen.getByText("Question f1")).toBeTruthy()
    expect(screen.queryByText("Answer f1")).toBeNull()
    expect(buttonNames()).toEqual(["Walk away", "Show answer"])
  })

  it("Show answer reveals the answer with I knew it, I forgot and Walk away", async () => {
    const { user, engine } = setup("solid", day(3))
    const before = engine.history("f1")
    await user.click(button("Show answer"))
    expect(screen.getByText("Answer f1")).toBeTruthy()
    expect(buttonNames()).toEqual(["Walk away", "I forgot", "I knew it"])
    // Showing the answer is not a review.
    expect(engine.history("f1")).toEqual(before)
  })

  it("Walk away before the answer closes without touching the engine", async () => {
    const { user, engine, onWrite, onClose } = setup("solid", day(3))
    const before = engine.history("f1")
    await user.click(button("Walk away"))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onWrite).not.toHaveBeenCalled()
    expect(engine.history("f1")).toEqual(before)
    expect(before.map((e) => e.type)).toEqual(["created"])
  })

  it("Walk away after the answer is shown also leaves history unchanged", async () => {
    const { user, engine, onWrite, onClose } = setup("solid", day(3))
    const before = engine.history("f1")
    await user.click(button("Show answer"))
    await user.click(button("Walk away"))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onWrite).not.toHaveBeenCalled()
    expect(engine.history("f1")).toEqual(before)
  })

  it("I knew it on an alive fact: health 100, half-life 10 → 20", async () => {
    // Day 3: 100 × 0.5^(3/10) ≈ 81.2, alive.
    const { user, engine, viewOf, fact, onWrite, onClose } = setup("solid", day(3))
    expect(fact.state).toBe("alive")
    await user.click(button("Show answer"))
    await user.click(button("I knew it"))

    const after = viewOf("f1", day(3))
    expect(after.health).toBe(100)
    expect(after.policyData.halfLifeDays).toBe(20)
    expect(after.state).toBe("alive")
    expect(after.lastEventAt).toBe(day(3))
    expect(engine.history("f1").map((e) => e.type)).toEqual(["created", "tended"])
    expect(engine.history("f1")[1]).toEqual({
      type: "tended",
      itemId: "f1",
      timestamp: day(3),
      health: 100,
      event: { kind: "review", correct: true },
    })
    expect(screen.getByRole("status").textContent).toBe("Correct! Health → 100, half-life doubled")
    expect(onWrite).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(buttonNames()).toEqual(["Close"])
  })

  it("I forgot on an alive fact: health 45, half-life 10 → 5, and it turns weak", async () => {
    const { user, engine, viewOf, onWrite } = setup("solid", day(3))
    await user.click(button("Show answer"))
    await user.click(button("I forgot"))

    const after = viewOf("f1", day(3))
    expect(after.health).toBe(45)
    expect(after.policyData.halfLifeDays).toBe(5)
    expect(after.state).toBe("weak") // 45 < 60
    const history = engine.history("f1")
    expect(history.map((e) => e.type)).toEqual(["created", "tended", "state-changed"])
    expect(history[1]).toEqual({
      type: "tended",
      itemId: "f1",
      timestamp: day(3),
      health: 45,
      event: { kind: "review", correct: false },
    })
    expect(history[2]).toMatchObject({ from: "alive", to: "weak", timestamp: day(3) })
    expect(screen.getByRole("status").textContent).toBe("Incorrect. Health → 45, half-life halved")
    expect(onWrite).toHaveBeenCalledTimes(1)
  })

  it("I knew it on a weak monster brings it back to the Crypt with half-life 20", async () => {
    // Day 8: 100 × 0.5^(8/10) ≈ 57.4, weak.
    const { user, viewOf, fact } = setup("solid", day(8))
    expect(fact.state).toBe("weak")
    await user.click(button("Show answer"))
    await user.click(button("I knew it"))
    const after = viewOf("f1", day(8))
    expect(after.state).toBe("alive")
    expect(after.health).toBe(100)
    expect(after.policyData.halfLifeDays).toBe(20)
  })

  it("Close after a result closes the dialog without a second write", async () => {
    const { user, engine, onWrite, onClose } = setup("solid", day(3))
    await user.click(button("Show answer"))
    await user.click(button("I knew it"))
    const afterAnswer = engine.history("f1")
    await user.click(button("Close"))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onWrite).toHaveBeenCalledTimes(1)
    expect(engine.history("f1")).toEqual(afterAnswer)
  })

  it("a fact that died before the answer is not tended, and the dialog says so", async () => {
    // "new" (half-life 2) opened on day 1 at 100 × 0.5^(1/2) ≈ 70.7, alive.
    // It dies at 2 × log2(10) ≈ 6.64 days, so answering on day 10 finds it dead.
    const { user, engine, viewOf, fact, onWrite } = setup("new", day(1), day(10))
    expect(fact.state).toBe("alive")
    await user.click(button("Show answer"))
    await user.click(button("I knew it"))

    const types = engine.history("f1").map((e) => e.type)
    expect(types).not.toContain("tended")
    expect(types).toContain("died")
    expect(viewOf("f1", day(10)).state).toBe("dead")
    expect(screen.getByRole("status").textContent).toBe(
      "This fact died before you answered. Challenge it from the Graveyard."
    )
    expect(onWrite).toHaveBeenCalledTimes(1) // the death was saved
  })
})
