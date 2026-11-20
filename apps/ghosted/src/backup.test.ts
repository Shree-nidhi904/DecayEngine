// backup.ts (Ghosted task 2.7; Requirements 21.1 to 21.4): a real engine
// saving into an in-memory storage, so the snapshot is the one the app saves.
// Fixed timestamps only.

import { describe, expect, it } from "vitest"
import { DecayEngine } from "@decay-engine/engine"
import { applyBackup, checkBackup, makeBackup } from "./backup"
import { ENGINE_STORAGE_KEY, OWN_PEOPLE_FLAG, STARTED_FLAG } from "./first-run"
import { ghostedPolicy, type ContactEvent, type PersonPayload, type PersonPolicyData } from "./policy"
import { FakeStorage } from "./test/fake-storage"
import { DAY_MS } from "./time"
import { backupRefusals } from "./wording"

const T0 = 1_700_000_000_000

/** Two people saved the way the app saves them. */
function savedStorage(): FakeStorage {
  const storage = new FakeStorage()
  let n = 0
  const engine = new DecayEngine<PersonPayload, PersonPolicyData, ContactEvent>(
    ghostedPolicy,
    { load: () => null, save: (s) => storage.setItem(ENGINE_STORAGE_KEY, JSON.stringify(s)) },
    () => `id-${n++}`
  )
  engine.addItem(
    { payload: { name: "Mira Castell", relationship: "Cousin", rhythmDays: 30, lastContactAt: T0 - 5 * DAY_MS }, importance: 2, costMinutes: 10 },
    T0
  )
  engine.addItem(
    { payload: { name: "Tomas Reyes", relationship: "", rhythmDays: 7, lastContactAt: T0 - 40 * DAY_MS }, importance: 1, costMinutes: 5 },
    T0
  )
  return storage
}

const savedSnapshot = (storage: FakeStorage) => JSON.parse(storage.getItem(ENGINE_STORAGE_KEY)!)

describe("makeBackup", () => {
  it("writes { app: 'ghosted', version: 1, exportedAt, snapshot } with the stored snapshot", () => {
    const storage = savedStorage()
    const text = makeBackup(storage, new Date(T0 + DAY_MS))!
    const file = JSON.parse(text)
    expect(Object.keys(file).sort()).toEqual(["app", "exportedAt", "snapshot", "version"])
    expect(file.app).toBe("ghosted")
    expect(file.version).toBe(1)
    expect(file.exportedAt).toBe(new Date(T0 + DAY_MS).toISOString())
    expect(file.snapshot).toEqual(savedSnapshot(storage))
  })

  it("has nothing to back up before the first save", () => {
    expect(makeBackup(new FakeStorage(), new Date(T0))).toBeNull()
  })
})

describe("checkBackup and applyBackup", () => {
  it("round-trips: the backup checks out with its people count and restores the same snapshot", () => {
    const storage = savedStorage()
    const check = checkBackup(makeBackup(storage, new Date(T0))!)
    expect(check).toMatchObject({ ok: true, people: 2 })
    if (!check.ok) throw new Error("expected the backup to check out")

    const target = new FakeStorage({ other: "kept" })
    applyBackup(target, check.snapshot)
    expect(JSON.parse(target.getItem(ENGINE_STORAGE_KEY)!)).toEqual(savedSnapshot(storage))
    expect(target.getItem(STARTED_FLAG)).toBe("1")
    expect(target.getItem(OWN_PEOPLE_FLAG)).toBe("1")
    expect(target.getItem("other")).toBe("kept")
  })

  it("refuses text that is not JSON", () => {
    expect(checkBackup("not json")).toEqual({ ok: false, reason: backupRefusals.notJson })
  })

  it("refuses a backup from another app", () => {
    const text = JSON.stringify({ app: "study-dungeon", version: 1, exportedAt: "x", snapshot: {} })
    expect(checkBackup(text)).toEqual({ ok: false, reason: backupRefusals.otherApp })
  })

  it("refuses JSON that is not a Ghosted backup: no app, a non-object, or no snapshot", () => {
    for (const value of [{ version: 1, snapshot: {} }, [1, 2], null, 42, { app: "ghosted", version: 1 }]) {
      expect(checkBackup(JSON.stringify(value)), JSON.stringify(value)).toEqual({
        ok: false,
        reason: backupRefusals.notGhosted,
      })
    }
  })

  it("refuses a newer version, and a missing or non-numeric version", () => {
    const snapshot = savedSnapshot(savedStorage())
    for (const version of [2, undefined, "1"]) {
      expect(checkBackup(JSON.stringify({ app: "ghosted", version, snapshot })), String(version)).toEqual({
        ok: false,
        reason: backupRefusals.newerVersion,
      })
    }
  })

  it("refuses a snapshot the real engine cannot load", () => {
    expect(checkBackup(JSON.stringify({ app: "ghosted", version: 1, snapshot: { nonsense: true } }))).toEqual({
      ok: false,
      reason: backupRefusals.damaged,
    })
    // Shaped like a real snapshot, but one person's health is out of range:
    // only the engine's own validation catches this.
    const snapshot = savedSnapshot(savedStorage())
    snapshot.items[0].health = 500
    expect(checkBackup(JSON.stringify({ app: "ghosted", version: 1, snapshot }))).toEqual({
      ok: false,
      reason: backupRefusals.damaged,
    })
  })

  it("changes nothing when it refuses a file", () => {
    const storage = savedStorage()
    const before = storage.snapshot()
    const damaged = savedSnapshot(storage)
    damaged.items[0].health = 500
    const refused = [
      "not json",
      JSON.stringify({ app: "study-dungeon", version: 1, snapshot: {} }),
      JSON.stringify({ version: 1, snapshot: {} }),
      JSON.stringify({ app: "ghosted", version: 2, snapshot: {} }),
      JSON.stringify({ app: "ghosted", version: 1, snapshot: damaged }),
    ]
    for (const text of refused) {
      const check = checkBackup(text)
      expect(check.ok).toBe(false)
      expect(check).not.toHaveProperty("snapshot")
    }
    expect(storage.snapshot()).toEqual(before)
    expect(storage.removed).toEqual([])
  })
})
