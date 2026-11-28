import fc from "fast-check"
import { describe, expect, it } from "vitest"
import type { StoredSnapshot } from "@decay-engine/engine"
import { bumpRevision, readMeta } from "./meta"
import { PersistError, quarantineSnapshot, VersionedAdapter, type Migration } from "./index"
import { FakeStorage, snap } from "./test/fake-storage"

const KEY = "decay-engine:t"
const META = "decay-engine:t:meta"

function adapter(storage: FakeStorage, extra: object = {}) {
  let id = 0
  return new VersionedAdapter("t", { storage, now: () => 1000, makeId: () => `dev-${++id}`, ...extra })
}

describe("VersionedAdapter", () => {
  it("loads null when nothing is stored", () => {
    expect(adapter(new FakeStorage()).load()).toBeNull()
  })

  it("keeps the snapshot at the engine's key in the engine's format", () => {
    const s = new FakeStorage()
    const a = adapter(s)
    a.load()
    a.save(snap(1) as unknown as StoredSnapshot)
    expect(JSON.parse(s.data.get(KEY)!)).toEqual(snap(1))
  })

  it("roundtrips any JSON snapshot and bumps the revision on each save", () => {
    fc.assert(
      fc.property(fc.array(fc.jsonValue(), { maxLength: 4 }), (values) => {
        const s = new FakeStorage()
        const a = adapter(s)
        a.load()
        values.forEach((v, i) => {
          a.save({ schemaVersion: 1, items: [], history: [], v } as unknown as StoredSnapshot)
          expect(readMeta(s, "t").revision).toBe(i + 1)
        })
        if (values.length > 0) {
          const loaded = adapter(s).load() as unknown as { v: unknown }
          expect(loaded.v).toEqual(JSON.parse(JSON.stringify(values[values.length - 1])))
        }
      })
    )
  })

  it("treats data saved before this package (no meta) as version 0 and migrates it", () => {
    const s = new FakeStorage()
    s.data.set(KEY, JSON.stringify(snap(7)))
    const a = adapter(s)
    expect(a.load()).toEqual(snap(7))
    expect(readMeta(s, "t").appDataVersion).toBe(1)
    expect(s.data.get(`${KEY}:pre-migration-v0`)).toBe(JSON.stringify(snap(7)))
    // The migration write moved the revision on, and this tab knows it.
    expect(() => a.save(snap(8) as unknown as StoredSnapshot)).not.toThrow()
  })

  it("runs a multi-step chain in order", () => {
    const s = new FakeStorage()
    s.data.set(KEY, JSON.stringify(snap(0)))
    const step = (from: number): Migration => ({
      from,
      to: from + 1,
      migrate: (x) => ({ ...x, n: ((x as unknown as { n: number }).n ?? 0) * 10 + from }) as unknown as StoredSnapshot,
    })
    const loaded = adapter(s, { targetVersion: 3, migrations: [step(0), step(1), step(2)] }).load()
    // 0 -> 0*10+0=0 -> 0*10+1=1 -> 1*10+2=12
    expect((loaded as unknown as { n: number }).n).toBe(12)
    expect(readMeta(s, "t").appDataVersion).toBe(3)
  })

  it("refuses data from a newer app and leaves it untouched", () => {
    const s = new FakeStorage()
    s.data.set(KEY, JSON.stringify(snap(1)))
    s.data.set(META, JSON.stringify({ appDataVersion: 9, revision: 4, updatedAt: 1, deviceId: "x" }))
    const before = new Map(s.data)
    expect(() => adapter(s).load()).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_APP_DATA_VERSION" }))
    expect(s.data).toEqual(before)
  })

  it("reports a broken migration list as MIGRATION_FAILED", () => {
    const s = new FakeStorage()
    s.data.set(KEY, JSON.stringify(snap(1)))
    expect(() => adapter(s, { targetVersion: 2, migrations: [] }).load()).toThrowError(
      expect.objectContaining({ code: "MIGRATION_FAILED" })
    )
  })

  it("still loads when the migrated copy cannot be written back", () => {
    const s = new FakeStorage()
    s.data.set(KEY, JSON.stringify(snap(3)))
    s.failWritesTo = `${KEY}:pre-migration-v0`
    expect(adapter(s).load()).toEqual(snap(3))
  })

  it("passes SyntaxError from bad JSON through", () => {
    const s = new FakeStorage()
    s.data.set(KEY, "{nope")
    expect(() => adapter(s).load()).toThrow(SyntaxError)
  })

  describe("write guard", () => {
    it("rejects a save from a tab whose data went stale, and keeps the other tab's data", () => {
      const s = new FakeStorage()
      const a = adapter(s)
      const b = adapter(s)
      a.load()
      b.load()
      a.save(snap(1) as unknown as StoredSnapshot)
      expect(() => b.save(snap(2) as unknown as StoredSnapshot)).toThrowError(
        expect.objectContaining({ name: "PersistError", code: "STALE_WRITE" })
      )
      expect(JSON.parse(s.data.get(KEY)!)).toEqual(snap(1))
    })

    it("lets a tab keep saving when only it writes", () => {
      const s = new FakeStorage()
      const a = adapter(s)
      a.load()
      for (let i = 0; i < 3; i++) a.save(snap(i) as unknown as StoredSnapshot)
      expect(readMeta(s, "t").revision).toBe(3)
    })

    it("accepts a save after reloading the newer data", () => {
      const s = new FakeStorage()
      const a = adapter(s)
      const b = adapter(s)
      a.load()
      b.load()
      a.save(snap(1) as unknown as StoredSnapshot)
      b.load()
      expect(() => b.save(snap(2) as unknown as StoredSnapshot)).not.toThrow()
    })

    it("treats a restore (bumpRevision) as a change the other tab must reload for", () => {
      const s = new FakeStorage()
      const a = adapter(s)
      a.load()
      a.save(snap(1) as unknown as StoredSnapshot)
      bumpRevision(s, "t", 5)
      expect(() => a.save(snap(2) as unknown as StoredSnapshot)).toThrow(PersistError)
    })

    it("restores the previous meta when the snapshot write fails (quota)", () => {
      const s = new FakeStorage()
      const a = adapter(s)
      a.load()
      a.save(snap(1) as unknown as StoredSnapshot)
      s.failWritesTo = KEY
      expect(() => a.save(snap(2) as unknown as StoredSnapshot)).toThrowError(
        expect.objectContaining({ name: "QuotaExceededError" })
      )
      expect(readMeta(s, "t").revision).toBe(1)
      s.failWritesTo = null
      expect(() => a.save(snap(3) as unknown as StoredSnapshot)).not.toThrow()
      expect(JSON.parse(s.data.get(KEY)!)).toEqual(snap(3))
    })

    it("treats a wiped store (reset in another tab) as stale", () => {
      const s = new FakeStorage()
      const a = adapter(s)
      a.load()
      a.save(snap(1) as unknown as StoredSnapshot)
      s.data.clear()
      expect(() => a.save(snap(2) as unknown as StoredSnapshot)).toThrowError(
        expect.objectContaining({ code: "STALE_WRITE" })
      )
    })
  })

  it("uses one device id per storage", () => {
    const s = new FakeStorage()
    const a = adapter(s)
    a.load()
    a.save(snap(1) as unknown as StoredSnapshot)
    const first = readMeta(s, "t").deviceId
    a.save(snap(2) as unknown as StoredSnapshot)
    expect(readMeta(s, "t").deviceId).toBe(first)
  })
})

describe("quarantineSnapshot", () => {
  it("copies the stored text under a timestamped key", () => {
    const s = new FakeStorage()
    s.data.set(KEY, "garbage")
    expect(quarantineSnapshot(s, "t", 42)).toBe(`${KEY}:corrupt-42`)
    expect(s.data.get(`${KEY}:corrupt-42`)).toBe("garbage")
  })

  it("returns null when nothing is stored or the copy fails, and never throws", () => {
    const s = new FakeStorage()
    expect(quarantineSnapshot(s, "t", 1)).toBeNull()
    s.data.set(KEY, "x")
    s.failWritesTo = `${KEY}:corrupt-2`
    expect(quarantineSnapshot(s, "t", 2)).toBeNull()
  })
})
