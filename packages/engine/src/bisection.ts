// Binary search for threshold crossing times (death timing and weak crossings).
// Source of truth: .kiro/specs/engine/design.md (Death Timing with Bisection)
// and .kiro/specs/engine/requirements.md (Requirement 17a).
//
// Internal module: not exported from src/index.ts. Tests import from here.
//
// Relies on the policy invariant that policy.healthAt never increases with time
// between events for the same item. So once health is below a threshold at time T,
// it stays below it for every later time, and binary search is valid.

import { clampHealth } from "./state-derivation"
import type { DecayPolicy, Item } from "./types"

export const BISECT_PRECISION_MS = 60000 // 1 minute

// Finds when health first drops below `threshold`, to 1-minute precision.
// Precondition: health at toTime is already below threshold.
// Returns the upper end of the final interval: the earliest checked time at which
// health is already below the threshold, so view(result) shows the crossed state.
export function bisectCrossing<Payload, PolicyData>(
  item: Item<Payload, PolicyData>,
  policy: DecayPolicy<Payload, PolicyData, unknown>,
  threshold: number,
  fromTime: number,
  toTime: number
): number {
  let left = fromTime
  let right = toTime

  while (right - left > BISECT_PRECISION_MS) {
    const mid = Math.floor((left + right) / 2)
    const health = clampHealth(policy.healthAt(item, mid), "healthAt")

    if (health < threshold) {
      // Already below at mid, search earlier
      right = mid
    } else {
      // Still at or above at mid, search later
      left = mid
    }
  }

  return right
}

// For triage and forecast: when will this (settled, not dead) item die?
// Returns null if health at toTime is still at or above the dead threshold.
export function findDeathAfter<Payload, PolicyData>(
  item: Item<Payload, PolicyData>,
  policy: DecayPolicy<Payload, PolicyData, unknown>,
  fromTime: number,
  toTime: number
): number | null {
  const healthAtEnd = clampHealth(policy.healthAt(item, toTime), "healthAt")
  if (healthAtEnd >= policy.thresholds.dead) {
    return null // does not die within the window
  }
  return bisectCrossing(item, policy, policy.thresholds.dead, fromTime, toTime)
}
