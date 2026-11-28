// Picks Wisp's line from wispText (wording.ts). The pool depends on the
// hero's case, whether the time machine is looking ahead, the doom band and
// whether anyone went dark in the preview; the rotation (the real day number)
// picks a line from the pool, so the line holds still for a day.

import type { DoomBand } from "./doom"
import { DAY_MS } from "./time"
import { wispText } from "./wording"

export type GuideCase = "first-run" | "empty" | "fading" | "dark" | "lit"

export interface GuideContext {
  heroCase: GuideCase
  previewing: boolean
  band: DoomBand
  /** Deaths among the preview crossings. */
  dies: number
  /** Math.floor(realNow / DAY_MS). */
  rotation: number
}

export function guideRotation(realNow: number): number {
  return Math.floor(realNow / DAY_MS)
}

export function guidePool(ctx: GuideContext): readonly string[] {
  if (ctx.heroCase === "first-run") return wispText.firstRun
  if (ctx.heroCase === "empty") return wispText.empty
  if (ctx.previewing) {
    if (ctx.dies > 0) return wispText.previewDark
    return ctx.band === "calm" ? wispText.previewCalm : wispText.previewUneasy
  }
  if (ctx.heroCase === "fading") return ctx.band === "grim" ? wispText.grim : wispText.fading
  if (ctx.heroCase === "dark") return wispText.dark
  return wispText.lit
}

export function guideLine(ctx: GuideContext): string {
  const pool = guidePool(ctx)
  const i = ((ctx.rotation % pool.length) + pool.length) % pool.length
  return pool[i]!
}
