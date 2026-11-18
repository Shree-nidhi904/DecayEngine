import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { forecast } from "../../src/forecast"
import { settle } from "../../src/settle"
import type { ForecastEntry, Item } from "../../src/types"
import { FakePolicy } from "../fake-policy"
import type { FakePayload, FakePolicyData } from "../fake-policy"

// Fixed timestamps. Tests never read the real clock.
const T0 = 1_000_000
const HOUR = 3_600_000
const MINUTE = 60_000
const NOW = T0 + 1000 * HOUR

// Fake policy: weak below 50, dead below 20, 1 health per hour.
const policy = new FakePolicy()
type FakeItem = Item<FakePayload, FakePolicyData>

// A stored item with the given health as of lastEventAt (default NOW).
// Health below 20 makes a stored dead item (health 0, diedAt = lastEventAt).
function item(id: string, health: number, overrides: Partial<FakeItem> = {}): FakeItem {
  const lastEventAt = overrides.lastEventAt ?? NOW
  const dead = health < 20
  return {
    id,
    payload: { name: id },
    policyData: { decayRate: 1 / HOUR },
    health: dead ? 0 : health,
    state: health >= 50 ? "alive" : dead ? "dead" : "weak",
    createdAt: T0,
    lastEventAt,
    ...(dead ? { diedAt: lastEventAt } : {}),
    timesResurrected: 0,
    importance: 1,
    costMinutes: 10,
    ...overrides,
  }
}

function ids(entries: ForecastEntry<FakePayload, FakePolicyData>[]): string[] {
  return entries.map((e) => e.item.id)
}

