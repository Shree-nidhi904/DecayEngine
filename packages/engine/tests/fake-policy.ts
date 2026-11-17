// Fake policy for engine tests.
// Source of truth: .kiro/specs/engine/design.md (Fake Policy for Testing).
//
// Linear time-based decay of 1 health per hour by default. With thresholds
// weak = 50 and dead = 20, an untended item at health 100 goes weak after
// 50 hours and dies after 80 hours. Sized in hours so that bisection at
// 1-minute precision is actually exercised.
//
// The policy never reads the clock: time comes only from the `now` argument.
// It does not clamp health; the engine clamps (Requirement 13), so engine
// tests can push health out of range with "boost" and "damage" events.

import type { DecayPolicy, Item } from "../src/types"

export type FakePayload = { name: string }

// Health lost per millisecond (default: 1 per hour)
export type FakePolicyData = { decayRate: number }

export type FakeEvent =
  | { type: "boost"; amount: number }
  | { type: "damage"; amount: number }

export class FakePolicy
  implements DecayPolicy<FakePayload, FakePolicyData, FakeEvent>
{
  thresholds = { weak: 50, dead: 20 }

  private _resurrectShouldFail = false

  setResurrectFailure(shouldFail: boolean): void {
    this._resurrectShouldFail = shouldFail
  }

  init(payload: FakePayload, now: number): FakePolicyData {
    // 1 health per hour: alive for 50 hours, weak until 80 hours, then dead.
    return { decayRate: 1 / 3_600_000 }
  }

  healthAt(item: Item<FakePayload, FakePolicyData>, now: number): number {
    const elapsed = now - item.lastEventAt
    const decay = item.policyData.decayRate * elapsed
    return item.health - decay
  }

  applyEvent(
    item: Item<FakePayload, FakePolicyData>,
    event: FakeEvent,
    now: number
  ): { health: number; policyData: FakePolicyData } {
    let newHealth = item.health

    if (event.type === "boost") {
      newHealth += event.amount
    } else if (event.type === "damage") {
      newHealth -= event.amount
    }

    return { health: newHealth, policyData: item.policyData }
  }

  nextDueAt(item: Item<FakePayload, FakePolicyData>, now: number): number | null {
    // Due when health would reach the weak threshold
    const currentHealth = this.healthAt(item, now)
    if (currentHealth < this.thresholds.weak) {
      return now // Already due
    }

    const timeUntilWeak =
      (currentHealth - this.thresholds.weak) / item.policyData.decayRate
    return now + timeUntilWeak
  }

  resurrect(
    item: Item<FakePayload, FakePolicyData>,
    event: FakeEvent,
    now: number
  ): { ok: true } | { ok: false; reason: string } {
    if (this._resurrectShouldFail) {
      return { ok: false, reason: "Resurrection not available" }
    }
    return { ok: true }
  }
}
