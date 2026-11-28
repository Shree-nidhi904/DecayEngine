// @vitest-environment jsdom
//
// Tests for the challenge (task 7.2, Requirement 8.6-8.9). A real DecayEngine
// on InMemoryAdapter, fixed times through the injected now(); never the clock.
//
// Expected values come from the spec, not from running the code:
// - "solid" starts at half-life 10; right answer × 2 and health 100; wrong ÷ 2 and health 45
// - death when H × 0.5^(t / D) falls below 10, i.e. t = D × log2(H / 10)
// - resurrect: right answer → alive, health 100, the half-life it had at death,
//   timesResurrected + 1; wrong → stays dead with the reason
//   "You got it wrong. The fact stays dead." (Requirement 4)

import "../test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ChallengeDialog } from "./ChallengeDialog"
import { DAY_MS } from "../policy"
import { day, makeEngine } from "../test/fixtures"

afterEach(cleanup)

const REASON = "You got it wrong. The fact stays dead."

/**
 * Builds a dead fact: "solid" added on day 0, then the given reviews on days
 * 1, 2, ...; challenged on challengeDay.
 */
function setup(reviews: boolean[], challengeDay: number) {
  const { engine, add, viewOf } = makeEngine()
  add("g1", "solid", day(0))
  reviews.forEach((correct, i) => engine.tend("g1", { kind: "review", correct }, day(i + 1)))
  const at = day(challengeDay)
  const fact = viewOf("g1", at)
  const onWrite = vi.fn()
  const onClose = vi.fn()
  render(<ChallengeDialog engine={engine} now={() => at} fact={fact} onWrite={onWrite} onClose={onClose} />)
  return { engine, viewOf, fact, at, onWrite, onClose, user: userEvent.setup() }
}

const button = (name: string) => screen.getByRole("button", { name })
const buttonNames = () => screen.queryAllByRole("button").map((b) => b.textContent)

describe("ChallengeDialog", () => {
  // Feedback list, point 10: the result line takes focus, so the page behind never does.
  it("after an answer the result line has focus and Close is the next Tab stop", async () => {
    const { user } = setup([false], 20)
    await user.click(button("I forgot"))
    const result = screen.getByRole("status")
    expect(result.textContent).toBe(REASON)
    expect(document.activeElement).toBe(result)
    await user.tab()
    expect(document.activeElement).toBe(button("Close"))
  })

  it("shows the question and the answer at once, with I knew it and I forgot", () => {
    // One right answer on day 1: half-life 20, dies at day 1 + 20 × log2(10) ≈ day 67.4.
    const { fact } = setup([true], 70)
    expect(fact.state).toBe("dead")
    expect(screen.getByText("Question g1")).toBeTruthy()
    expect(screen.getByText("Answer g1")).toBeTruthy()
    expect(buttonNames()).toEqual(["Walk away", "I forgot", "I knew it"])
  })

  it("I forgot calls resurrect: the fact stays dead and a resurrect-failed entry is added", async () => {
    // One wrong answer on day 1: health 45, half-life 5.
    // Dies at day 1 + 5 × log2(45 / 10) ≈ day 11.85; challenged on day 20.
    const { user, engine, viewOf, fact, at, onWrite, onClose } = setup([false], 20)
    expect(fact.state).toBe("dead")
    const before = engine.history("g1")
    await user.click(button("I forgot"))

    const after = viewOf("g1", at)
    expect(after.state).toBe("dead")
    expect(after.health).toBe(0)
    expect(after.timesResurrected).toBe(0)
    expect(after.policyData.halfLifeDays).toBe(5)

    const history = engine.history("g1")
    // The death found while settling is saved together with the failure.
    expect(history.length).toBeGreaterThan(before.length)
    expect(history.at(-1)).toEqual({
      type: "resurrect-failed",
      itemId: "g1",
      timestamp: at,
      health: 0,
      event: { kind: "review", correct: false },
      reason: REASON,
    })
    expect(history.filter((e) => e.type === "resurrect-failed")).toHaveLength(1)
    expect(history.some((e) => e.type === "resurrected")).toBe(false)
    const died = history.find((e) => e.type === "died")
    const crossing = day(1) + 5 * Math.log2(45 / 10) * DAY_MS
    expect(died?.timestamp).toBeGreaterThanOrEqual(crossing)
    expect(died?.timestamp).toBeLessThanOrEqual(crossing + 60_000)

    expect(screen.getByRole("status").textContent).toBe(REASON)
    expect(onWrite).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(buttonNames()).toEqual(["Close"])
  })

  it("I knew it brings the fact back with the half-life it had at death (20 days)", async () => {
    // Right answer on day 1: half-life 10 → 20. Dies ≈ day 67.4; challenged on day 70.
    const { user, engine, viewOf, at, onWrite } = setup([true], 70)
    await user.click(button("I knew it"))

    const after = viewOf("g1", at)
    expect(after.state).toBe("alive")
    expect(after.health).toBe(100)
    expect(after.policyData.halfLifeDays).toBe(20)
    expect(after.timesResurrected).toBe(1)
    expect(after.diedAt).toBeUndefined()
    expect(after.lastEventAt).toBe(at)
    expect(engine.history("g1").at(-1)).toEqual({
      type: "resurrected",
      itemId: "g1",
      timestamp: at,
      health: 100,
      event: { kind: "review", correct: true },
    })
    expect(screen.getByRole("status").textContent).toBe("Resurrected! New half-life: 20 days")
    expect(onWrite).toHaveBeenCalledTimes(1)
  })

  it("reports the half-life at death even when it was halved twice (2.5 days)", async () => {
    // Day 1 wrong: 45, half-life 5. Day 2: 45 × 0.5^(1/5) ≈ 39.2, weak; wrong again: 45, half-life 2.5.
    // Dies at day 2 + 2.5 × log2(4.5) ≈ day 7.42; challenged on day 10.
    const { user, viewOf, fact, at } = setup([false, false], 10)
    expect(fact.state).toBe("dead")
    await user.click(button("I knew it"))
    expect(viewOf("g1", at).policyData.halfLifeDays).toBe(2.5)
    expect(screen.getByRole("status").textContent).toBe("Resurrected! New half-life: 2.5 days")
  })

  it("Walk away closes without calling the engine", async () => {
    const { user, engine, onWrite, onClose } = setup([true], 70)
    const before = engine.history("g1")
    await user.click(button("Walk away"))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onWrite).not.toHaveBeenCalled()
    expect(engine.history("g1")).toEqual(before)
  })
})
