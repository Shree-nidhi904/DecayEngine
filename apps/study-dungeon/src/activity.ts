// The profile's activity history (feedback list, point 17): the engine's history
// log as one plain sentence per entry, newest first. After a sync the engine's
// history holds every synced device's events (the sync merges the logs), so this
// list needs no table of its own. Pure: the names and the words come in.

import type { HistoryEntry } from "@decay-engine/engine"
import type { ReviewEvent } from "./policy"
import { activityText } from "./wording"

export interface ActivityRow {
  key: string
  at: number
  text: string
}

/** Rows shown at most. Older ones are counted, not listed. */
export const ACTIVITY_LIMIT = 50

export function activityRows(
  entries: readonly HistoryEntry[],
  nameOf: (itemId: string) => string | undefined,
  limit: number = ACTIVITY_LIMIT
): { rows: ActivityRow[]; hidden: number } {
  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp)
  const rows = sorted.slice(0, limit).map((e, index): ActivityRow => {
    const name = nameOf(e.itemId) ?? activityText.removedFact
    const text = (() => {
      switch (e.type) {
        case "created":
          return activityText.created(name)
        case "tended":
          return (e.event as ReviewEvent).correct === true ? activityText.right(name) : activityText.wrong(name)
        // A death has its own "died" entry, so a state change never goes to dead.
        case "state-changed":
          return e.to === "weak" ? activityText.woke(name) : activityText.slept(name)
        case "died":
          return activityText.died(name)
        case "resurrected":
          return activityText.resurrected(name)
        case "resurrect-failed":
          return activityText.resurrectFailed(name)
        case "edited":
          return activityText.edited(name)
      }
    })()
    return { key: `${e.type}|${e.itemId}|${e.timestamp}|${index}`, at: e.timestamp, text }
  })
  return { rows, hidden: Math.max(0, sorted.length - rows.length) }
}
