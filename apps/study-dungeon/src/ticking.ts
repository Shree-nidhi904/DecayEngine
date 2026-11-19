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
 * stops the interval.
 *
 * @param onTick - Called after each tick with the time used, so the caller can refresh.
 *   Also called after a tick whose save failed and was handled by onError: reads
 *   settle in memory, so the screen should still move on.
 * @param onError - Given any error a tick throws (for example a full storage
 *   quota when a death is saved). Without it, tick errors propagate.
 */
export function startTicking(
  engine: Tickable,
  getNow: () => number,
  schedule: Scheduler = globalScheduler,
  intervalMs: number = TICK_INTERVAL_MS,
  onTick?: (now: number) => void,
  onError?: (error: unknown, now: number) => void
): () => void {
  const runTick = () => {
    const now = getNow()
    try {
      engine.tick(now)
    } catch (error) {
      if (onError === undefined) throw error
      onError(error, now)
    }
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

/** What useSettleTicks reads the time and schedules with. Tests pass fakes. */
export type SettleTickOptions = {
  /** Defaults to Date.now. */
  getNow?: () => number
  /** Defaults to the global setInterval and clearInterval. */
  scheduler?: Scheduler
  /** Given any error a tick throws. Without it, tick errors propagate. Read on every tick. */
  onError?: (error: unknown, now: number) => void
}

/**
 * Ticks the engine on mount and every minute while `previewing` is false.
 * While previewing it does nothing, and turning preview on stops the interval.
 * Turning preview off ticks straight away (and so calls onTick), then every
 * minute again. The app reads the clock here (Date.now); only the engine may not.
 */
export function useSettleTicks(
  engine: Tickable,
  previewing: boolean,
  onTick?: (now: number) => void,
  options: SettleTickOptions = {}
): void {
  // Keep the latest callback without restarting the interval on every render.
  const onTickRef = useRef(onTick)
  onTickRef.current = onTick
  const onErrorRef = useRef(options.onError)
  onErrorRef.current = options.onError
  const getNow = options.getNow ?? Date.now
  const scheduler = options.scheduler ?? globalScheduler

  useEffect(() => {
    if (previewing) return
    return startTicking(
      engine,
      getNow,
      scheduler,
      TICK_INTERVAL_MS,
      (now) => onTickRef.current?.(now),
      (error, now) => {
        const handle = onErrorRef.current
        if (handle === undefined) throw error
        handle(error, now)
      }
    )
  }, [engine, previewing, getNow, scheduler])
}
