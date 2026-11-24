import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { checkPolicy, DecayEngine, InMemoryAdapter } from "@decay-engine/engine"
import { DAY_MS, studyDungeonPolicy, type Fact, type FactPayload } from "./policy"
import { grownHalfLife, memoryPolicy, MAX_DIFFICULTY, MIN_DIFFICULTY } from "./policy-memory"
import { policyFor, readModel, saveModel, MODEL_KEY } from "./policy-select"

const T0 = Date.UTC(2026, 0, 1)
const payload = (knowledge: FactPayload["knowledge"]): FactPayload => ({ question: "q", answer: "a", why: "", knowledge })

function fact(over: Partial<Fact> & { halfLifeDays?: number; difficulty?: number } = {}): Fact {
  const { halfLifeDays = 5, difficulty = 5, ...rest } = over
  return {
    id: "x", payload: payload("shaky"), policyData: { halfLifeDays, difficulty }, health: 100, state: "alive",
    createdAt: T0, lastEventAt: T0, timesResurrected: 0, importance: 2, costMinutes: 2, ...rest,
  }
}

describe("memoryPolicy", () => {
  it("passes the engine's own policy check", () => {
    const r = checkPolicy(memoryPolicy, [payload("new"), payload("shaky"), payload("solid")], [{ kind: "review", correct: true }, { kind: "review", correct: false }], T0)
    expect(r.failures).toEqual([])
    expect(r.passed).toBe(true)
  })

  it("decays like the default policy (same health curve for the same half-life)", () => {
    for (const d of [0, 1, 3, 9, 40]) {
      const f = fact()
      expect(memoryPolicy.healthAt(f, T0 + d * DAY_MS)).toBeCloseTo(studyDungeonPolicy.healthAt(f, T0 + d * DAY_MS), 9)
    }
  })

  it("spacing effect: a later right answer grows the half-life more than an early one", () => {
    const early = grownHalfLife(5, 5, 0.95)
    const late = grownHalfLife(5, 5, 0.55)
    expect(late).toBeGreaterThan(early)
    expect(early).toBeGreaterThanOrEqual(5)
  })

  it("difficulty: a harder fact gains less from the same right answer", () => {
    expect(grownHalfLife(5, 9, 0.6)).toBeLessThan(grownHalfLife(5, 2, 0.6))
  })

  it("a wrong answer shortens the half-life, raises difficulty and sets health to 45", () => {
    const r = memoryPolicy.applyEvent(fact({ halfLifeDays: 10, difficulty: 5 }), { kind: "review", correct: false }, T0)
    expect(r.health).toBe(45)
    expect(r.policyData.halfLifeDays).toBeCloseTo(4, 9)
    expect(r.policyData.difficulty).toBe(6)
  })

  it("facts saved by the default policy (no difficulty) work", () => {
    const old = fact({ difficulty: undefined })
    delete (old.policyData as { difficulty?: number }).difficulty
    expect(memoryPolicy.applyEvent(old, { kind: "review", correct: true }, T0).policyData.difficulty).toBeCloseTo(4.7, 9)
  })

  it("keeps half-life in 1..180 and difficulty in 1..10 over any run of answers", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.boolean(), fc.double({ min: 0, max: 60, noNaN: true })), { maxLength: 60 }), (steps) => {
        let f = fact({ halfLifeDays: 5, difficulty: 5 })
        let now = T0
        for (const [correct, gapDays] of steps) {
          now += gapDays * DAY_MS
          const health = memoryPolicy.healthAt(f, now)
          if (health < 10) continue
          const r = memoryPolicy.applyEvent({ ...f, health }, { kind: "review", correct }, now)
          f = { ...f, health: r.health, policyData: r.policyData, lastEventAt: now }
          expect(f.policyData.halfLifeDays).toBeGreaterThanOrEqual(1)
          expect(f.policyData.halfLifeDays).toBeLessThanOrEqual(180)
          expect(f.policyData.difficulty!).toBeGreaterThanOrEqual(MIN_DIFFICULTY)
          expect(f.policyData.difficulty!).toBeLessThanOrEqual(MAX_DIFFICULTY)
        }
      })
    )
  })

  it("runs on the real engine and switching policy keeps saved facts loadable", () => {
    const adapter = new InMemoryAdapter()
    const a = new DecayEngine(studyDungeonPolicy, adapter, () => "f1")
    a.addItem({ payload: payload("shaky"), importance: 2, costMinutes: 2 }, T0)
    a.tend("f1", { kind: "review", correct: true }, T0 + 4 * DAY_MS)
    const b = new DecayEngine(memoryPolicy, adapter, () => "unused")
    expect(b.view(T0 + 5 * DAY_MS)[0]!.policyData.halfLifeDays).toBe(10)
    b.tend("f1", { kind: "review", correct: true }, T0 + 12 * DAY_MS)
    expect(b.view(T0 + 12 * DAY_MS)[0]!.policyData.halfLifeDays).toBeGreaterThan(10)
  })
})

describe("policy selection", () => {
  it("defaults to doubling, saves memory, and removes the key for doubling", () => {
    const store = new Map<string, string>()
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
    expect(readModel(s)).toBe("doubling")
    expect(saveModel(s, "memory")).toBe(true)
    expect(store.get(MODEL_KEY)).toBe("memory")
    expect(readModel(s)).toBe("memory")
    saveModel(s, "doubling")
    expect(readModel(s)).toBe("doubling")
    expect(policyFor("memory")).toBe(memoryPolicy)
    expect(policyFor("doubling")).toBe(studyDungeonPolicy)
  })
  it("survives storage that throws", () => {
    const bad = { getItem: () => { throw new Error("no") }, setItem: () => { throw new Error("no") }, removeItem: () => { throw new Error("no") } }
    expect(readModel(bad)).toBe("doubling")
    expect(saveModel(bad, "memory")).toBe(false)
  })
})
