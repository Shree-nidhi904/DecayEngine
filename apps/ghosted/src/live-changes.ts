// The message for a tick's state changes (task L3, Req 38, design section
// 15.3). Pure: it reads the changes from state-changes.ts and the people's
// names and importance from the same engine view; no clock and no policy
// formula. The sentences themselves are liveText in wording.ts.

import type { Person } from "./policy"
import type { StateChange } from "./state-changes"
import { liveText, type LiveKind } from "./wording"

/** A tick's changes, ready for the toast, the cards and the tab title. */
export type LiveNotice = {
  /** The one sentence (Req 38.3). */
  text: string
  /** The reported changes, most important first. */
  changes: readonly StateChange[]
  /** "dead" when any reported window went dark, else "weak": the favicon badge's shape (Req 38.7). */
  worst: "weak" | "dead"
}

/** Only the changes time can cause are reported: alive → weak, weak → dead, alive → dead. */
export function liveKind(change: StateChange): LiveKind | null {
  if (change.from === "alive" && change.to === "weak") return "flicker"
  if (change.from === "weak" && change.to === "dead") return "dark"
  if (change.from === "alive" && change.to === "dead") return "darkFromLit"
  return null
}

/**
 * The message for `changes`, or null when none is a reported kind (or the
 * person is not in `people`). The most important person comes first:
 * importance 3 to 1, then a window that went dark before one that started
 * to flicker, then name, then id.
 */
export function liveNotice(changes: readonly StateChange[], people: readonly Person[]): LiveNotice | null {
  const byId = new Map(people.map((p) => [p.id, p] as const))
  const shown = changes.flatMap((change) => {
    const kind = liveKind(change)
    const person = byId.get(change.id)
    return kind === null || person === undefined ? [] : [{ change, kind, person }]
  })
  if (shown.length === 0) return null
  shown.sort(
    (a, b) =>
      b.person.importance - a.person.importance ||
      Number(b.change.to === "dead") - Number(a.change.to === "dead") ||
      a.person.payload.name.localeCompare(b.person.payload.name, "en") ||
      (a.person.id < b.person.id ? -1 : a.person.id > b.person.id ? 1 : 0)
  )
  const first = shown[0]!
  const name = (s: (typeof shown)[number]) => s.person.payload.name
  let text: string
  if (shown.length === 1) {
    text = liveText.one(first.kind, name(first))
  } else if (shown.length === 2) {
    const second = shown[1]!
    text = liveText.two({ kind: first.kind, name: name(first) }, { kind: second.kind, name: name(second) })
  } else {
    const flicker = shown.filter((s) => s.kind === "flicker").length
    text = liveText.many(flicker, shown.length - flicker, name(first))
  }
  return {
    text,
    changes: shown.map((s) => s.change),
    worst: shown.some((s) => s.change.to === "dead") ? "dead" : "weak",
  }
}
