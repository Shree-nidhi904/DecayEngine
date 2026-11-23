// The first look's plan and flag (task L6, Requirement 25.1, 25.2, 25.4).

import { describe, expect, it } from "vitest"
import {
  FIRST_LOOK_DAYS,
  FIRST_LOOK_FLAG,
  FIRST_LOOK_HOLD_MS,
  FIRST_LOOK_OUT_MS,
  FIRST_LOOK_TOTAL_MS,
  easeInOutCubic,
  firstLookOffsetAt,
  firstLookOffsetForProgress,
  firstLookSeen,
  markFirstLookSeen,
} from "./first-look"
import type { FlagStorage } from "./first-run"
import { MemoryStorage } from "./test/app-kit"

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

describe("the plan (Requirement 25.4)", () => {
  it("lasts 5 000 ms: 4 000 out and a 1 000 hold, to +30 days", () => {
    expect(FIRST_LOOK_TOTAL_MS).toBe(5_000)
    expect(FIRST_LOOK_OUT_MS).toBe(4_000)
    expect(FIRST_LOOK_HOLD_MS).toBe(1_000)
    expect(FIRST_LOOK_DAYS).toBe(30)
  })

  it("gives the offset at each step", () => {
    expect(firstLookOffsetAt(0)).toBe(0)
    expect(firstLookOffsetAt(1_000)).toBe(45 * HOUR_MS)
    expect(firstLookOffsetAt(2_000)).toBe(15 * DAY_MS)
    expect(firstLookOffsetAt(3_000)).toBe(675 * HOUR_MS)
    expect(firstLookOffsetAt(4_000)).toBe(30 * DAY_MS)
    expect(firstLookOffsetAt(4_999)).toBe(30 * DAY_MS)
  })

  it("ends at today, and is today before it starts or for a bad time", () => {
    expect(firstLookOffsetAt(5_000)).toBe(0)
    expect(firstLookOffsetAt(9_000)).toBe(0)
    expect(firstLookOffsetAt(-1)).toBe(0)
    expect(firstLookOffsetAt(Number.NaN)).toBe(0)
  })

  it("moves in whole hours and never back on the way out", () => {
    let last = 0
    for (let ms = 0; ms <= FIRST_LOOK_OUT_MS; ms += 16) {
      const offset = firstLookOffsetAt(ms)
      expect(offset % HOUR_MS).toBe(0)
      expect(offset).toBeGreaterThanOrEqual(last)
      last = offset
    }
    expect(last).toBe(30 * DAY_MS)
  })

  it("eases in and out", () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(0.5)).toBe(0.5)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.1)).toBeCloseTo(0.004, 12)
    expect(easeInOutCubic(-2)).toBe(0)
    expect(easeInOutCubic(3)).toBe(1)
  })

  it("reads a Play frame's progress as elapsed time over 5 000 ms", () => {
    expect(firstLookOffsetForProgress(0.4)).toBe(15 * DAY_MS)
    expect(firstLookOffsetForProgress(0.9)).toBe(30 * DAY_MS)
    expect(firstLookOffsetForProgress(1)).toBe(0)
  })
})

describe("the flag (Requirement 25.1, 25.2)", () => {
  it("is missing at first, set by markFirstLookSeen, and still set on a reload of the same storage", () => {
    const storage = new MemoryStorage()
    expect(firstLookSeen(storage)).toBe(false)
    expect(markFirstLookSeen(storage)).toBe(true)
    expect(storage.entries()).toEqual({ [FIRST_LOOK_FLAG]: "1" })
    expect(firstLookSeen(storage)).toBe(true)
  })

  it("uses Study Dungeon's own key", () => {
    expect(FIRST_LOOK_FLAG).toBe("study-dungeon:first-look")
  })

  it("a storage that throws counts as seen, and a failed save says so", () => {
    const throwing: FlagStorage = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError")
      },
      removeItem: () => {},
    }
    expect(firstLookSeen(throwing)).toBe(true)
    expect(markFirstLookSeen(throwing)).toBe(false)
  })
})
