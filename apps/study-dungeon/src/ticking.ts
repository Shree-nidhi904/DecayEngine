// Periodic settling: calls engine.tick so deaths and weak crossings are saved
// with their bisected times, keeping history and Autopsy complete.
// Source of truth: .kiro/specs/study-dungeon/design.md (Application Lifecycle,
// step 2): tick on load and every minute while not previewing; never tick
// while previewing.

import { useEffect, useRef } from "react"

export const TICK_INTERVAL_MS = 60_000

/** Anything with a tick method; the real DecayEngine fits. */
export type Tickable = { tick(now: number): number }

/** The timer functions startTicking needs. Tests pass a fake one. */
export type Scheduler = {
  setInterval(callback: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
}

const globalScheduler: Scheduler = {
  setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
  clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
}

/**
 * Ticks the engine once now, then every intervalMs. Returns a function that
 * stops the interval. Tick errors (for example storage quota) propagate; a
 * later task adds "Storage full" handling.
 *
 * @param onTick - Called after each tick with the time used, so the caller can refresh.
 */
export function startTicking(
  engine: Tickable,
  getNow: () => number,
  schedule: Scheduler = globalScheduler,
  intervalMs: number = TICK_INTERVAL_MS,
  onTick?: (now: number) => void
): () => void {
  const runTick = () => {
    const now = getNow()
    engine.tick(now)
    onTick?.(now)
  }
  runTick()
  const handle = schedule.setInterval(runTick, intervalMs)
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    schedule.clearInterval(handle)
  }
}

/**
 * Ticks the engine on mount and every minute while `previewing` is false.
 * While previewing it does nothing, and turning preview on stops the interval.
 * The app reads the clock here (Date.now); only the engine may not.
 */
export function useSettleTicks(
  engine: Tickable,
  previewing: boolean,
  onTick?: (now: number) => void
): void {
  // Keep the latest callback without restarting the interval on every render.
  const onTickRef = useRef(onTick)
  onTickRef.current = onTick

  useEffect(() => {
    if (previewing) return
    return startTicking(engine, Date.now, globalScheduler, TICK_INTERVAL_MS, (now) =>
      onTickRef.current?.(now)
    )
  }, [engine, previewing])
}
