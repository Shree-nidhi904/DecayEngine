// Tests for the first-run sample data (task 11.2, Requirement 13.2-13.3).
// Real engine on InMemoryAdapter, fixed times, never the real clock.
// Written by Claude Code (Opus 5.5), outside Kiro, at the developer's request; see .kiro/steering/authorship.md.

import { describe, expect, it } from "vitest"
import { DecayEngine, InMemoryAdapter } from "@decay-engine/engine"
import { DAY_MS, studyDungeonPolicy, type FactPayload, type FactPolicyData, type ReviewEvent } from "./policy"
import { SAMPLE_FACTS, loadSampleData } from "./sample-data"
import { validateFactForm } from "./fact-form"
import { generateCauseSentences } from "./autopsy-sentences"

const NOW = Date.UTC(2026, 10, 18, 9, 30) // 18 Nov 2026 09:30 UTC, fixed

function freshEngine() {
  let n = 0
  return new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(
    studyDungeonPolicy,
    new InMemoryAdapter(),
    () => `fact-${++n}`
  )
}

function load(now = NOW) {
  const engine = freshEngine()
  const ids = loadSampleData(engine, now)
  return { engine, ids, items: engine.view(now) }
}

describe("loadSampleData", () => {
  it("adds twelve facts and returns their ids in order", () => {
    const { ids, items } = load()
    expect(ids).toEqual(Array.from({ length: 12 }, (_, i) => `fact-${i + 1}`))
    expect(items).toHaveLength(12)
    expect(items.map((i) => i.payload.question).sort()).toEqual(SAMPLE_FACTS.map((f) => f.question).sort())
  })

  it("puts four facts in each state", () => {
    const { items } = load()
    const count = (s: string) => items.filter((i) => i.state === s).length
    expect([count("alive"), count("weak"), count("dead")]).toEqual([4, 4, 4])
  })

  it("puts every fact in the state its schedule was worked out for", () => {
    const { engine, ids } = load()
    const byId = new Map(engine.view(NOW).map((i) => [i.id, i]))
    SAMPLE_FACTS.forEach((fact, index) => {
      expect({ question: fact.question, state: byId.get(ids[index]!)!.state }).toEqual({
        question: fact.question,
        state: fact.expected,
      })
    })
  })

  it("gives the same states at any time of day (schedules are whole days with margins)", () => {
    for (const hour of [0, 6, 12, 23.99]) {
      const now = Date.UTC(2027, 2, 3) + hour * 3_600_000
      const { engine, ids } = load(now)
      const states = ids.map((id) => engine.view(now).find((i) => i.id === id)!.state)
      expect(states).toEqual(SAMPLE_FACTS.map((f) => f.expected))
    }
  })

  it("covers every knowledge level four times", () => {
    const levels = SAMPLE_FACTS.map((f) => f.knowledge)
    expect(["new", "shaky", "solid"].map((k) => levels.filter((l) => l === k).length)).toEqual([4, 4, 4])
  })

  it("only uses facts the add form would accept", () => {
    for (const f of SAMPLE_FACTS) {
      const result = validateFactForm({
        question: f.question,
        answer: f.answer,
        why: f.why,
        knowledge: f.knowledge,
        importance: f.importance,
        costMinutes: f.costMinutes,
      })
      expect({ question: f.question, ok: result.ok }).toEqual({ question: f.question, ok: true })
    }
  })

  it("saves the deaths at load, so the graveyard and history are complete", () => {
    const { engine } = load()
    const graves = engine.graveyard()
    expect(graves).toHaveLength(4)
    for (const g of graves) {
      const died = engine.history(g.id).filter((e) => e.type === "died")
      expect(died).toHaveLength(1)
      expect(g.diedAt).toBe(died[0]!.timestamp)
      expect(g.diedAt!).toBeLessThan(NOW)
    }
  })

  it("dates each death where the policy maths puts it", () => {
    const { engine, ids } = load()
    const diedDaysAgo = (question: string) => {
      const id = ids[SAMPLE_FACTS.findIndex((f) => f.question === question)]!
      const item = engine.view(NOW).find((i) => i.id === id)!
      return (NOW - item.diedAt!) / DAY_MS
    }
    // Each death is bisected to within a minute (1/1440 day) after the crossing.
    const minute = 1 / 1440
    const check = (question: string, expected: number) => {
      const got = diedDaysAgo(question)
      expect(got).toBeLessThanOrEqual(expected)
      expect(got).toBeGreaterThanOrEqual(expected - minute)
    }
    check("Who wrote Frankenstein?", 26 - 10 * Math.log2(4.5)) // ≈ 4.30
    check("Who painted the Sistine Chapel ceiling?", 40 - 2 * Math.log2(10)) // ≈ 33.36
    check("Chemical symbol for gold?", 40 - 10 * Math.log2(10)) // ≈ 6.78
    check("Speed of light in a vacuum?", 28 - 4 * Math.log2(10)) // ≈ 14.71
  })

  it("records the replayed reviews and the failed challenge in history", () => {
    const { engine, ids } = load()
    const tended = ids.flatMap((id) => engine.history(id)).filter((e) => e.type === "tended")
    // 2 + 1 + 3 + 1 (alive) + 1 + 2 + 1 + 1 (weak) + 4 + 0 + 1 + 1 (dead) = 18 reviews, 3 of them wrong.
    expect(tended).toHaveLength(18)
    expect(tended.filter((e) => (e.event as ReviewEvent).correct === false)).toHaveLength(3)
    const gold = ids[SAMPLE_FACTS.findIndex((f) => f.question === "Chemical symbol for gold?")]!
    expect(engine.history(gold).filter((e) => e.type === "resurrect-failed")).toHaveLength(1)
  })

  it("gives the Frankenstein grave the missed-answers autopsy", () => {
    const { engine, ids } = load()
    const index = SAMPLE_FACTS.findIndex((f) => f.question === "Who wrote Frankenstein?")
    const fact = SAMPLE_FACTS[index]!
    const report = engine.autopsy(ids[index]!, NOW)
    const sentences = generateCauseSentences(
      report,
      { question: fact.question, answer: fact.answer, why: fact.why, knowledge: fact.knowledge },
      { timeZone: "UTC" }
    )
    // solid 10 → right 20 → wrong 10 → right 20 → wrong 10: two misses, final 10 ≤ first 10.
    expect(sentences[0]).toBe(
      "Missed answers kept cutting the half-life (10 → 20 → 10 → 20 → 10 days). It never grew long enough to survive a gap."
    )
    expect(sentences).toContain("You missed 2 of 4 reviews.")
  })
})
