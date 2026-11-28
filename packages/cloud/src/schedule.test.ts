import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { DAY_MS, DEFAULT_QUIET_HOURS, applyQuietHours, nextChangeAt, planPush, type DecayState, type Viewable } from "./schedule"

const T0 = Date.UTC(2026, 10, 28, 12, 0, 0)
const HOUR = 3_600_000

/** An engine whose items fall alive -> weak at `weakAt` and weak -> dead at `deadAt` (epoch ms), as health does. */
function engineOf(items: { id: string; weakAt: number; deadAt: number }[]): Viewable {
  return {
    view: (now) =>
      items.map((i) => ({ id: i.id, state: (now >= i.deadAt ? "dead" : now >= i.weakAt ? "weak" : "alive") as DecayState })),
  }
}

describe("nextChangeAt", () => {
  it("finds the first moment any item gets worse, to the minute", () => {
    const e = engineOf([
      { id: "a", weakAt: T0 + 5 * DAY_MS, deadAt: T0 + 9 * DAY_MS },
      { id: "b", weakAt: T0 + 2 * DAY_MS + 123_456, deadAt: T0 + 20 * DAY_MS },
    ])
    const at = nextChangeAt(e, T0)!
    expect(at).toBeGreaterThanOrEqual(T0 + 2 * DAY_MS + 123_456)
    expect(at - (T0 + 2 * DAY_MS + 123_456)).toBeLessThanOrEqual(60_000)
  })

  it("compares with the state NOW, so an already weak item counts only when it dies", () => {
    const e = engineOf([{ id: "a", weakAt: T0 - DAY_MS, deadAt: T0 + 3 * DAY_MS }])
    const at = nextChangeAt(e, T0)!
    expect(Math.abs(at - (T0 + 3 * DAY_MS))).toBeLessThanOrEqual(60_000)
  })

  it("is null when nothing changes inside the horizon, with no items, and when everything is dead", () => {
    expect(nextChangeAt(engineOf([{ id: "a", weakAt: T0 + 90 * DAY_MS, deadAt: T0 + 99 * DAY_MS }]), T0)).toBeNull()
    expect(nextChangeAt(engineOf([]), T0)).toBeNull()
    expect(nextChangeAt(engineOf([{ id: "a", weakAt: T0 - 2 * DAY_MS, deadAt: T0 - DAY_MS }]), T0)).toBeNull()
  })

  it("property: the answer is when the engine first shows something worse", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ weak: fc.integer({ min: 1, max: 40 * 1440 }), gap: fc.integer({ min: 1, max: 20 * 1440 }) }), { minLength: 1, maxLength: 5 }),
        (specs) => {
          const items = specs.map((s, i) => ({ id: String(i), weakAt: T0 + s.weak * 60_000, deadAt: T0 + (s.weak + s.gap) * 60_000 }))
          const e = engineOf(items)
          const at = nextChangeAt(e, T0)
          const earliest = Math.min(...items.map((i) => i.weakAt))
          if (earliest > T0 + 30 * DAY_MS) {
            expect(at).toBeNull()
          } else {
            expect(at).not.toBeNull()
            expect(at!).toBeGreaterThanOrEqual(earliest)
            expect(at! - earliest).toBeLessThanOrEqual(60_000)
          }
        }
      ),
      { numRuns: 60 }
    )
  })
})

describe("applyQuietHours", () => {
  // Offset 0: local = UTC. Quiet 22:00 to 08:00.
  const at = (h: number, m = 0, day = 28) => Date.UTC(2026, 10, day, h, m)
  it("leaves times outside quiet hours alone, including the edges", () => {
    expect(applyQuietHours(at(8, 0), 0)).toBe(at(8, 0))
    expect(applyQuietHours(at(12), 0)).toBe(at(12))
    expect(applyQuietHours(at(21, 59), 0)).toBe(at(21, 59))
  })

  it("moves a time inside quiet hours to 08:00, the same morning or the next", () => {
    expect(applyQuietHours(at(22, 0), 0)).toBe(at(8, 0, 29))
    expect(applyQuietHours(at(23, 30), 0)).toBe(at(8, 0, 29))
    expect(applyQuietHours(at(3, 15), 0)).toBe(at(8, 0, 28))
  })

  it("uses the device's local hour: UTC+5:30 (offset -330) and UTC-8 (offset 480)", () => {
    // 17:00 UTC is 22:30 in UTC+5:30, so quiet; it moves to 08:00 local = 02:30 UTC next day.
    expect(applyQuietHours(at(17, 0), -330)).toBe(at(2, 30, 29))
    // 17:00 UTC is 09:00 in UTC-8, not quiet.
    expect(applyQuietHours(at(17, 0), 480)).toBe(at(17, 0))
  })

  it("handles a window that does not wrap midnight, and an empty one", () => {
    const noon = { startHour: 13, endHour: 15 }
    expect(applyQuietHours(at(14, 0), 0, noon)).toBe(at(15, 0))
    expect(applyQuietHours(at(16, 0), 0, noon)).toBe(at(16, 0))
    expect(applyQuietHours(at(3, 0), 0, { startHour: 9, endHour: 9 })).toBe(at(3, 0))
  })

  it("property: never earlier, never inside quiet hours, and at most 10 hours later", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 7 * 1440 }), fc.integer({ min: -720, max: 840 }), (minutes, offset) => {
        const t = T0 + minutes * 60_000
        const out = applyQuietHours(t, offset)
        expect(out).toBeGreaterThanOrEqual(t)
        expect(out - t).toBeLessThanOrEqual(10 * HOUR)
        expect(applyQuietHours(out, offset)).toBe(out)
      })
    )
  })
})

describe("planPush", () => {
  it("is the change time moved out of quiet hours; null when nothing changes", () => {
    const at = Date.UTC(2026, 10, 30, 23, 0)
    const e = engineOf([{ id: "a", weakAt: at, deadAt: at + 9 * DAY_MS }])
    const plan = planPush(e, T0, 0)!
    expect(plan.at).toBeGreaterThanOrEqual(Date.UTC(2026, 11, 1, 8, 0))
    expect(plan.at).toBeLessThan(Date.UTC(2026, 11, 1, 8, 2))
    expect(planPush(engineOf([]), T0, 0)).toBeNull()
    expect(DEFAULT_QUIET_HOURS).toEqual({ startHour: 22, endHour: 8 })
  })
})
