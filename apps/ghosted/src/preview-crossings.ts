// While the time machine looks ahead, which people get worse between the
// real time and the previewed time: "dies" (not boarded up today, boarded up
// then) or "fades" (lit today, flickering then). The App marks their windows
// with data-crossed, and motion.css plays the moment once. Pure: the App
// passes engine.view(realNow) and engine.view(now). Study Dungeon has its own
// copy (no import between apps, Req 21.1).

import type { StateOf } from "./state-changes"

export type Crossing = "fades" | "dies"

/** The people who cross between `before` and `after`, by id. Ids in only one view are skipped. */
export function previewCrossings(before: Iterable<StateOf>, after: Iterable<StateOf>): Map<string, Crossing> {
  const was = new Map<string, StateOf["state"]>()
  for (const item of before) was.set(item.id, item.state)
  const crossed = new Map<string, Crossing>()
  for (const item of after) {
    const from = was.get(item.id)
    if (from === undefined) continue
    if (from !== "dead" && item.state === "dead") crossed.set(item.id, "dies")
    else if (from === "alive" && item.state === "weak") crossed.set(item.id, "fades")
  }
  return crossed
}

/** How many of the crossings are deaths. */
export function countDeaths(crossed: ReadonlyMap<string, Crossing>): number {
  let n = 0
  for (const kind of crossed.values()) if (kind === "dies") n++
  return n
}