describe("forecast", () => {
  it("returns an empty array when there are no items", () => {
    expect(forecast<FakePayload, FakePolicyData>([], NOW, 24 * HOUR, policy)).toEqual([])
  })

  it("returns an empty array when no item dies within the horizon", () => {
    // Health 100 dies after 80 hours; health 60 after 40 hours.
    const items = [item("a", 100), item("b", 60)]
    expect(forecast(items, NOW, 24 * HOUR, policy)).toEqual([])
  })

  it("excludes items stored dead", () => {
    const items = [item("dead", 0, { lastEventAt: NOW - HOUR }), item("weak", 30)]
    // "weak" dies 10 hours after NOW; "dead" is already in the graveyard.
    expect(ids(forecast(items, NOW, 24 * HOUR, policy))).toEqual(["weak"])
  })

  it("excludes items that died before now but were never settled", () => {
    // Stored alive at health 30 twenty hours ago: dead at NOW (health 10).
    const items = [item("gone", 30, { lastEventAt: NOW - 20 * HOUR })]
    expect(forecast(items, NOW, 100 * HOUR, policy)).toEqual([])
  })

  it("finds diesAt by bisection: within one minute after the exact crossing, never before", () => {
    // Health 100 at NOW crosses below 20 just after NOW + 80 hours.
    const stored = item("a", 100)
    const [entry] = forecast([stored], NOW, 100 * HOUR, policy)

    expect(entry).toBeDefined()
    expect(entry!.diesAt).toBeGreaterThanOrEqual(NOW + 80 * HOUR)
    expect(entry!.diesAt).toBeLessThanOrEqual(NOW + 80 * HOUR + MINUTE)
    // The earliest time already dead, to 1-minute precision.
    expect(policy.healthAt(stored, entry!.diesAt)).toBeLessThan(20)
    expect(policy.healthAt(stored, entry!.diesAt - MINUTE)).toBeGreaterThanOrEqual(20)
  })

  it("settles each item at now first and returns the settled item", () => {
    // Stored at health 100 thirty hours before NOW: health 70 at NOW.
    const stored = item("a", 100, { lastEventAt: NOW - 30 * HOUR })
    const [entry] = forecast([stored], NOW, 100 * HOUR, policy)

    expect(entry).toBeDefined()
    expect(entry!.item.health).toBeCloseTo(70, 9)
    expect(entry!.item.lastEventAt).toBe(NOW)
    expect(entry!.item.state).toBe("alive")
    // Still dies 80 hours after its last event, i.e. 50 hours after NOW.
    expect(entry!.diesAt).toBeGreaterThanOrEqual(NOW + 50 * HOUR)
    expect(entry!.diesAt).toBeLessThanOrEqual(NOW + 50 * HOUR + MINUTE)
  })

  it("includes only items that die within horizonMs", () => {
    // "soon" (health 30) dies just after NOW + 10 hours; "late" (health 100) after 80 hours.
    const items = [item("soon", 30), item("late", 100)]

    expect(forecast(items, NOW, 10 * HOUR - MINUTE, policy)).toEqual([])

    const entries = forecast(items, NOW, 10 * HOUR + MINUTE, policy)
    expect(ids(entries)).toEqual(["soon"])
    expect(entries[0]!.diesAt).toBeLessThanOrEqual(NOW + 10 * HOUR + MINUTE)
  })

  it("sorts by diesAt ascending, ties by id ascending", () => {
    // c dies after 20 hours; a and b (same health, same lastEventAt) after 10 hours.
    const items = [item("c", 40), item("b", 30), item("a", 30)]
    const entries = forecast(items, NOW, 24 * HOUR, policy)

    expect(ids(entries)).toEqual(["a", "b", "c"])
    expect(entries[0]!.diesAt).toBe(entries[1]!.diesAt)
    expect(entries[1]!.diesAt).toBeLessThan(entries[2]!.diesAt)
  })

  it("searches an item whose lastEventAt is after now from its lastEventAt", () => {
    // Stored at health 30 five hours after NOW: dies just after NOW + 15 hours.
    const future = item("future", 30, { lastEventAt: NOW + 5 * HOUR })
    const [entry] = forecast([future], NOW, 24 * HOUR, policy)

    expect(entry).toBeDefined()
    expect(entry!.item).toEqual(future)
    expect(entry!.diesAt).toBeGreaterThanOrEqual(NOW + 15 * HOUR)
    expect(entry!.diesAt).toBeLessThanOrEqual(NOW + 15 * HOUR + MINUTE)

    // Last event after the end of the horizon: not forecast.
    const beyond = item("beyond", 30, { lastEventAt: NOW + 30 * HOUR })
    expect(forecast([beyond], NOW, 24 * HOUR, policy)).toEqual([])
  })

  it("does not change its input and returns copies", () => {
    const items = [item("a", 30, { lastEventAt: NOW - 5 * HOUR }), item("b", 0)]
    const before = JSON.parse(JSON.stringify(items)) as FakeItem[]

    const entries = forecast(items, NOW, 24 * HOUR, policy)
    expect(items).toEqual(before)

    entries[0]!.item.health = 99
    entries[0]!.item.payload.name = "changed"
    expect(items).toEqual(before)
  })

  it("property: entries are exactly the items dying in the horizon, sorted, and dead at diesAt", () => {
    const stored = fc.record({
      health: fc.integer({ min: 0, max: 100 }), // below 20 -> stored dead
      ageMinutes: fc.integer({ min: 0, max: 120 * 60 }),
    })
    fc.assert(
      fc.property(
        fc.array(stored, { maxLength: 8 }),
        fc.integer({ min: 1, max: 200 * 60 }),
        (specs, horizonMinutes) => {
          const items = specs.map((s, i) =>
            item(`i${i}`, s.health, { lastEventAt: NOW - s.ageMinutes * MINUTE })
          )
          const horizonMs = horizonMinutes * MINUTE
          const end = NOW + horizonMs
          const entries = forecast(items, NOW, horizonMs, policy)

          // Completeness: not dead at NOW and below the dead threshold at the end.
          const expected = items
            .filter((stored) => {
              const atNow = settle(stored, policy, NOW).item
              return atNow.state !== "dead" && policy.healthAt(atNow, end) < 20
            })
            .map((s) => s.id)
            .sort()
          expect([...ids(entries)].sort()).toEqual(expected)

          for (let i = 0; i < entries.length; i++) {
            const entry = entries[i]!
            expect(entry.diesAt).toBeGreaterThan(NOW)
            expect(entry.diesAt).toBeLessThanOrEqual(end)

            // Consistent with view: settling the stored item at diesAt shows it dead.
            const original = items.find((s) => s.id === entry.item.id)!
            expect(settle(original, policy, entry.diesAt).item.state).toBe("dead")

            if (i > 0) {
              const prev = entries[i - 1]!
              const ordered =
                prev.diesAt < entry.diesAt ||
                (prev.diesAt === entry.diesAt && prev.item.id < entry.item.id)
              expect(ordered).toBe(true)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
