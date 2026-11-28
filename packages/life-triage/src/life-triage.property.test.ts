// Extensions spec, task 4.5 (Requirements 9.3 to 9.5, properties P3 and P4).
// Two real engines with different decay shapes, items of generated age,
// importance and cost, and a generated budget. The optimum is worked out by
// brute force over every subset of the engines' own triage candidates, so it
// does not reuse the package's knapsack. Fixed times, never the clock.

import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { DecayEngine, InMemoryAdapter, type DecayPolicy } from "@decay-engine/engine"
import { lifeTriage, type Source } from "./index"

const DAY = 86_400_000
const NOW = Date.UTC(2026, 5, 1)

type P = { n: string }
type D = Record<string, never>

// Weak below 60, dead below 10. Halving (5-day half-life): weak after about 3.7 days, dead after about 16.6.
const halving: DecayPolicy<P, D, null> = {
  thresholds: { weak: 60, dead: 10 },
  init: () => ({}),
  healthAt: (i, now) => i.health * Math.pow(0.5, (now - i.lastEventAt) / (5 * DAY)),
  applyEvent: (i) => ({ health: 100, policyData: i.policyData }),
  nextDueAt: () => null,
  resurrect: () => ({ ok: true }),
}
// Straight line to 0 over 12 days: weak after 4.8 days, dead after 10.8.
const linear: DecayPolicy<P, D, null> = {
  thresholds: { weak: 60, dead: 10 },
  init: () => ({}),
  healthAt: (i, now) => Math.max(0, i.health - ((now - i.lastEventAt) / (12 * DAY)) * 100),
  applyEvent: (i) => ({ health: 100, policyData: i.policyData }),
  nextDueAt: () => null,
  resurrect: () => ({ ok: true }),
}

type Spec = { importance: number; cost: number; ageDays: number }

const itemArb = fc.record({
  importance: fc.integer({ min: 1, max: 3 }),
  cost: fc.integer({ min: 1, max: 30 }),
  // Hundredths of a day, not fc.double: fast-check 4 leans heavily on the edge
  // values 0 and 20 for a double, which left almost every item brand new.
  ageDays: fc.integer({ min: 0, max: 2000 }).map((n) => n / 100),
})
const scenarioArb = fc.record({
  facts: fc.array(itemArb, { maxLength: 6 }),
  friends: fc.array(itemArb, { maxLength: 6 }),
  budget: fc.integer({ min: 1, max: 60 }),
})

function build(items: Spec[], policy: DecayPolicy<P, D, null>, prefix: string) {
  let k = 0
  const e = new DecayEngine(policy, new InMemoryAdapter(), () => `${prefix}${++k}`)
  // Oldest first, so creation times never go backwards.
  for (const i of [...items].sort((a, b) => b.ageDays - a.ageDays)) {
    e.addItem({ payload: { n: prefix }, importance: i.importance, costMinutes: i.cost }, NOW - Math.round(i.ageDays * DAY))
  }
  return e
}

function sourcesOf(s: { facts: Spec[]; friends: Spec[] }): Source[] {
  return [
    { label: "Facts", engine: build(s.facts, halving, "f") },
    { label: "Friends", engine: build(s.friends, linear, "p") },
  ]
}

/** Every weak item's cost and value, straight from each engine's own triage. */
function candidates(sources: Source[]) {
  return sources.flatMap((s) => {
    const r = s.engine.triage(1, NOW)
    return [...r.picks, ...r.others].map((c) => ({ cost: c.item.costMinutes, value: c.value }))
  })
}

function bruteForce(cands: { cost: number; value: number }[], budget: number): number {
  let best = 0
  for (let mask = 0; mask < 1 << cands.length; mask++) {
    let cost = 0
    let value = 0
    cands.forEach((c, i) => {
      if (mask & (1 << i)) {
        cost += c.cost
        value += c.value
      }
    })
    if (cost <= budget && value > best) best = value
  }
  return best
}

describe("lifeTriage properties", () => {
  it("generator coverage: at least half the scenarios have weak items, from both shapes", () => {
    const runs = fc.sample(scenarioArb, { numRuns: 200, seed: 7 })
    const withWeak = runs.filter((s) => candidates(sourcesOf(s)).length > 0).length
    const facts = runs.filter((s) => candidates([sourcesOf(s)[0]!]).length > 0).length
    const friends = runs.filter((s) => candidates([sourcesOf(s)[1]!]).length > 0).length
    expect(withWeak).toBeGreaterThanOrEqual(100)
    expect(facts).toBeGreaterThanOrEqual(40)
    expect(friends).toBeGreaterThanOrEqual(20)
  })

  it("P3: the total value is the brute-force optimum, and the picks fit the budget", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const sources = sourcesOf(s)
        const r = lifeTriage(sources, s.budget, NOW)
        expect(r.totalValue).toBeCloseTo(bruteForce(candidates(sources), s.budget), 9)
        expect(r.totalMinutes).toBeLessThanOrEqual(s.budget)
        expect(r.totalMinutes).toBe(r.picks.reduce((t, c) => t + c.costMinutes, 0))
        expect(r.picks.length + r.others.length).toBe(candidates(sources).length)
      }),
      { numRuns: 100 }
    )
  })

  it("P4: the combined choice is never worse than the even split", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const r = lifeTriage(sourcesOf(s), s.budget, NOW)
        expect(r.totalValue).toBeGreaterThanOrEqual(r.evenSplitValue - 1e-9)
      }),
      { numRuns: 100 }
    )
  })

  it("order: picks by value per minute (highest first), others by death time (earliest first, none last)", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const r = lifeTriage(sourcesOf(s), s.budget, NOW)
        for (let i = 1; i < r.picks.length; i++) {
          const a = r.picks[i - 1]!
          const b = r.picks[i]!
          expect(a.value / a.costMinutes).toBeGreaterThanOrEqual(b.value / b.costMinutes)
        }
        for (let i = 1; i < r.others.length; i++) {
          const a = r.others[i - 1]!.diesAt
          const b = r.others[i]!.diesAt
          if (a === null) expect(b).toBeNull()
          else if (b !== null) expect(a).toBeLessThanOrEqual(b)
        }
      }),
      { numRuns: 100 }
    )
  })

  it("even split with three sources and an odd budget: each gets floor(budget / 3) minutes", () => {
    const one = (label: string, prefix: string) => ({
      label,
      engine: build([{ importance: 3, cost: 3, ageDays: 6 }], halving, prefix),
    })
    const sources = [one("A", "a"), one("B", "b"), one("C", "c")]
    // 10 minutes: 3 each. Every source can fit its one 3-minute item, so the split keeps all three.
    const r10 = lifeTriage(sources, 10, NOW)
    const each = candidates([sources[0]!])[0]!.value
    expect(r10.evenSplitValue).toBeCloseTo(3 * each, 9)
    // 8 minutes: 2 each, so no source fits its item; the combined choice still takes two.
    const r8 = lifeTriage(sources, 8, NOW)
    expect(r8.evenSplitValue).toBe(0)
    expect(r8.totalValue).toBeCloseTo(2 * each, 9)
  })
})
