// The test policies obey the policy contract (checkPolicy) and give the
// hand-worked numbers the other tests rely on.

import { describe, expect, it } from "vitest"
import { checkPolicy } from "@decay-engine/engine"
import { DAY, T0, makeItem } from "./fixtures"
import {
  crammingPolicy,
  expPolicy,
  linearPolicy,
  payloadHalfLifePolicy,
  throwingPolicy,
} from "./policies"

describe("test policies pass checkPolicy", () => {
  it("expPolicy", () => {
    expect(checkPolicy(expPolicy, [{ label: "a" }], ["good", "bad"], T0)).toEqual({ passed: true, failures: [] })
  })
  it("linearPolicy", () => {
    expect(checkPolicy(linearPolicy, [{ label: "a" }], ["good", "bad"], T0)).toEqual({ passed: true, failures: [] })
  })
  it("crammingPolicy", () => {
    expect(checkPolicy(crammingPolicy, [{ label: "a" }], ["review"], T0)).toEqual({ passed: true, failures: [] })
  })
  it("payloadHalfLifePolicy", () => {
    expect(
      checkPolicy(payloadHalfLifePolicy, [{ halfLifeDays: 3 }, { halfLifeDays: 10 }], ["good", "bad"], T0)
    ).toEqual({ passed: true, failures: [] })
  })
  it("throwingPolicy (no events: its applyEvent throws by design)", () => {
    expect(checkPolicy(throwingPolicy, [{ label: "a" }], [], T0)).toEqual({ passed: true, failures: [] })
  })
})

describe("hand-worked values", () => {
  it("expPolicy halves in 3 days", () => {
    const item = makeItem({ label: "a" }, { tends: 0, lives: 1 })
    expect(expPolicy.healthAt(item, T0 + 3 * DAY)).toBe(50)
  })

  it("linearPolicy loses 21 in 3 days", () => {
    const item = makeItem({ label: "a" }, { tends: 0, lives: 1 })
    expect(linearPolicy.healthAt(item, T0 + 3 * DAY)).toBeCloseTo(79, 12)
  })

  it("crammingPolicy: a review half a day after the last one takes 30 off the settled 95", () => {
    const settled = makeItem({ label: "a" }, { lastReviewAt: T0 }, { health: 95, lastEventAt: T0 + DAY / 2 })
    expect(crammingPolicy.applyEvent(settled, "review", T0 + DAY / 2)).toEqual({
      health: 65,
      policyData: { lastReviewAt: T0 + DAY / 2 },
    })
  })

  it("crammingPolicy: a review a day or more after the last one sets 100", () => {
    const settled = makeItem({ label: "a" }, { lastReviewAt: T0 }, { health: 85, lastEventAt: T0 + 1.5 * DAY })
    expect(crammingPolicy.applyEvent(settled, "review", T0 + 1.5 * DAY)).toEqual({
      health: 100,
      policyData: { lastReviewAt: T0 + 1.5 * DAY },
    })
  })
})
