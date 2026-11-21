// Ghosted decay policy.
//
// Written by Kiro (Ghosted task 0.2) as the documented exception in
// .kiro/steering/authorship.md. The rules come from Requirements 1 to 4 of
// .kiro/specs/ghosted/requirements.md and design sections 2.1 and 2.2; they
// were set by the developer, not by Kiro.
//
// Freshness falls in a straight line from the last contact and reaches 0 at
// T = 3 × rhythmDays days. It shows connection freshness, never "how much
// someone cares".
//
// Pure and synchronous: no clock reads, no randomness, no side effects.
import type { DecayPolicy, Item } from "@decay-engine/engine"

export type PersonPayload = {
  name: string // 1-60 chars, required
  relationship: string // 0-40 chars ("" = no tag)
  rhythmDays: number // integer 1..365
  lastContactAt: number // ms; set when adding only
}

export type PersonPolicyData = {
  lastContactAt: number // freshness decays from this, never from item.lastEventAt
}

export type ContactEvent = { kind: "text" | "call" | "meetup" }

export type Person = Item<PersonPayload, PersonPolicyData>

const DAY_MS = 86_400_000

/** T: the span over which freshness falls from 100 to 0. */
function spanMs(item: Person): number {
  return 3 * item.payload.rhythmDays * DAY_MS
}

/** Req 1.3-1.7. Reads only policyData.lastContactAt, payload.rhythmDays and now. */
function healthAt(item: Person, now: number): number {
  const elapsed = Math.max(0, now - item.policyData.lastContactAt)
  const T = spanMs(item)
  return Math.max(0, (100 * (T - elapsed)) / T)
}

export const ghostedPolicy: DecayPolicy<PersonPayload, PersonPolicyData, ContactEvent> = {
  // Req 1.1
  thresholds: { weak: 60, dead: 10 },

  // Req 1.2
  init(payload: PersonPayload, _now: number): PersonPolicyData {
    return { lastContactAt: payload.lastContactAt }
  },

  healthAt,

  // Req 2.1-2.4
  applyEvent(
    item: Person,
    event: ContactEvent,
    now: number,
  ): { health: number; policyData: PersonPolicyData } {
    if (event.kind === "text") {
      const h = healthAt(item, now)
      const health = Math.min(100, h + 40)
      const T = spanMs(item)
      return { health, policyData: { lastContactAt: now - ((100 - health) / 100) * T } }
    }
    // "call" or "meetup"
    return { health: 100, policyData: { lastContactAt: now } }
  },

  // Req 3.1-3.3
  nextDueAt(item: Person, now: number): number | null {
    if (item.state === "dead") return null
    const h = healthAt(item, now)
    if (h >= ghostedPolicy.thresholds.weak) return item.policyData.lastContactAt + (2 * spanMs(item)) / 5
    if (h >= ghostedPolicy.thresholds.dead) return now
    return null
  },

  // Req 4.1-4.3: no failing case, any contact kind lights the window fully.
  resurrect(
    _item: Person,
    _event: ContactEvent,
    now: number,
  ): { ok: true; payload?: PersonPayload; policyData?: PersonPolicyData } | { ok: false; reason: string } {
    return { ok: true, policyData: { lastContactAt: now } }
  },
}
