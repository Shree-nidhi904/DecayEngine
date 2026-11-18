import { describe, it, expect, vi, afterEach } from "vitest"
import { checkPolicy } from "../../src/check-policy"
import { FakePolicy } from "../fake-policy"
import type { FakePayload, FakePolicyData, FakeEvent } from "../fake-policy"
import type { DecayPolicy, Item } from "../../src/types"

// Fixed timestamps. Tests never read the real clock.
const T0 = 1_000_000
const HOUR = 3_600_000

const PAYLOADS: FakePayload[] = [{ name: "Capital of Peru" }, { name: "Boiling point of water" }]
const EVENTS: FakeEvent[] = [
  { type: "boost", amount: 10 },
  { type: "damage", amount: 30 },
  { type: "damage", amount: 90 }, // kills the item, so checkPolicy leaves it out
]

// A correct policy: the fake policy's linear decay, clamped at 0.
class ClampedFakePolicy extends FakePolicy {
  override healthAt(item: Item<FakePayload, FakePolicyData>, now: number): number {
    return Math.max(0, super.healthAt(item, now))
  }
}

type SimpleData = Record<string, unknown>

// Builds a policy that breaks only the rule under test. Everything not given
// is well-behaved: init returns {}, applyEvent keeps health and policyData.
function makePolicy(parts: {
  healthAt: (item: Item<FakePayload, SimpleData>, now: number) => number
  init?: (payload: FakePayload, now: number) => SimpleData
}): DecayPolicy<FakePayload, SimpleData, FakeEvent> {
  return {
    thresholds: { weak: 50, dead: 20 },
    init: parts.init ?? (() => ({})),
    healthAt: parts.healthAt,
    applyEvent: (item) => ({ health: item.health, policyData: item.policyData }),
    nextDueAt: () => null,
    resurrect: () => ({ ok: true }),
  }
}

