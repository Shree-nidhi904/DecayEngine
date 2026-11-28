// @vitest-environment jsdom
import fc from "fast-check"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  BACKUP_REMINDER_DAYS,
  DAY_MS,
  FIRST_SEEN_KEY,
  LAST_BACKUP_KEY,
  SNOOZE_KEY,
  SNOOZE_DAYS,
  markBackedUp,
  markFirstSeen,
  readNudgeInput,
  shouldNudge,
  snooze,
} from "./backup-reminder"
import { BackupNudge, backupNudgeText } from "./components/BackupNudge"
import { RESET_KEYS } from "./first-run"

const T0 = 1_700_000_000_000
const base = { now: T0, hasData: true, lastBackupAt: null, firstSeenAt: null, snoozedUntil: null }

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe("shouldNudge", () => {
  it("is quiet with no data, and with no record of when data first appeared", () => {
    expect(shouldNudge({ ...base, hasData: false, lastBackupAt: T0 - 99 * DAY_MS })).toBe(false)
    expect(shouldNudge(base)).toBe(false)
  })

  it("shows once the last backup is BACKUP_REMINDER_DAYS days old, not a moment before", () => {
    const edge = T0 - BACKUP_REMINDER_DAYS * DAY_MS
    expect(shouldNudge({ ...base, lastBackupAt: edge })).toBe(true)
    expect(shouldNudge({ ...base, lastBackupAt: edge + 1 })).toBe(false)
  })

  it("counts from first use when there was never a backup, and prefers the last backup when there was", () => {
    const old = T0 - 30 * DAY_MS
    expect(shouldNudge({ ...base, firstSeenAt: old })).toBe(true)
    expect(shouldNudge({ ...base, firstSeenAt: old, lastBackupAt: T0 - DAY_MS })).toBe(false)
  })

  it("stays hidden while snoozed and returns after", () => {
    const input = { ...base, lastBackupAt: T0 - 30 * DAY_MS }
    expect(shouldNudge({ ...input, snoozedUntil: T0 + 1 })).toBe(false)
    expect(shouldNudge({ ...input, snoozedUntil: T0 })).toBe(true)
  })

  it("property: never shows for a backup made within the window", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: BACKUP_REMINDER_DAYS * DAY_MS - 1 }), (age) => {
        expect(shouldNudge({ ...base, lastBackupAt: T0 - age })).toBe(false)
      })
    )
  })
})

describe("flags", () => {
  it("markBackedUp records the time and clears a snooze; snooze lasts SNOOZE_DAYS", () => {
    snooze(localStorage, T0)
    expect(Number(localStorage.getItem(SNOOZE_KEY))).toBe(T0 + SNOOZE_DAYS * DAY_MS)
    markBackedUp(localStorage, T0)
    expect(localStorage.getItem(LAST_BACKUP_KEY)).toBe(String(T0))
    expect(localStorage.getItem(SNOOZE_KEY)).toBeNull()
  })

  it("markFirstSeen writes once and never moves", () => {
    markFirstSeen(localStorage, T0)
    markFirstSeen(localStorage, T0 + 5 * DAY_MS)
    expect(localStorage.getItem(FIRST_SEEN_KEY)).toBe(String(T0))
  })

  it("treats junk as missing, and a failing storage as best effort", () => {
    localStorage.setItem(LAST_BACKUP_KEY, "soon")
    localStorage.setItem(SNOOZE_KEY, "-4")
    const input = readNudgeInput(localStorage, T0, true)
    expect(input.lastBackupAt).toBeNull()
    expect(input.snoozedUntil).toBeNull()
    const broken = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("full")
      },
      removeItem: () => {
        throw new Error("full")
      },
    }
    expect(() => markBackedUp(broken, T0)).not.toThrow()
    expect(() => snooze(broken, T0)).not.toThrow()
    expect(() => markFirstSeen(broken, T0)).not.toThrow()
    expect(readNudgeInput(broken, T0, true).lastBackupAt).toBeNull()
  })

  it("all three flags are cleared by Reset all data", () => {
    for (const key of [LAST_BACKUP_KEY, FIRST_SEEN_KEY, SNOOZE_KEY]) expect(RESET_KEYS).toContain(key)
  })
})

describe("BackupNudge", () => {
  const props = (extra: object = {}) => ({ storage: localStorage, hasData: true, now: () => T0, ...extra })

  it("records first use, and does not show on the first day", () => {
    const { container } = render(<BackupNudge {...props()} />)
    expect(localStorage.getItem(FIRST_SEEN_KEY)).toBe(String(T0))
    expect(container.textContent).toBe("")
  })

  it("shows the days since the last backup and how to back up, and Not now hides it for a week", () => {
    localStorage.setItem(LAST_BACKUP_KEY, String(T0 - 9 * DAY_MS))
    render(<BackupNudge {...props()} />)
    expect(screen.getByRole("status").textContent).toContain(backupNudgeText.since(9))
    expect(screen.getByRole("status").textContent).toContain("Back up")
    fireEvent.click(screen.getByRole("button", { name: backupNudgeText.dismiss }))
    expect(screen.queryByRole("status")).toBeNull()
    expect(Number(localStorage.getItem(SNOOZE_KEY))).toBe(T0 + SNOOZE_DAYS * DAY_MS)
  })

  it("says there was never a backup when only first use is known", () => {
    localStorage.setItem(FIRST_SEEN_KEY, String(T0 - 12 * DAY_MS))
    render(<BackupNudge {...props()} />)
    expect(screen.getByRole("status").textContent).toContain(backupNudgeText.never(12))
    expect(backupNudgeText.never(12)).toContain("people")
  })

  it("goes away when a backup is made elsewhere in the app", () => {
    localStorage.setItem(LAST_BACKUP_KEY, String(T0 - 9 * DAY_MS))
    render(<BackupNudge {...props()} />)
    expect(screen.getByRole("status")).toBeTruthy()
    act(() => markBackedUp(localStorage, T0))
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("is silent with no data", () => {
    localStorage.setItem(LAST_BACKUP_KEY, String(T0 - 30 * DAY_MS))
    const { container } = render(<BackupNudge {...props({ hasData: false })} />)
    expect(container.textContent).toBe("")
    expect(localStorage.getItem(FIRST_SEEN_KEY)).toBeNull()
  })
})
