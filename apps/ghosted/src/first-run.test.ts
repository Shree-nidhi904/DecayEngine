// first-run.ts (Req 20.7, 15.2): Ghosted's flags, its reset keys, and when
// first run shows. An in-memory FlagStorage; no real storage or clock.

import { describe, expect, it, vi } from "vitest"
import {
  ENGINE_STORAGE_KEY,
  OWN_PEOPLE_FLAG,
  RESET_KEYS,
  STARTED_FLAG,
  hasOwnPeople,
  hasStarted,
  markOwnPeople,
  markStarted,
  needsFirstRun,
  resetAllData,
} from "./first-run"
import { FakeStorage } from "./test/fake-storage"

describe("keys", () => {
  it("are Ghosted's own", () => {
    expect(STARTED_FLAG).toBe("ghosted:started")
    expect(ENGINE_STORAGE_KEY).toBe("decay-engine:ghosted")
    expect(OWN_PEOPLE_FLAG).toBe("ghosted:own-people")
  })

  it("RESET_KEYS are exactly Ghosted's three keys, with no tour flag", () => {
    expect(RESET_KEYS).toEqual(["decay-engine:ghosted", "ghosted:started", "ghosted:own-people"])
    expect(RESET_KEYS.some((key) => key.includes("tour"))).toBe(false)
  })
})

describe("needsFirstRun", () => {
  it("is true with no flag and no people", () => {
    expect(needsFirstRun(new FakeStorage(), 0)).toBe(true)
  })

  it("is false after 'Start empty' (the flag is set) even with no people", () => {
    const storage = new FakeStorage()
    markStarted(storage)
    expect(hasStarted(storage)).toBe(true)
    expect(needsFirstRun(storage, 0)).toBe(false)
  })

  it("is false when people exist from before the flag, so sample people never land on real ones", () => {
    expect(needsFirstRun(new FakeStorage(), 3)).toBe(false)
  })

  it("does not read another app's started flag", () => {
    expect(needsFirstRun(new FakeStorage({ "study-dungeon:started": "1" }), 0)).toBe(true)
  })
})

describe("own people", () => {
  it("is false until marked, then true", () => {
    const storage = new FakeStorage()
    expect(hasOwnPeople(storage)).toBe(false)
    markOwnPeople(storage)
    expect(hasOwnPeople(storage)).toBe(true)
    expect(storage.snapshot()).toEqual({ "ghosted:own-people": "1" })
  })
})

describe("resetAllData", () => {
  it("removes exactly Ghosted's keys, leaves other apps' keys alone, then reloads", () => {
    const storage = new FakeStorage({
      "decay-engine:ghosted": '{"items":[]}',
      "ghosted:started": "1",
      "ghosted:own-people": "1",
      "decay-engine:study-dungeon": '{"kept":true}',
      "study-dungeon:started": "1",
      "study-dungeon:sound": "on",
    })
    const order: string[] = []
    const reload = vi.fn(() => order.push(`reload after ${storage.removed.length} removals`))

    resetAllData(storage, reload)

    expect(storage.removed).toEqual(["decay-engine:ghosted", "ghosted:started", "ghosted:own-people"])
    expect(storage.snapshot()).toEqual({
      "decay-engine:study-dungeon": '{"kept":true}',
      "study-dungeon:sound": "on",
      "study-dungeon:started": "1",
    })
    expect(reload).toHaveBeenCalledTimes(1)
    expect(order).toEqual(["reload after 3 removals"])
  })

  it("shows first run again afterwards", () => {
    const storage = new FakeStorage()
    markStarted(storage)
    markOwnPeople(storage)
    resetAllData(storage, () => {})
    expect(needsFirstRun(storage, 0)).toBe(true)
    expect(hasOwnPeople(storage)).toBe(false)
  })
})
