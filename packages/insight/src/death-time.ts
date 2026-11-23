// deathTime: when an engine says an item dies. Read-only.
// Source of truth: .kiro/specs/insight/requirements.md (Requirement 5) and
// design.md (sections 3 and 6).
//
// The answer always comes from the engine: view(from) for an item that is
// already dead (its diedAt), otherwise forecast(from, horizonMs). Nothing here
// computes health, so no policy maths is repeated.

import { MAX_FORECAST_HORIZON_MS } from "@decay-engine/engine"
import type { DecayEngine } from "@decay-engine/engine"
import type { DeathTimeOptions } from "./types"

/**
 * When the item dies, as the engine sees it from `from`.
 *
 * @param engine - Any engine that holds the item.
 * @param itemId - The item.
 * @param from - The time to look from, in milliseconds.
 * @param options - horizonMs, default MAX_FORECAST_HORIZON_MS (10 years).
 * @returns diedAt if the item is dead at `from`; otherwise the forecast's
 *   diesAt; null if it does not die within the horizon.
 * @throws The engine's errors, unchanged: ITEM_NOT_FOUND for an unknown id,
 *   INVALID_TIMESTAMP for a bad `from`, INVALID_HORIZON for a bad horizonMs,
 *   and any policy error.
 */
export function deathTime<Payload, PolicyData, Event>(
  engine: DecayEngine<Payload, PolicyData, Event>,
  itemId: string,
  from: number,
  options: DeathTimeOptions = {}
): number | null {
  const horizonMs = options.horizonMs ?? MAX_FORECAST_HORIZON_MS

  // Throws ITEM_NOT_FOUND for an unknown id (view would just leave it out).
  engine.history(itemId)

  const viewed = engine.view(from).find((item) => item.id === itemId)
  if (viewed !== undefined && viewed.state === "dead") {
    if (viewed.diedAt === undefined) {
      // The engine sets diedAt on every dead item; this is never reached.
      throw new Error(`deathTime: the engine returned dead item ${itemId} without diedAt`)
    }
    return viewed.diedAt
  }

  const entry = engine.forecast(from, horizonMs).find((e) => e.item.id === itemId)
  return entry === undefined ? null : entry.diesAt
}
