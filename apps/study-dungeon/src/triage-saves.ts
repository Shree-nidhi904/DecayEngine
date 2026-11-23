// What this session saves (task P5, Requirement 21, design "What This
// Session Saves"): of the Triage picks shown, the ones that would die in the
// next 7 days and that a right answer at `now` keeps alive for the whole window.
//
// Pure: it takes `now`, never reads the clock, and changes nothing. It reads
// `diesAt` from the engine's triage result and asks the policy's own
// applyEvent and healthAt (the functions engine.tend calls) about a copy of
// each pick. No decay formula is written here, and the window is the hero's
// LOSS_FORECAST_DAYS, not a new number.

import type { TriageCandidate } from "@decay-engine/engine"
import { LOSS_FORECAST_DAYS } from "./loss-forecast"
import { DAY_MS, studyDungeonPolicy, type Fact, type FactPayload, type FactPolicyData, type ReviewEvent } from "./policy"

/** A Triage pick, as the panel shows it. */
type FactCandidate = TriageCandidate<FactPayload, FactPolicyData>

/** The answer the line assumes (Requirement 21.5). */
export const SAVE_EVENT: ReviewEvent = { kind: "review", correct: true }

/**
 * The ids of the picks that are at risk (diesAt at or before now + 7 days)
 * and saved (a right answer at `now` leaves them not dead at now + 7 days),
 * each once, in the order of `picks` (Requirement 21.2, 21.4).
 *
 * @param picks engine.triage(budget, now).picks, as the panel shows them
 * @param now   the time triage ran at
 */
export function savedPicks(picks: readonly FactCandidate[], now: number): string[] {
  const end = now + LOSS_FORECAST_DAYS * DAY_MS
  const ids = new Set<string>()
  for (const pick of picks) {
    if (pick.diesAt === null || pick.diesAt > end) continue
    if (savedPast(pick.item, end, now)) ids.add(pick.item.id)
  }
  return [...ids]
}

/** How many picks the line counts: savedPicks(picks, now).length. */
export function triageSaves(picks: readonly FactCandidate[], now: number): number {
  return savedPicks(picks, now).length
}

/**
 * Whether a right answer at `now` leaves the fact not dead at `end`. The copy
 * is what engine.tend would store: the policy's health and policyData, with
 * lastEventAt = now. `item` is triage's settled copy, so nothing is mutated.
 * healthAt never rises between events, so not dead at `end` means not dead
 * anywhere in (now, end].
 */
function savedPast(item: Fact, end: number, now: number): boolean {
  const result = studyDungeonPolicy.applyEvent(item, SAVE_EVENT, now)
  const after: Fact = { ...item, health: result.health, policyData: result.policyData, lastEventAt: now }
  return studyDungeonPolicy.healthAt(after, end) >= studyDungeonPolicy.thresholds.dead
}
