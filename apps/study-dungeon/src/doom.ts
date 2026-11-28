//
// How bad the dungeon looks at the time shown, from 0 (every fact asleep) to 1
// (every fact in the Graveyard): (weak + 2 × dead) / (2 × total). The App sets it
// as --doom on .sd-world, and the scenery reads it (vignette, fog, torches).
// It never changes a text colour, so contrast holds at every value.

import type { StateOf } from "./state-changes"

export type DoomBand = "calm" | "uneasy" | "grim"

export function doom(items: Iterable<Pick<StateOf, "state">>): number {
  let total = 0
  let score = 0
  for (const item of items) {
    total++
    if (item.state === "weak") score += 1
    else if (item.state === "dead") score += 2
  }
  return total === 0 ? 0 : score / (2 * total)
}

export function doomBand(value: number): DoomBand {
  if (value < 0.2) return "calm"
  if (value < 0.5) return "uneasy"
  return "grim"
}
