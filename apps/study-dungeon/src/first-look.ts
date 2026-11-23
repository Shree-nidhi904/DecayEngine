// The first ten seconds (task L6, Requirement 25, design "The First Ten
// Seconds"). Pure. The same logic as Ghosted's file, with this app's key; no
// import between apps.
//
// The plan gives the preview offset for each moment of the first look: from
// today to +30 days in 4 s with an ease-in-out, a 1 s hold, then today. The
// whole run is one run of the shell's Play (TIME_MACHINE_PLAY_MS), whose
// frames drive it. The flag remembers, in the App's storage, that the first
// look has started once in this browser.

import { TIME_MACHINE_PLAY_MS, TIME_MACHINE_STEP_MS } from "@decay-engine/shell"
import type { FlagStorage } from "./first-run"
import { DAY_MS } from "./policy"

/** Set when the first look starts (or would start, under reduced motion). Not in RESET_KEYS. */
export const FIRST_LOOK_FLAG = "study-dungeon:first-look"

/** How far the first look goes. */
export const FIRST_LOOK_DAYS = 30

/** The whole first look: one run of the shell's Play (5 000 ms). */
export const FIRST_LOOK_TOTAL_MS = TIME_MACHINE_PLAY_MS

/** The way out, from today to +30 days. */
export const FIRST_LOOK_OUT_MS = 4_000

/** The hold at +30 days, before today again. */
export const FIRST_LOOK_HOLD_MS = FIRST_LOOK_TOTAL_MS - FIRST_LOOK_OUT_MS

const SPAN_MS = FIRST_LOOK_DAYS * DAY_MS

/** Ease in and out (cubic), for t from 0 to 1; clamped outside it. */
export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

/** The offset, in ms, `elapsedMs` after the first look started. 0 before it and from its end on. */
export function firstLookOffsetAt(elapsedMs: number): number {
  if (!(elapsedMs > 0 && elapsedMs < FIRST_LOOK_TOTAL_MS)) return 0
  if (elapsedMs >= FIRST_LOOK_OUT_MS) return SPAN_MS
  const raw = easeInOutCubic(elapsedMs / FIRST_LOOK_OUT_MS) * SPAN_MS
  return Math.round(raw / TIME_MACHINE_STEP_MS) * TIME_MACHINE_STEP_MS
}

/** The offset for a Play frame's progress (0 to 1, elapsed time over FIRST_LOOK_TOTAL_MS). */
export function firstLookOffsetForProgress(progress: number): number {
  return firstLookOffsetAt(progress * FIRST_LOOK_TOTAL_MS)
}

/** Whether the first look has started before in this browser. A storage that throws counts as yes. */
export function firstLookSeen(storage: FlagStorage): boolean {
  try {
    return storage.getItem(FIRST_LOOK_FLAG) !== null
  } catch {
    return true
  }
}

/** Sets the flag. False when the storage threw, so the first look does not play (Requirement 25.2). */
export function markFirstLookSeen(storage: FlagStorage): boolean {
  try {
    storage.setItem(FIRST_LOOK_FLAG, "1")
    return true
  } catch {
    return false
  }
}
