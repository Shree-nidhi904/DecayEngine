// A clock that never runs behind the newest saved event.
//
// Written by Claude Code, outside Kiro, at the developer's request. Found in the
// Kiro CLI checks of Nov 22: after the device clock moved back (or after sample
// data made at a later time was loaded), the engine threw TIME_WENT_BACKWARD on
// every tick, and the app treated that as a bug and crashed. The engine is right
// to refuse a write dated before an event it already holds; the app's job is not
// to send one. This holds the app's time at the newest saved moment until the
// real clock catches up. The engine is not changed.
//
// The app may read the clock; the engine never does.

/** Anything with a `view` that lists items with a lastEventAt; the real DecayEngine fits. */
export type Viewable = { view(now: number): ReadonlyArray<{ readonly lastEventAt: number }> }

/** The real clock, or the newest saved event time if that is later. */
export function heldClock(clock: () => number, engine: Viewable): () => number {
  return () => {
    const raw = clock()
    let newest = raw
    for (const item of engine.view(raw)) {
      if (item.lastEventAt > newest) newest = item.lastEventAt
    }
    return newest
  }
}

/** Behind by less than this is clock jitter, not worth a message. */
export const CLOCK_BEHIND_NOTICE_MS = 60_000

export const clockBehindText =
  "This device's clock is behind the last saved time. Time is held at that moment until the clock catches up."
