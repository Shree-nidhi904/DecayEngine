import { describe, expect, it } from "vitest"
import { DecayEngine, InMemoryAdapter, type DecayPolicy } from "@decay-engine/engine"
import { lifeTriage, type Source } from "./index"

const DAY = 86_400_000
const T0 = Date.UTC(2026, 0, 1)

// Two policies with different shapes, written here so the test depends on no app.
const linear = (days: number): DecayPolicy<{ n: string }, Record<string, never>, null> => ({
  thresholds: { weak: 60, dead: 10 },
  init: () => ({}),
  healthAt: (i, now) => Math.max(0, i.health - ((now - i.lastEventAt) / (days * DAY)) * 100),
  applyEvent: (i) => ({ health: 100, policyData: i.policyData }),
  nextDueAt: () => null,
  resurrect: () => ({ ok: true }),
})
const halving: DecayPolicy<{ n: string }, Record<string, never>, null> = {
  thresholds: { weak: 60, dead: 10 },
  init: () => ({}),
  healthAt: (i, now) => i.health * Math.pow(0.5, (now - i.lastEventAt) / (5 * DAY)),
  applyEvent: (i) => ({ health: 100, policyData: i.policyData }),
  nextDueAt: () => null,
  resurrect: () => ({ ok: true }),
}

function build(items: Array<{ n: string; importance: number; cost: number }>, policy: DecayPolicy<{ n: string }, Record<string, never>, null>, prefix: string) {
  let k = 0
  const e = new DecayEngine(policy, new InMemoryAdapter(), () => `${prefix}${++k}`)
  for (const i of items) e.addItem({ payload: { n: i.n }, importance: i.importance, costMinutes: i.cost }, T0)
  return e
}

const NOW = T0 + 4 * DAY

describe("lifeTriage", () => {
  const facts = build([{ n: "a", importance: 3, cost: 10 }, { n: "b", importance: 1, cost: 5 }], halving, "f")
  const friends = build([{ n: "c", importance: 3, cost: 20 }, { n: "d", importance: 2, cost: 5 }], linear(6), "p")
  const sources: Source[] = [{ label: "Facts", engine: facts }, { label: "Friends", engine: friends }]

  it("matches a brute-force optimum over both sources", () => {
    const all = lifeTriage(sources, 1440, NOW).picks.concat(lifeTriage(sources, 1440, NOW).others)
    expect(all.length).toBeGreaterThan(0)
    for (const budget of [5, 10, 15, 25, 40]) {
      const r = lifeTriage(sources, budget, NOW)
      let best = 0
      for (let mask = 0; mask < 1 << all.length; mask++) {
        let cost = 0
        let value = 0
        all.forEach((c, i) => { if (mask & (1 << i)) { cost += c.costMinutes; value += c.value } })
        if (cost <= budget && value > best) best = value
      }
      expect(r.totalValue).toBeCloseTo(best, 9)
      expect(r.totalMinutes).toBeLessThanOrEqual(budget)
    }
  })

  it("never beats by less than the naive even split, and picks plus others are every weak item", () => {
    const r = lifeTriage(sources, 25, NOW)
    expect(r.totalValue).toBeGreaterThanOrEqual(r.evenSplitValue - 1e-9)
    expect(r.picks.length + r.others.length).toBe(
      facts.triage(1, NOW).picks.length + facts.triage(1, NOW).others.length +
      friends.triage(1, NOW).picks.length + friends.triage(1, NOW).others.length
    )
  })

  it("one source gives the same set as that engine's own triage", () => {
    const own = facts.triage(15, NOW).picks.map((c) => c.item.id).sort()
    const life = lifeTriage([{ label: "Facts", engine: facts }], 15, NOW).picks.map((c) => c.id).sort()
    expect(life).toEqual(own)
  })

  it("is deterministic and changes no engine", () => {
    const before = JSON.stringify(facts.view(NOW))
    expect(lifeTriage(sources, 20, NOW)).toEqual(lifeTriage(sources, 20, NOW))
    expect(JSON.stringify(facts.view(NOW))).toBe(before)
  })

  it("rejects a bad budget and duplicate labels", () => {
    expect(() => lifeTriage(sources, 0, NOW)).toThrow()
    expect(() => lifeTriage(sources, 1.5, NOW)).toThrow()
    expect(() => lifeTriage([sources[0]!, sources[0]!], 10, NOW)).toThrow()
  })
})