function expectOnlyFailures(
  report: { passed: boolean; failures: string[] },
  checkName: string
): void {
  expect(report.passed).toBe(false)
  expect(report.failures.length).toBeGreaterThan(0)
  expect(report.failures.every((f) => f.startsWith(`${checkName}: `))).toBe(true)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("checkPolicy with a valid policy", () => {
  it("returns passed = true and no failures", () => {
    const report = checkPolicy(new ClampedFakePolicy(), PAYLOADS, EVENTS, T0)
    expect(report).toEqual({ passed: true, failures: [] })
  })
})

describe("checkPolicy healthAt-range", () => {
  it("detects healthAt returning 150", () => {
    const policy = makePolicy({ healthAt: () => 150 })
    const report = checkPolicy(policy, PAYLOADS, [], T0)
    expectOnlyFailures(report, "healthAt-range")
  })

  it("detects healthAt returning -5", () => {
    // 100 at creation (so the item starts alive and is checked), -5 after.
    // Constant or falling, so only the range rule is broken.
    const policy = makePolicy({
      healthAt: (item, now) => (now === item.lastEventAt ? 100 : -5),
    })
    const report = checkPolicy(policy, PAYLOADS, [], T0)
    expectOnlyFailures(report, "healthAt-range")
  })

  it("flags the unclamped FakePolicy, which goes below 0 after 100 hours, with only range failures", () => {
    const report = checkPolicy(new FakePolicy(), PAYLOADS, EVENTS, T0)
    expectOnlyFailures(report, "healthAt-range")
  })
})

describe("checkPolicy healthAt-pure", () => {
  it("detects healthAt returning a different value on each call", () => {
    // Every call returns a slightly lower value than the call before. So the
    // value is always in [0, 100] and never rises over time, but two calls
    // with the same item and time disagree.
    let calls = 0
    const policy = makePolicy({
      healthAt: () => {
        calls += 1
        return 100 - calls * 0.001
      },
    })
    const report = checkPolicy(policy, PAYLOADS, [], T0)
    expectOnlyFailures(report, "healthAt-pure")
  })
})

describe("checkPolicy healthAt-never-increases", () => {
  it("detects health rising with elapsed time while staying in [0, 100]", () => {
    const policy = makePolicy({
      healthAt: (item, now) => Math.min(100, 50 + (now - item.lastEventAt) / HOUR),
    })
    const report = checkPolicy(policy, PAYLOADS, [], T0)
    expectOnlyFailures(report, "healthAt-never-increases")
  })
})

describe("checkPolicy init-json", () => {
  it.each([
    { kind: "an undefined value", data: { value: undefined } },
    { kind: "NaN", data: { value: NaN } },
    { kind: "a Date", data: { value: new Date(0) } },
    { kind: "a function", data: { value: () => 1 } },
  ])("detects init returning $kind", ({ data }) => {
    const policy = makePolicy({
      init: () => data as SimpleData,
      healthAt: () => 100,
    })
    const report = checkPolicy(policy, [{ name: "Capital of Peru" }], [], T0)
    expect(report.passed).toBe(false)
    expect(report.failures).toHaveLength(1)
    expect(report.failures[0].startsWith("init-json: ")).toBe(true)
  })
})

// Calls checkPolicy, asserting that the call itself does not throw.
function runCheck<PolicyData>(
  policy: DecayPolicy<FakePayload, PolicyData, FakeEvent>,
  payloads: FakePayload[],
  events: FakeEvent[],
  startTime: number
): { passed: boolean; failures: string[] } {
  let report: { passed: boolean; failures: string[] } | undefined
  expect(() => {
    report = checkPolicy(policy, payloads, events, startTime)
  }).not.toThrow()
  if (report === undefined) throw new Error("checkPolicy returned no report")
  return report
}

describe("checkPolicy inputs", () => {
  it("reports a missing policy without throwing", () => {
    const missing = null as unknown as DecayPolicy<FakePayload, SimpleData, FakeEvent>
    const report = runCheck(missing, PAYLOADS, EVENTS, T0)
    expectOnlyFailures(report, "inputs")
    expect(report.failures).toHaveLength(1)
  })

  it("reports a startTime that is not a finite number without throwing", () => {
    const report = runCheck(new ClampedFakePolicy(), PAYLOADS, EVENTS, NaN)
    expectOnlyFailures(report, "inputs")
    expect(report.failures).toHaveLength(1)
  })

  it("reports empty samplePayloads without throwing", () => {
    const report = runCheck(new ClampedFakePolicy(), [], EVENTS, T0)
    expectOnlyFailures(report, "inputs")
    expect(report.failures).toHaveLength(1)
  })

  it("reports sampleEvents that is not an array without throwing", () => {
    const notArray = null as unknown as FakeEvent[]
    const report = runCheck(new ClampedFakePolicy(), PAYLOADS, notArray, T0)
    expectOnlyFailures(report, "inputs")
    expect(report.failures).toHaveLength(1)
  })

  it("reports invalid thresholds (weak below dead) without throwing", () => {
    const policy = {
      ...makePolicy({ healthAt: () => 100 }),
      thresholds: { weak: 20, dead: 50 },
    }
    const report = runCheck(policy, PAYLOADS, EVENTS, T0)
    expectOnlyFailures(report, "inputs")
    expect(report.failures).toHaveLength(1)
  })
})

describe("checkPolicy build-items", () => {
  it("reports applyEvent throwing while building items, without throwing", () => {
    const policy: DecayPolicy<FakePayload, SimpleData, FakeEvent> = {
      ...makePolicy({ healthAt: () => 100 }),
      applyEvent: () => {
        throw new Error("applyEvent exploded")
      },
    }
    const report = runCheck(policy, [{ name: "Capital of Peru" }], [{ type: "boost", amount: 10 }], T0)
    expectOnlyFailures(report, "build-items")
    expect(report.failures).toHaveLength(1)
  })
})

describe("checkPolicy is deterministic", () => {
  it("gives the same report for the same inputs", () => {
    const first = checkPolicy(new FakePolicy(), PAYLOADS, EVENTS, T0)
    const second = checkPolicy(new FakePolicy(), PAYLOADS, EVENTS, T0)
    expect(first.failures.length).toBeGreaterThan(0)
    expect(second).toEqual(first)
  })
})

describe("checkPolicy never reads the clock", () => {
  it("runs with Date, Date.now, performance.now and Math.random all throwing", () => {
    // Expected failing report, computed before the globals are poisoned
    const expectedFailing = checkPolicy(new FakePolicy(), PAYLOADS, EVENTS, T0)

    const nowSpy = vi.fn((): number => {
      throw new Error("clock read: Date.now()")
    })
    const dateCtorSpy = vi.fn()
    class ThrowingDate {
      static now = nowSpy
      constructor(...args: unknown[]) {
        dateCtorSpy(...args)
        throw new Error("clock read: new Date()")
      }
    }
    const perfNowSpy = vi.fn((): number => {
      throw new Error("clock read: performance.now()")
    })
    const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("randomness: Math.random()")
    })
    vi.stubGlobal("Date", ThrowingDate)
    vi.stubGlobal("performance", { now: perfNowSpy })

    // Reports are asserted after restoring, so vitest never sees the stubs.
    // checkPolicy turns policy errors into failures, so the spies (not a
    // thrown error) are what prove no clock or randomness was used.
    const validReport = checkPolicy(new ClampedFakePolicy(), PAYLOADS, EVENTS, T0)
    const failingReport = checkPolicy(new FakePolicy(), PAYLOADS, EVENTS, T0)

    vi.unstubAllGlobals()
    const randomCalls = randomSpy.mock.calls.length
    vi.restoreAllMocks()

    expect(nowSpy).not.toHaveBeenCalled()
    expect(dateCtorSpy).not.toHaveBeenCalled()
    expect(perfNowSpy).not.toHaveBeenCalled()
    expect(randomCalls).toBe(0)

    expect(validReport).toEqual({ passed: true, failures: [] })
    expect(failingReport).toEqual(expectedFailing)
    expectOnlyFailures(failingReport, "healthAt-range")
  })
})
