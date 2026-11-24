// The time dock's timeline (visual pass, Pass 3): the days ahead on which a
// fact turns weak or dies if nobody reviews it. Pure: takes the facts as seen
// today and the engine's forecast of deaths; never reads the clock.
//
// Written by Claude Code (Opus 5.5), outside Kiro, at the developer's request; see .kiro/steering/authorship.md.

import { DAY_MS, type Fact } from "./policy"
import { activePolicy } from "./policy-select"
import { creatureOf } from "./creatures"

export type TimelineEvent = { day: number; id: string; name: string; kind: "weak" | "dead" }

/**
 * Weak crossings (alive facts, from policy.nextDueAt) and deaths (from
 * engine.forecast) within 1..maxDays days of today, soonest first; on the
 * same day, weakening comes before dying, then by name.
 */
export function timelineEvents(
  today: readonly Fact[],
  deaths: readonly { item: { id: string }; diesAt: number }[],
  realNow: number,
  maxDays: number
): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const dayOf = (ms: number) => Math.ceil((ms - realNow) / DAY_MS)
  for (const fact of today) {
    if (fact.state !== "alive") continue
    const at = activePolicy().nextDueAt(fact, realNow)
    if (at === null) continue
    const day = dayOf(at)
    if (day >= 1 && day <= maxDays) events.push({ day, id: fact.id, name: creatureOf(fact.id).name, kind: "weak" })
  }
  for (const death of deaths) {
    const day = dayOf(death.diesAt)
    if (day >= 1 && day <= maxDays) events.push({ day, id: death.item.id, name: creatureOf(death.item.id).name, kind: "dead" })
  }
  return events.sort(
    (a, b) => a.day - b.day || (a.kind === b.kind ? 0 : a.kind === "weak" ? -1 : 1) || a.name.localeCompare(b.name)
  )
}

/** The next few events after the day being shown. */
export function upcoming(events: readonly TimelineEvent[], shownDay: number, count = 3): TimelineEvent[] {
  return events.filter((e) => e.day > shownDay).slice(0, count)
}
