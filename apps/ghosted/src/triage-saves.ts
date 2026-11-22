// What this session saves (task P5, Req 36, design sections 13.3 and 13.4):
// of the Triage picks shown, the ones that would go dark in the next 7 days
// and that a call at `now` keeps lit for the whole window.
//
// Pure: it takes `now`, never reads the clock, and changes nothing. It reads
// `diesAt` from the engine's triage result and asks the policy's own
// applyEvent and healthAt (the functions engine.tend calls) about a copy of
// each pick. No decay formula is written here.

import type { TriageCandidate } from "@decay-engine/engine"
import { LOSS_FORECAST_DAYS } from "./loss-forecast"
import { ghostedPolicy, type ContactEvent, type Person, type PersonPayload, type PersonPolicyData } from "./policy"
import { DAY_MS } from "./time"

/** A Triage pick (the same type as GhostedCandidate in components/GhostedTriage.tsx). */
type GhostedCandidate = TriageCandidate<PersonPayload, PersonPolicyData>

/** The contact the line assumes (Req 36.5). A meet-up gives the same policyData. */
export const SAVE_EVENT: ContactEvent = { kind: "call" }

/**
 * The ids of the picks that are at risk (diesAt at or before now + 7 days)
 * and kept (a call at `now` leaves them not dark at now + 7 days), each once,
 * in the order of `picks`.
 *
 * @param picks engine.triage(budget, now).picks, as the panel shows them
 * @param now   the time triage ran at
 */
export function savedPicks(picks: readonly GhostedCandidate[], now: number): string[] {
  const end = now + LOSS_FORECAST_DAYS * DAY_MS
  const ids = new Set<string>()
  for (const pick of picks) {
    if (pick.diesAt === null || pick.diesAt > end) continue
    if (keptPast(pick.item, end, now)) ids.add(pick.item.id)
  }
  return [...ids]
}

/** How many picks the line counts: savedPicks(picks, now).length. */
export function triageSaves(picks: readonly GhostedCandidate[], now: number): number {
  return savedPicks(picks, now).length
}

/**
 * Whether a call at `now` leaves the person not dark at `end`. The copy is
 * what engine.tend would store: the policy's health and policyData, with
 * lastEventAt = now. healthAt never rises between events, so not dark at
 * `end` means not dark anywhere in (now, end].
 */
function keptPast(item: Person, end: number, now: number): boolean {
  const result = ghostedPolicy.applyEvent(item, SAVE_EVENT, now)
  const after: Person = { ...item, health: result.health, policyData: result.policyData, lastEventAt: now }
  return ghostedPolicy.healthAt(after, end) >= ghostedPolicy.thresholds.dead
}
