// Back up and restore (backup.ts): a real engine on a LocalStorage-shaped
// fake, so the snapshot is the one the app really saves.
// Written by Claude Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import { describe, expect, it } from "vitest"
import { DecayEngine } from "@decay-engine/engine"
import { applyBackup, checkBackup, makeBackup } from "./backup"
import { ENGINE_STORAGE_KEY, STARTED_FLAG } from "./first-run"
import { studyDungeonPolicy, type FactPayload, type FactPolicyData, type ReviewEvent } from "./policy"
import { day } from "./test/fixtures"

class MapStorage {
  map = new Map<string, string>()
  getItem = (k: string) => this.map.get(k) ?? null
  setItem = (k: string, v: string) => void this.map.set(k, v)
  removeItem = (k: string) => void this.map.delete(k)
}

/** Two facts saved the way the app saves them. */
function savedStorage() {
  const storage = new MapStorage()
  let n = 0
  const engine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(
    studyDungeonPolicy,
    { load: () => null, save: (s) => storage.setItem(ENGINE_STORAGE_KEY, JSON.stringify(s)) },
    () => `id-${n++}`
  )
  for (const q of ["One?", "Two?"]) {
    engine.addItem({ payload: { question: q, answer: "A", why: "", knowledge: "new" }, importance: 2, costMinutes: 2 }, day(0))
  }
  return storage
}

describe("backup", () => {
  it("round-trips: a backup checks out with its fact count and restores the same snapshot", () => {
    const storage = savedStorage()
    const text = makeBackup(storage, new Date(day(1)))!
    const check = checkBackup(text)
    expect(check).toMatchObject({ ok: true, facts: 2 })
    const target = new MapStorage()
    applyBackup(target, (check as { snapshot: unknown }).snapshot)
    expect(JSON.parse(target.getItem(ENGINE_STORAGE_KEY)!)).toEqual(JSON.parse(storage.getItem(ENGINE_STORAGE_KEY)!))
    expect(target.getItem(STARTED_FLAG)).toBe("1")
  })

  it("has nothing to back up before the first save", () => {
    expect(makeBackup(new MapStorage(), new Date(day(1)))).toBeNull()
  })

  it("refuses files that are not backups, from a newer version, or damaged", () => {
    expect(checkBackup("not json")).toMatchObject({ ok: false })
    expect(checkBackup(JSON.stringify({ app: "other", version: 1, snapshot: {} }))).toMatchObject({ ok: false })
    expect(checkBackup(JSON.stringify({ app: "study-dungeon", version: 99, snapshot: {} }))).toMatchObject({
      ok: false,
      reason: "This backup is from a newer version of the app.",
    })
    expect(checkBackup(JSON.stringify({ app: "study-dungeon", version: 1, snapshot: { nonsense: true } }))).toMatchObject({
      ok: false,
      reason: "This backup is damaged and cannot be loaded.",
    })
  })
})
