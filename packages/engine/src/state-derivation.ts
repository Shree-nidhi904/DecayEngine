// Pure state derivation: health + thresholds -> state, and the single place
// where death and state-change history entries are produced.
// Source of truth: .kiro/specs/engine/design.md (State Derivation).

import { DecayEngineError } from "./errors"
import type { HistoryEntry, Item } from "./types"

export function deriveState(
  health: number,
  thresholds: { weak: number; dead: number }
): "alive" | "weak" | "dead" {
  if (health >= thresholds.weak) {
    return "alive"
  }
  if (health >= thresholds.dead) {
    return "weak"
  }
  return "dead"
}

export function validateThresholds(thresholds: { weak: number; dead: number }): void {
  if (
    typeof thresholds.weak !== "number" ||
    typeof thresholds.dead !== "number" ||
    !Number.isFinite(thresholds.weak) ||
    !Number.isFinite(thresholds.dead)
  ) {
    throw new DecayEngineError("INVALID_THRESHOLDS", "Thresholds must be finite numbers")
  }
  if (thresholds.dead <= 0) {
    throw new DecayEngineError("INVALID_THRESHOLDS", "dead threshold must be positive")
  }
  if (thresholds.weak > 100) {
    throw new DecayEngineError("INVALID_THRESHOLDS", "weak threshold cannot exceed 100")
  }
  if (thresholds.dead >= thresholds.weak) {
    throw new DecayEngineError(
      "INVALID_THRESHOLDS",
      "dead threshold must be less than weak threshold"
    )
  }
}

// `source` names the policy function that produced `health` (for example
// "healthAt"), so the error says which function returned the bad value
// (Requirement 16.5). Without it, the generic message is used.
export function clampHealth(health: unknown, source?: string): number {
  if (typeof health !== "number" || !Number.isFinite(health)) {
    const message =
      source !== undefined
        ? `Policy ${source} returned invalid health: ${String(health)}`
        : "Health must be a finite number"
    throw new DecayEngineError("INVALID_HEALTH", message)
  }
  if (health > 100) return 100
  if (health < 0) return 0
  return health
}

// When thresholds were crossed. Settle fills these from bisection.
// Event-caused changes (tend, edit) leave them empty, so the crossing time is `now`.
export type Crossings = { weakAt?: number; deadAt?: number }

export function applyHealth<Payload, PolicyData>(
  item: Item<Payload, PolicyData>,
  newHealth: number,
  now: number,
  thresholds: { weak: number; dead: number },
  crossings: Crossings = {}
): { item: Item<Payload, PolicyData>; historyEntries: HistoryEntry[] } {
  // Derive new state from health
  const oldState = item.state
  const newState = deriveState(newHealth, thresholds)

  // Build updated item with new health, state, and lastEventAt
  // (lastEventAt is always `now`: stored health is health as of lastEventAt)
  const updatedItem: Item<Payload, PolicyData> = {
    ...item,
    health: newHealth,
    state: newState,
    lastEventAt: now,
  }

  const historyEntries: HistoryEntry[] = []

  // Record state transition if state changed
  if (oldState !== newState) {
    if (newState === "dead") {
      const diedAt = crossings.deadAt ?? now
      // Alive straight to dead (for example, the user was away for weeks):
      // still record the weak crossing first, so Autopsy can report wentWeakAt
      if (oldState === "alive") {
        historyEntries.push({
          type: "state-changed",
          itemId: item.id,
          timestamp: crossings.weakAt ?? diedAt,
          health: thresholds.weak,
          from: "alive",
          to: "weak",
        })
      }
      // Item died: set diedAt, clamp health to 0, record "died"
      updatedItem.diedAt = diedAt
      updatedItem.health = 0
      historyEntries.push({
        type: "died",
        itemId: item.id,
        timestamp: diedAt,
        health: 0,
      })
    } else {
      // State changed but not to dead: record "state-changed"
      historyEntries.push({
        type: "state-changed",
        itemId: item.id,
        timestamp: newState === "weak" ? (crossings.weakAt ?? now) : now,
        health: newHealth,
        from: oldState,
        to: newState,
      })
    }
  }

  return { item: updatedItem, historyEntries }
}
