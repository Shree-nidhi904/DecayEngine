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

// Extensions spec, task 2.5 and 2.6 (Requirements 2.3, 2.6 to 2.8, 2.10). Expected values are worked by hand in
// design section 2.2, not taken from running the code.
describe("memoryPolicy, extensions spec", () => {
  it("worked examples: half-life 5, difficulty 5, recalled 0.95 gives about 5.48; recalled 0.55 about 10.21", () => {
    expect(grownHalfLife(5, 5, 0.95)).toBeCloseTo(5.48, 2)
    expect(grownHalfLife(5, 5, 0.55)).toBeCloseTo(10.21, 2)
  })

  it("nothing forgotten means no growth: recalled 1 keeps the half-life", () => {
    for (const h of [1, 5, 37.5, 180]) expect(grownHalfLife(h, 5, 1)).toBeCloseTo(h, 12)
  })

  it("P2: a later answer (lower recalled share) never grows the half-life less, and never shrinks it", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 180, noNaN: true }),
        fc.double({ min: 1, max: 10, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (h, d, a, b) => {
          const r1 = Math.min(a, b)
          const r2 = Math.max(a, b)
          const late = grownHalfLife(h, d, r1)
          const early = grownHalfLife(h, d, r2)
          expect(late).toBeGreaterThanOrEqual(early - 1e-9)
          expect(early).toBeGreaterThanOrEqual(Math.min(h, 180) - 1e-9)
          expect(late).toBeLessThanOrEqual(180)
        }
      ),
      { numRuns: 200 }
    )
  })

  it("nextDueAt: null when dead, now when below 60, otherwise the time health reaches 60", () => {
    expect(memoryPolicy.nextDueAt(fact({ state: "dead", health: 5 }), T0)).toBeNull()
    // Half-life 5 from 100: health is 60 after 5 × log2(100/60) ≈ 3.685 days.
    const due = memoryPolicy.nextDueAt(fact({ halfLifeDays: 5 }), T0)!
    expect((due - T0) / DAY_MS).toBeCloseTo(5 * Math.log2(100 / 60), 9)
    expect(memoryPolicy.healthAt(fact({ halfLifeDays: 5 }), due)).toBeCloseTo(60, 9)
    const late = T0 + 4 * DAY_MS
    expect(memoryPolicy.nextDueAt(fact({ halfLifeDays: 5 }), late)).toBe(late)
  })

  it("resurrect: a right answer succeeds and keeps the policy data; a wrong one is refused with the reason", () => {
    const dead = fact({ state: "dead", health: 5, halfLifeDays: 7, difficulty: 8 })
    expect(memoryPolicy.resurrect(dead, { kind: "review", correct: true }, T0)).toEqual({ ok: true })
    expect(memoryPolicy.resurrect(dead, { kind: "review", correct: false }, T0)).toEqual({
      ok: false,
      reason: "You got it wrong. The fact stays dead.",
    })
  })

  it("switching back: the doubling policy drops difficulty on the next answer, and the memory model then reads it as 5", () => {
    const hard = fact({ halfLifeDays: 5, difficulty: 8 })
    const r = studyDungeonPolicy.applyEvent(hard, { kind: "review", correct: true }, T0)
    expect(r.policyData).toEqual({ halfLifeDays: 10 })
    const back = fact({ halfLifeDays: 10 })
    delete (back.policyData as { difficulty?: number }).difficulty
    // Read as 5, a wrong answer raises it to 6 (not 9, as it would be from 8).
    expect(memoryPolicy.applyEvent(back, { kind: "review", correct: false }, T0).policyData.difficulty).toBe(6)
  })

  it("init: difficulty new 7, shaky 5, solid 3; an unknown level throws an error that names it", () => {
    expect(memoryPolicy.init(payload("new"), T0)).toEqual({ halfLifeDays: 2, difficulty: 7 })
    expect(memoryPolicy.init(payload("shaky"), T0)).toEqual({ halfLifeDays: 5, difficulty: 5 })
    expect(memoryPolicy.init(payload("solid"), T0)).toEqual({ halfLifeDays: 10, difficulty: 3 })
    expect(() => memoryPolicy.init({ ...payload("new"), knowledge: "expert" as unknown as FactPayload["knowledge"] }, T0)).toThrow(/"expert"/)
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
