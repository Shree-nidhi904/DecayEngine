// Feedback list, point 17: the Profile's activity history. Fixed times (T0 plus days), never the clock.
import { describe, expect, it } from "vitest"
import type { HistoryEntry } from "@decay-engine/engine"
import { MAX_ACTIVITY_LINES, activityLines } from "./activity"

const T0 = Date.UTC(2026, 10, 1)
const DAY = 86_400_000
const names: Record<string, string> = { m: "Mira Castell", d: "Dan Okafor" }
const nameOf = (id: string) => names[id]

/** Words Ghosted never uses about a person (ghosted.md). */
const NOT_FOR_PEOPLE = /\bdie\b|\bdies\b|\bdied\b|\bdead\b|doesn't care|ignored you|ghosted you/i

const entries: HistoryEntry[] = [
  { type: "created", itemId: "m", timestamp: T0, health: 100 },
  { type: "tended", itemId: "m", timestamp: T0 + DAY, health: 100, event: { kind: "call" } },
  { type: "tended", itemId: "m", timestamp: T0 + 2 * DAY, health: 100, event: { kind: "text" } },
  { type: "tended", itemId: "m", timestamp: T0 + 3 * DAY, health: 100, event: { kind: "meetup" } },
  { type: "state-changed", itemId: "d", timestamp: T0 + 4 * DAY, health: 59, from: "alive", to: "weak" },
  { type: "state-changed", itemId: "d", timestamp: T0 + 5 * DAY, health: 9, from: "weak", to: "dead" },
  { type: "died", itemId: "d", timestamp: T0 + 5 * DAY, health: 9 },
  { type: "resurrected", itemId: "d", timestamp: T0 + 6 * DAY, health: 100, event: { kind: "call" } },
  { type: "edited", itemId: "gone", timestamp: T0 + 7 * DAY, health: 80, fieldsChanged: ["name"] },
]

describe("activityLines", () => {
  it("tells each change in plain words, newest first", () => {
    expect(activityLines(entries, nameOf, T0 + 10 * DAY).map((l) => l.text)).toEqual([
      "Edited someone since removed",
      "Reconnected with Dan Okafor",
      "Dan Okafor's window went dark",
      "Dan Okafor's window started to flicker",
      "Met up with Mira Castell",
      "Sent Mira Castell a message",
      "Had a call with Mira Castell",
      "Added Mira Castell",
    ])
  })

  it("never says a person died", () => {
    for (const line of activityLines(entries, nameOf, T0 + 10 * DAY)) expect(line.text).not.toMatch(NOT_FOR_PEOPLE)
  })

  it("leaves out anything after now", () => {
    expect(activityLines(entries, nameOf, T0 + DAY).map((l) => l.at)).toEqual([T0 + DAY, T0])
  })

  it("keeps at most the newest 200 lines", () => {
    const many: HistoryEntry[] = Array.from({ length: 250 }, (_, i) => ({
      type: "created" as const,
      itemId: "m",
      timestamp: T0 + i,
      health: 100,
    }))
    const lines = activityLines(many, nameOf, T0 + DAY)
    expect(lines).toHaveLength(MAX_ACTIVITY_LINES)
    expect(lines[0]!.at).toBe(T0 + 249)
  })
})
