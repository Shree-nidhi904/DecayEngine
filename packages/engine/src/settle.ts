// Pure settle function: computes an item's health and state at `now` and the
// history entries for any state transitions. Used by every engine operation.
// Source of truth: .kiro/specs/engine/design.md (Settle Function, Death Timing with Bisection).
//
// Internal module: not exported from src/index.ts. Tests import from here.

import { bisectCrossing } from "./bisection"
import { applyHealth, clampHealth, deriveState } from "./state-derivation"
import type { Crossings } from "./state-derivation"
import type { DecayPolicy, HistoryEntry, Item } from "./types"

export type SettleResult<Payload, PolicyData> = {
  item: Item<Payload, PolicyData>
  historyEntries: HistoryEntry[]
}

export function settle<Payload, PolicyData>(
  item: Item<Payload, PolicyData>,
  policy: DecayPolicy<Payload, PolicyData, unknown>,
  now: number
): SettleResult<Payload, PolicyData> {
  // If already dead, return unchanged
  if (item.state === "dead") {
    return { item, historyEntries: [] }
  }

  // If now is earlier than lastEventAt, return unchanged
  // (Used by view and due; write operations will throw TIME_WENT_BACKWARD)
  if (now < item.lastEventAt) {
    return { item, historyEntries: [] }
  }

  // Compute health at now
  const computedHealth = policy.healthAt(item, now)
  const clampedHealth = clampHealth(computedHealth, "healthAt")

  // If health unchanged, return unchanged
  if (clampedHealth === item.health) {
    return { item, historyEntries: [] }
  }

  // Find when thresholds were actually crossed (Requirement 17a).
  // Bisection runs on the STORED item (before settling), over [item.lastEventAt, now],
  // because the stored item is what healthAt decays from.
  const newState = deriveState(clampedHealth, policy.thresholds)
  const crossings: Crossings = {}
  if (item.state === "alive" && newState !== "alive") {
    crossings.weakAt = bisectCrossing(item, policy, policy.thresholds.weak, item.lastEventAt, now)
  }
  if (newState === "dead") {
    crossings.deadAt = bisectCrossing(item, policy, policy.thresholds.dead, item.lastEventAt, now)
  }

  // Health changed: use applyHealth to compute new state and history
  const { item: updatedItem, historyEntries } = applyHealth(
    item,
    clampedHealth,
    now,
    policy.thresholds,
    crossings
  )

  return { item: updatedItem, historyEntries }
}
