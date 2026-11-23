// The message for a tick's state changes (task L3, Requirement 23.3, design
// "Live State Changes"). Pure: it reads the changes from state-changes.ts,
// the facts' importance from the same engine view, and each creature's name
// through `nameOf` (the App passes creatureOf(id).name); no clock and no
// policy formula. The sentences themselves are liveText in wording.ts.
// Ghosted has the same rules in its own words (no import between apps).

import type { Fact } from "./policy"
import type { StateChange } from "./state-changes"
import { liveText, type LiveKind } from "./wording"

/** A tick's changes, ready for the toast, the cards and the tab title. */
export type LiveNotice = {
  /** The one sentence (Requirement 23.3). */
  text: string
  /** The reported changes, most important first. */
  changes: readonly StateChange[]
  /** "dead" when any reported fact died, else "weak": the favicon badge's shape (Requirement 23.7). */
  worst: "weak" | "dead"
}

/** Only the changes time can cause are reported: alive → weak, weak → dead, alive → dead. */
export function liveKind(change: StateChange): LiveKind | null {
  if (change.from === "alive" && change.to === "weak") return "wake"
  if (change.from === "weak" && change.to === "dead") return "die"
  if (change.from === "alive" && change.to === "dead") return "dieAsleep"
  return null
}

/**
 * The message for `changes`, or null when none is a reported kind (or the
 * fact is not in `facts`). The most important fact comes first: importance
 * 3 to 1, then a death before a weakening, then name, then id.
 */
export function liveNotice(
  changes: readonly StateChange[],
  facts: readonly Fact[],
  nameOf: (id: string) => string
): LiveNotice | null {
  const byId = new Map(facts.map((f) => [f.id, f] as const))
  const shown = changes.flatMap((change) => {
    const kind = liveKind(change)
    const fact = byId.get(change.id)
    return kind === null || fact === undefined ? [] : [{ change, kind, fact, name: nameOf(change.id) }]
  })
  if (shown.length === 0) return null
  shown.sort(
    (a, b) =>
      b.fact.importance - a.fact.importance ||
      Number(b.change.to === "dead") - Number(a.change.to === "dead") ||
      a.name.localeCompare(b.name, "en") ||
      (a.fact.id < b.fact.id ? -1 : a.fact.id > b.fact.id ? 1 : 0)
  )
  const first = shown[0]!
  let text: string
  if (shown.length === 1) {
    text = liveText.one(first.kind, first.name)
  } else if (shown.length === 2) {
    const second = shown[1]!
    text = liveText.two({ kind: first.kind, name: first.name }, { kind: second.kind, name: second.name })
  } else {
    const weakened = shown.filter((s) => s.kind === "wake").length
    text = liveText.many(weakened, shown.length - weakened, first.name)
  }
  return {
    text,
    changes: shown.map((s) => s.change),
    worst: shown.some((s) => s.change.to === "dead") ? "dead" : "weak",
  }
}
