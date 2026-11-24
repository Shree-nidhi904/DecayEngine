// @vitest-environment jsdom
//
// Extensions spec, Requirement 4.2 (task 2.3): the fight's result text and the
// creature's line are true for the policy that is running. A real engine on an
// InMemoryAdapter and fixed times, never the real clock.
//
// Expected values worked from the policies:
// - a shaky fact starts with a 5-day half-life; on day 6 its health is
//   100 × 0.5^(6/5) ≈ 43.5, so it is weak and can be fought;
// - doubling policy: a right answer makes the half-life 10;
// - memory model: a right answer makes it grownHalfLife(5, 5, 0.435...),
//   which is more than 5 and is not 10.

import "../test/dialog-polyfill"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { DecayEngine, InMemoryAdapter, type DecayPolicy } from "@decay-engine/engine"
import { FightDialog } from "./FightDialog"
import { studyDungeonPolicy, type FactPayload, type FactPolicyData, type ReviewEvent } from "../policy"
import { grownHalfLife, memoryPolicy } from "../policy-memory"
import type { ModelName } from "../policy-select"
import { T0, day } from "../test/fixtures"

afterEach(cleanup)

type Policy = DecayPolicy<FactPayload, FactPolicyData, ReviewEvent>

function fight(policy: Policy, model: ModelName | undefined, correct: boolean) {
  const engine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(policy, new InMemoryAdapter(), () => "f1")
  engine.addItem({ payload: { question: "Q one", answer: "A one", why: "", knowledge: "shaky" }, importance: 2, costMinutes: 2 }, T0)
  const fact = engine.view(day(6)).find((f) => f.id === "f1")!
  const { container } = render(
    <FightDialog
      engine={engine}
      now={() => day(6)}
      fact={fact}
      onWrite={() => {}}
      onClose={() => {}}
      {...(model === undefined ? {} : { model })}
    />
  )
  fireEvent.click(screen.getByRole("button", { name: "Show answer" }))
  fireEvent.click(screen.getByRole("button", { name: correct ? "I knew it" : "I forgot" }))
  const after = engine.view(day(6)).find((f) => f.id === "f1")!
  return {
    fact,
    after,
    result: container.querySelector(".sd-result")?.textContent ?? "",
    quip: container.querySelector(".sd-quip")?.textContent ?? "",
  }
}

describe("FightDialog result text by model", () => {
  it("the fact is weak on day 6 (the setup the other cases rely on)", () => {
    const { fact } = fight(studyDungeonPolicy, undefined, true)
    expect(fact.state).toBe("weak")
    expect(fact.health).toBeCloseTo(100 * Math.pow(0.5, 6 / 5), 9)
  })

  it("doubling (the default): a right answer says doubled and twice as long, and the half-life is 10", () => {
    const r = fight(studyDungeonPolicy, undefined, true)
    expect(r.result).toBe("Correct! Health → 100, half-life doubled")
    expect(r.quip).toBe("Defeated. It sleeps twice as long now.")
    expect(r.after.policyData.halfLifeDays).toBe(10)
  })

  it("doubling: a wrong answer says halved", () => {
    expect(fight(studyDungeonPolicy, "doubling", false).result).toBe("Incorrect. Health → 45, half-life halved")
  })

  it("memory model: a right answer says longer, never doubled or twice", () => {
    const r = fight(memoryPolicy, "memory", true)
    expect(r.result).toBe("Correct! Health → 100, half-life longer")
    expect(r.quip).toBe("Defeated. It sleeps longer now.")
    expect(`${r.result} ${r.quip}`).not.toMatch(/doubled|twice/)
    const expected = grownHalfLife(5, 5, r.fact.health / 100)
    expect(r.after.policyData.halfLifeDays).toBeCloseTo(expected, 9)
    expect(expected).toBeGreaterThan(5)
    expect(expected).not.toBeCloseTo(10, 3)
  })

  it("memory model: a wrong answer says shorter, never halved, and the half-life is 0.4 of what it was", () => {
    const r = fight(memoryPolicy, "memory", false)
    expect(r.result).toBe("Incorrect. Health → 45, half-life shorter")
    expect(r.result).not.toMatch(/halved/)
    expect(r.after.policyData.halfLifeDays).toBeCloseTo(2, 9)
  })
})
