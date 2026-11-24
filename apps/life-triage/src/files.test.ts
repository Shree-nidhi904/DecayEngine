// Extensions spec, tasks 4.4 and 4.5 (Requirements 10.2 to 10.4 and 10.8).
// Backups are built the way the apps build them: a real engine saves its
// snapshot, and the file is { app, version, exportedAt, snapshot }. Fixed
// times, never the clock.

import { describe, expect, it } from "vitest"
import { DecayEngine, type StorageAdapter } from "@decay-engine/engine"
import { studyDungeonPolicy, type FactPayload, type FactPolicyData, type ReviewEvent } from "../../study-dungeon/src/policy"
import { ghostedPolicy, type ContactEvent, type PersonPayload, type PersonPolicyData } from "../../ghosted/src/policy"
import { readBackupFiles, type FileLike } from "./files"
import { FACTS, FRIENDS, loadBackup } from "./load"

const DAY = 86_400_000
const T0 = Date.UTC(2026, 9, 1)

/** An adapter that keeps the last saved snapshot, as the apps' storage does. */
function capture() {
  let saved: unknown = null
  const adapter: StorageAdapter = {
    load: () => null,
    save: (snapshot) => {
      saved = JSON.parse(JSON.stringify(snapshot))
    },
  }
  return { adapter, saved: () => saved }
}

function factsBackup(count: number): string {
  const c = capture()
  let n = 0
  const e = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(studyDungeonPolicy, c.adapter, () => `f${++n}`)
  for (let i = 0; i < count; i++) {
    e.addItem({ payload: { question: `Q${i}?`, answer: `A${i}`, why: "", knowledge: "shaky" }, importance: 2, costMinutes: 2 }, T0)
  }
  return JSON.stringify({ app: "study-dungeon", version: 1, exportedAt: "2026-10-01T00:00:00.000Z", snapshot: c.saved() })
}

function peopleBackup(names: string[]): string {
  const c = capture()
  let n = 0
  const e = new DecayEngine<PersonPayload, PersonPolicyData, ContactEvent>(ghostedPolicy, c.adapter, () => `p${++n}`)
  for (const name of names) {
    e.addItem({ payload: { name, relationship: "friend", rhythmDays: 14, lastContactAt: T0 - 3 * DAY }, importance: 2, costMinutes: 15 }, T0 - 3 * DAY)
  }
  return JSON.stringify({ app: "ghosted", version: 1, exportedAt: "2026-10-01T00:00:00.000Z", snapshot: c.saved() })
}

const file = (name: string, text: string): FileLike => ({ name, text: () => Promise.resolve(text) })
const unreadable = (name: string): FileLike => ({ name, text: () => Promise.reject(new Error("NotReadableError")) })

describe("loadBackup with real backups", () => {
  it("reads a Study Dungeon backup with its label and count", () => {
    const r = loadBackup(factsBackup(2))
    expect(r.ok && { label: r.label, count: r.count }).toEqual({ label: FACTS, count: 2 })
  })
  it("reads a Ghosted backup with its label and count", () => {
    const r = loadBackup(peopleBackup(["Ines", "Tomas", "Wren"]))
    expect(r.ok && { label: r.label, count: r.count }).toEqual({ label: FRIENDS, count: 3 })
  })
})

describe("readBackupFiles", () => {
  it("loads both apps' files and lists each one", async () => {
    const r = await readBackupFiles([file("facts.json", factsBackup(2)), file("people.json", peopleBackup(["Ines"]))], [])
    expect(r.sources.map((s) => s.label)).toEqual([FACTS, FRIENDS])
    expect(r.notes).toEqual(["facts.json: Study Dungeon, 2 items", "people.json: Ghosted, 1 item"])
  })

  it("a file that cannot be read is listed with a reason, and the other files still load", async () => {
    const r = await readBackupFiles([unreadable("broken.json"), file("people.json", peopleBackup(["Ines"]))], [])
    expect(r.notes).toEqual(["broken.json: this file could not be read.", "people.json: Ghosted, 1 item"])
    expect(r.sources.map((s) => s.label)).toEqual([FRIENDS])
  })

  it("a second file for the same app replaces the first, and says so", async () => {
    const first = await readBackupFiles([file("old.json", peopleBackup(["Ines"]))], [])
    const second = await readBackupFiles([file("new.json", peopleBackup(["Ines", "Tomas"]))], first.sources)
    expect(second.notes).toEqual(["new.json: Ghosted, 2 items (replaces the earlier file)"])
    expect(second.sources.length).toBe(1)
    expect(second.sources[0]!.engine).not.toBe(first.sources[0]!.engine)
  })

  it("a refused file is listed with the reason and changes nothing", async () => {
    const before = await readBackupFiles([file("facts.json", factsBackup(1))], [])
    const r = await readBackupFiles([file("notes.txt", "hello")], before.sources)
    expect(r.notes).toEqual(["notes.txt: This file is not JSON."])
    expect(r.sources).toEqual(before.sources)
  })
})
