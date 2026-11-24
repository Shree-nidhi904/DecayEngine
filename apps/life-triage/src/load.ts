// Loads the two apps' backup files into real engines and builds sample data.
// The policies come from the apps themselves (relative imports on purpose: Life
// Triage reads the apps' own rules, it does not copy them).

import { DecayEngine, InMemoryAdapter } from "@decay-engine/engine"
import type { Source } from "@decay-engine/life-triage"
import { studyDungeonPolicy, type FactPayload, type FactPolicyData, type ReviewEvent } from "../../study-dungeon/src/policy"
import { ghostedPolicy, type ContactEvent, type PersonPayload, type PersonPolicyData } from "../../ghosted/src/policy"

export const FACTS = "Study Dungeon"
export const FRIENDS = "Ghosted"
const DAY = 86_400_000

type Loaded = { ok: true; label: string; engine: Source["engine"]; count: number } | { ok: false; reason: string }

/** Reads one backup file's text. Which app it is comes from the file itself. */
export function loadBackup(text: string): Loaded {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, reason: "This file is not JSON." }
  }
  const b = data as { app?: unknown; version?: unknown; snapshot?: unknown } | null
  if (b === null || typeof b !== "object" || b.snapshot === undefined) return { ok: false, reason: "This is not a Study Dungeon or Ghosted backup." }
  if (typeof b.version !== "number" || b.version > 1) return { ok: false, reason: "This backup is from a newer version." }
  const adapter = { load: () => JSON.parse(JSON.stringify(b.snapshot)), save: () => {} }
  try {
    if (b.app === "study-dungeon") {
      const e = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(studyDungeonPolicy, adapter, () => "unused")
      return { ok: true, label: FACTS, engine: e, count: e.view(Date.UTC(2000, 0, 1)).length }
    }
    if (b.app === "ghosted") {
      const e = new DecayEngine<PersonPayload, PersonPolicyData, ContactEvent>(ghostedPolicy, adapter, () => "unused")
      return { ok: true, label: FRIENDS, engine: e, count: e.view(Date.UTC(2000, 0, 1)).length }
    }
    return { ok: false, reason: "This is not a Study Dungeon or Ghosted backup." }
  } catch {
    return { ok: false, reason: "This backup is damaged and cannot be loaded." }
  }
}

/** Sample facts and people, created in the past so some are weak at `now`. */
export function sampleSources(now: number): Source[] {
  let f = 0
  const facts = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(studyDungeonPolicy, new InMemoryAdapter(), () => `fact-${++f}`)
  const addFact = (question: string, answer: string, ageDays: number, importance: number, cost: number, knowledge: FactPayload["knowledge"]) =>
    facts.addItem({ payload: { question, answer, why: "", knowledge }, importance, costMinutes: cost }, now - ageDays * DAY)
  addFact("Capital of Australia?", "Canberra", 9, 3, 5, "shaky")
  addFact("Year the Berlin Wall fell?", "1989", 12, 2, 5, "shaky")
  addFact("Derivative of ln x?", "1/x", 6, 3, 10, "new")
  addFact("Symbol for gold?", "Au", 20, 1, 5, "shaky")
  addFact("Largest planet?", "Jupiter", 4, 1, 5, "new")

  let p = 0
  const people = new DecayEngine<PersonPayload, PersonPolicyData, ContactEvent>(ghostedPolicy, new InMemoryAdapter(), () => `person-${++p}`)
  const addPerson = (name: string, relationship: string, rhythmDays: number, lastDaysAgo: number, importance: number, cost: number) =>
    people.addItem(
      { payload: { name, relationship, rhythmDays, lastContactAt: now - lastDaysAgo * DAY }, importance, costMinutes: cost },
      now - lastDaysAgo * DAY
    )
  addPerson("Maya", "sister", 14, 23, 3, 30)
  addPerson("Dev", "old roommate", 30, 41, 2, 30)
  addPerson("Priya", "mentor", 45, 38, 3, 15)
  addPerson("Sam", "neighbour", 30, 26, 1, 15)
  return [
    { label: FACTS, engine: facts },
    { label: FRIENDS, engine: people },
  ]
}
