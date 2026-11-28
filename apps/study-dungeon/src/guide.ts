// Picks the Keeper's line from keeperText (wording.ts). The pool depends on
// what the dungeon looks like at the time shown, whether the time machine is
// looking ahead and whether a fact died in the preview; the rotation (the
// real day number) picks one line, so it holds still for a day.

import type { DoomBand } from "./doom"
import { DAY_MS } from "./policy"
import { keeperText } from "./wording"

export type KeeperCase = "empty" | "weak" | "graveyard" | "asleep"

export interface KeeperContext {
  keeperCase: KeeperCase
  previewing: boolean
  band: DoomBand
  dies: number
  rotation: number
}

export function keeperCaseOf(counts: { alive: number; weak: number; dead: number }): KeeperCase {
  if (counts.alive + counts.weak + counts.dead === 0) return "empty"
  if (counts.weak > 0) return "weak"
  if (counts.dead > 0) return "graveyard"
  return "asleep"
}

export function guideRotation(realNow: number): number {
  return Math.floor(realNow / DAY_MS)
}

export function keeperPool(ctx: KeeperContext): readonly string[] {
  if (ctx.keeperCase === "empty") return keeperText.empty
  if (ctx.previewing) {
    if (ctx.dies > 0) return keeperText.previewDeath
    return ctx.band === "calm" ? keeperText.previewCalm : keeperText.previewUneasy
  }
  if (ctx.keeperCase === "weak") return ctx.band === "grim" ? keeperText.grim : keeperText.weak
  if (ctx.keeperCase === "graveyard") return keeperText.graveyard
  return keeperText.asleep
}

export function keeperLine(ctx: KeeperContext): string {
  const pool = keeperPool(ctx)
  return pool[((ctx.rotation % pool.length) + pool.length) % pool.length]!
}
