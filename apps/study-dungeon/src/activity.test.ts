import { describe, expect, it } from "vitest"
import type { HistoryEntry } from "@decay-engine/engine"
import { ACTIVITY_LIMIT, activityRows } from "./activity"
import { activityText } from "./wording"

const names: Record<string, string> = { a: "Capital of Peru", b: "2 + 2" }
const nameOf = (id: string) => names[id]

const entries: HistoryEntry[] = [
  { type: "created", itemId: "a", timestamp: 100, health: 100 },
  { type: "tended", itemId: "a", timestamp: 300, health: 100, event: { correct: true } },
  { type: "tended", itemId: "b", timestamp: 200, health: 40, event: { correct: false } },
  { type: "state-changed", itemId: "b", timestamp: 250, health: 55, from: "alive", to: "weak" },
  { type: "died", itemId: "b", timestamp: 400, health: 5 },
  { type: "resurrect-failed", itemId: "b", timestamp: 500, health: 5, event: { correct: false }, reason: "x" },
  { type: "resurrected", itemId: "b", timestamp: 600, health: 50, event: { correct: true } },
  { type: "edited", itemId: "a", timestamp: 700, health: 90, fieldsChanged: ["answer"] },
]

describe("activityRows", () => {
  it("writes one plain sentence per entry type, newest first", () => {
    const { rows, hidden } = activityRows(entries, nameOf)
    expect(hidden).toBe(0)
    expect(rows.map((r) => r.text)).toEqual([
      "Edited “Capital of Peru”",
      "Brought “2 + 2” back from the Graveyard",
      "A challenge to bring “2 + 2” back failed",
      "“2 + 2” died and went to the Graveyard",
      "Fought “Capital of Peru”: right answer",
      "“2 + 2” woke in the Dungeon",
      "Fought “2 + 2”: wrong answer",
      "Added “Capital of Peru”",
    ])
    expect(rows.map((r) => r.at)).toEqual([700, 600, 500, 400, 300, 250, 200, 100])
  })

  it("a fact that recovers goes back to sleep in the Crypt", () => {
    const { rows } = activityRows([{ type: "state-changed", itemId: "a", timestamp: 2, health: 100, from: "weak", to: "alive" }], nameOf)
    expect(rows[0]!.text).toBe("“Capital of Peru” went back to sleep in the Crypt")
  })

  it("names an item the device no longer holds without breaking", () => {
    const { rows } = activityRows([{ type: "died", itemId: "gone", timestamp: 1, health: 0 }], nameOf)
    expect(rows[0]!.text).toBe(activityText.died(activityText.removedFact))
  })

  it("lists at most the limit and counts the older ones", () => {
    const many: HistoryEntry[] = Array.from({ length: ACTIVITY_LIMIT + 7 }, (_, i) => ({
      type: "created",
      itemId: "a",
      timestamp: i,
      health: 100,
    }))
    const { rows, hidden } = activityRows(many, nameOf)
    expect(rows).toHaveLength(ACTIVITY_LIMIT)
    expect(hidden).toBe(7)
    expect(rows[0]!.at).toBe(ACTIVITY_LIMIT + 6)
  })

  it("keeps every entry when two events share a time (unique keys)", () => {
    const same: HistoryEntry[] = [
      { type: "created", itemId: "a", timestamp: 5, health: 100 },
      { type: "created", itemId: "a", timestamp: 5, health: 100 },
    ]
    expect(new Set(activityRows(same, nameOf).rows.map((r) => r.key)).size).toBe(2)
  })
})
