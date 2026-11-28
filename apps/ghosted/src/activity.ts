// The activity history in the Profile (feedback list, points 17 and 21): one
// plain line per engine history entry, newest first. Sync merges the history
// logs of every device (packages/cloud merge.ts), so after a sync this holds
// the other devices' changes too. Pure: the caller passes the entries and `now`.
import type { HistoryEntry } from "@decay-engine/engine"
import type { ContactEvent } from "./policy"
import { activityText } from "./wording"

export type ActivityLine = { key: string; at: number; text: string }

/** At most this many lines are shown. */
export const MAX_ACTIVITY_LINES = 200

export function activityLines(
  entries: readonly HistoryEntry[],
  nameOf: (itemId: string) => string | undefined,
  now: number
): ActivityLine[] {
  const lines: ActivityLine[] = []
  for (const e of entries) {
    if (e.timestamp > now) continue
    const name = nameOf(e.itemId) ?? activityText.removedPerson
    let text: string | null = null
    switch (e.type) {
      case "created":
        text = activityText.created(name)
        break
      case "tended":
        text = activityText.contact(name, (e.event as ContactEvent | undefined)?.kind)
        break
      case "state-changed":
        // Going dark has its own "died" entry, so only flickering and lighting again are told here.
        text = e.to === "weak" ? activityText.flicker(name) : e.to === "alive" && e.from === "weak" ? activityText.lit(name) : null
        break
      case "died":
        text = activityText.dark(name)
        break
      case "resurrected":
        text = activityText.reconnected(name)
        break
      case "resurrect-failed":
        text = activityText.reconnectFailed(name)
        break
      case "edited":
        text = activityText.edited(name)
        break
    }
    if (text !== null) lines.push({ key: `${e.type}|${e.itemId}|${e.timestamp}`, at: e.timestamp, text })
  }
  lines.sort((a, b) => b.at - a.at)
  return lines.slice(0, MAX_ACTIVITY_LINES)
}
