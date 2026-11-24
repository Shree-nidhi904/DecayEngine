// Life Triage: one time budget across several engines (for example facts and
// friends). Built only on the engine's public API: each source's weak items come
// from engine.triage, and the choice across sources is one exact 0/1 knapsack
// over whole minutes, with the same value rule every app already uses.
// Pure and clock-free: `now` is passed in. Nothing here changes an engine.

import type { DecayEngine } from "@decay-engine/engine"

// Any engine, whatever its payload and policy data: only triage is used.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyEngine = Pick<DecayEngine<any, any, any>, "triage">

export type Source = { label: string; engine: AnyEngine }

export type LifeCandidate = {
  source: string
  id: string
  payload: unknown
  health: number
  importance: number
  costMinutes: number
  value: number
  diesAt: number | null
}

export type LifeTriageResult = {
  /** Best total value that fits, ordered by value per minute, ties by source then id. */
  picks: LifeCandidate[]
  /** Weak items left out, by diesAt ascending (null last), ties by source then id. */
  others: LifeCandidate[]
  totalValue: number
  totalMinutes: number
  /** Value kept by giving each source an equal share of the budget (a naive split), for comparison. */
  evenSplitValue: number
}

export const MAX_LIFE_BUDGET_MINUTES = 1440

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function candidatesOf(sources: Source[], now: number): LifeCandidate[] {
  const out: LifeCandidate[] = []
  for (const s of sources) {
    // The budget only splits picks from others; both lists together are every weak item.
    const r = s.engine.triage(1, now)
    for (const c of [...r.picks, ...r.others]) {
      out.push({
        source: s.label,
        id: c.item.id,
        payload: c.item.payload,
        health: c.item.health,
        importance: c.item.importance,
        costMinutes: c.item.costMinutes,
        value: c.value,
        diesAt: c.diesAt,
      })
    }
  }
  return out.sort((a, b) => cmp(a.source, b.source) || cmp(a.id, b.id))
}

/** Exact 0/1 knapsack. Ties resolve the same way every time (strictly better replaces). */
function knapsack(cands: ReadonlyArray<LifeCandidate>, budget: number): boolean[] {
  const best = new Float64Array(budget + 1)
  const took: Uint8Array[] = []
  for (const c of cands) {
    const row = new Uint8Array(budget + 1)
    for (let w = budget; w >= c.costMinutes; w--) {
      const v = best[w - c.costMinutes]! + c.value
      if (v > best[w]!) {
        best[w] = v
        row[w] = 1
      }
    }
    took.push(row)
  }
  const picked = new Array<boolean>(cands.length).fill(false)
  let w = budget
  for (let i = cands.length - 1; i >= 0; i--) {
    if (took[i]![w] === 1) {
      picked[i] = true
      w -= cands[i]!.costMinutes
    }
  }
  return picked
}

function sum(list: ReadonlyArray<LifeCandidate>, f: (c: LifeCandidate) => number): number {
  return list.reduce((t, c) => t + f(c), 0)
}

/**
 * @param sources - Each engine with a label. Labels must be distinct.
 * @param budgetMinutes - Integer from 1 to 1440.
 * @param now - Time in milliseconds.
 * @throws Error for a bad budget or duplicate labels. Engine errors pass through.
 */
export function lifeTriage(sources: Source[], budgetMinutes: number, now: number): LifeTriageResult {
  if (!Number.isInteger(budgetMinutes) || budgetMinutes < 1 || budgetMinutes > MAX_LIFE_BUDGET_MINUTES) {
    throw new Error(`lifeTriage failed: budgetMinutes must be an integer from 1 to ${MAX_LIFE_BUDGET_MINUTES}`)
  }
  if (new Set(sources.map((s) => s.label)).size !== sources.length) {
    throw new Error("lifeTriage failed: source labels must be distinct")
  }
  const cands = candidatesOf(sources, now)
  const picked = knapsack(cands, budgetMinutes)
  const picks = cands.filter((_, i) => picked[i])
  const others = cands.filter((_, i) => !picked[i])

  picks.sort((a, b) => b.value / b.costMinutes - a.value / a.costMinutes || cmp(a.source, b.source) || cmp(a.id, b.id))
  others.sort((a, b) => {
    if (a.diesAt !== b.diesAt) {
      if (a.diesAt === null) return 1
      if (b.diesAt === null) return -1
      return a.diesAt - b.diesAt
    }
    return cmp(a.source, b.source) || cmp(a.id, b.id)
  })

  let evenSplitValue = 0
  if (sources.length > 0) {
    const share = Math.floor(budgetMinutes / sources.length)
    for (const s of sources) {
      const own = cands.filter((c) => c.source === s.label)
      if (share >= 1) {
        const p = knapsack(own, share)
        evenSplitValue += sum(own.filter((_, i) => p[i]), (c) => c.value)
      }
    }
  }

  return { picks, others, totalValue: sum(picks, (c) => c.value), totalMinutes: sum(picks, (c) => c.costMinutes), evenSplitValue }
}
