// Triage: "I have N minutes. What should I save?"
// Source of truth: .kiro/steering/product.md (Triage rule, locked) and
// .kiro/specs/engine/requirements.md (Requirement 17b).
//
// Written by Claude Code, outside Kiro, at the developer's request; see docs/KIRO_LOG.md.
//
// Internal module: the public API is engine.triage.
//
// The rule, the same in every app:
//   value         = (100 - health) x (1 - health / 100) x importance
//   valuePerMinute = value / costMinutes
// Only items that are weak at `now` are candidates. The picks are the subset
// with the largest total value whose costMinutes fit the budget, found with an
// exact 0/1 knapsack over whole minutes (greedy by valuePerMinute is not
// optimal; see the worked example in tests/unit/triage.test.ts).

import { findDeathAfter } from "./bisection"
import { DecayEngineError } from "./errors"
import { settle } from "./settle"
import { MAX_FORECAST_HORIZON_MS, MAX_TIMESTAMP } from "./types"
import type { DecayPolicy, Item, TriageCandidate, TriageResult } from "./types"

export const MAX_BUDGET_MINUTES = 1440

export function triageValue(health: number, importance: number): number {
  return (100 - health) * (1 - health / 100) * importance
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Chooses which weak items to tend within budgetMinutes. Pure and read-only.
 * `now` must already be validated by the caller (the engine).
 */
export function triage<Payload, PolicyData>(
  items: Iterable<Item<Payload, PolicyData>>,
  budgetMinutes: number,
  policy: DecayPolicy<Payload, PolicyData, unknown>,
  now: number
): TriageResult<Payload, PolicyData> {
  if (
    typeof budgetMinutes !== "number" ||
    !Number.isInteger(budgetMinutes) ||
    budgetMinutes < 1 ||
    budgetMinutes > MAX_BUDGET_MINUTES
  ) {
    throw new DecayEngineError(
      "INVALID_BUDGET",
      `triage failed: budgetMinutes must be an integer from 1 to ${MAX_BUDGET_MINUTES}, got ${String(budgetMinutes)}`
    )
  }

  // 1. Candidates: weak at `now`. Settle gives health at `now` (clamped), and
  //    for an item whose lastEventAt is after `now`, its stored health.
  const { weak, dead } = policy.thresholds
  const candidates: TriageCandidate<Payload, PolicyData>[] = []
  for (const stored of items) {
    const item = settle(stored, policy, now).item
    if (item.state === "dead" || !(item.health >= dead && item.health < weak)) continue

    const value = triageValue(item.health, item.importance)
    candidates.push({
      item: JSON.parse(JSON.stringify(item)) as Item<Payload, PolicyData>,
      value,
      valuePerMinute: value / item.costMinutes,
      diesAt: findDeathAfter(item, policy, now, Math.min(now + MAX_FORECAST_HORIZON_MS, MAX_TIMESTAMP)),
    })
  }

  // 2. Exact 0/1 knapsack. Candidates are taken in id order and a choice is
  //    only replaced by a strictly better one, so ties always resolve the same way.
  candidates.sort((a, b) => compareIds(a.item.id, b.item.id))
  const picked = knapsack(candidates, budgetMinutes)

  const picks = candidates.filter((_, i) => picked[i])
  const others = candidates.filter((_, i) => !picked[i])

  // 3. Order for display.
  picks.sort((a, b) => b.valuePerMinute - a.valuePerMinute || compareIds(a.item.id, b.item.id))
  others.sort((a, b) => {
    if (a.diesAt !== b.diesAt) {
      if (a.diesAt === null) return 1
      if (b.diesAt === null) return -1
      return a.diesAt - b.diesAt
    }
    return compareIds(a.item.id, b.item.id)
  })

  return { picks, others }
}

// Returns, per candidate, whether it is in the best-value subset whose total
// costMinutes is at most `budget`.
function knapsack(
  candidates: ReadonlyArray<{ value: number; item: { costMinutes: number } }>,
  budget: number
): boolean[] {
  const n = candidates.length
  // best[w]: largest total value using at most w minutes, over the candidates seen so far
  const best = new Float64Array(budget + 1)
  // took[i][w]: candidate i improved best[w] when it was considered
  const took: Uint8Array[] = []

  for (let i = 0; i < n; i++) {
    const { value, item } = candidates[i]!
    const cost = item.costMinutes
    const row = new Uint8Array(budget + 1)
    for (let w = budget; w >= cost; w--) {
      const withItem = best[w - cost]! + value
      if (withItem > best[w]!) {
        best[w] = withItem
        row[w] = 1
      }
    }
    took.push(row)
  }

  // Walk back from the full budget to recover the chosen subset.
  const picked = new Array<boolean>(n).fill(false)
  let w = budget
  for (let i = n - 1; i >= 0; i--) {
    if (took[i]![w] === 1) {
      picked[i] = true
      w -= candidates[i]!.item.costMinutes
    }
  }
  return picked
}
