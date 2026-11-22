// The hero's loss forecast line (task P4, Requirement 20, design "Loss
// Forecast Line"): how many facts weaken and how many die in the next 7 days
// if nothing is done.
//
// Pure: `realNow` is passed in (the App's real time, never the previewed
// one), and nothing here reads the clock. The counts come from the time
// dock's own `timelineEvents` (timeline.ts, imported unchanged), so the line
// agrees with the dock's markers for days 1 to 7 and no policy formula is
// repeated here (Req 20.5).
//
// The next 7 days are (realNow, realNow + 7 days]. timelineEvents keeps
// 1 ≤ day ≤ maxDays with day = ceil((at − realNow) / DAY_MS), and
// ceil(x / DAY_MS) ≤ 7 exactly when x ≤ 7 × DAY_MS, so maxDays 7 gives that
// window exactly (Req 20.3).

import type { Fact } from "./policy"
import { timelineEvents } from "./timeline"

/** The line's horizon in days (Requirement 20). */
export const LOSS_FORECAST_DAYS = 7

/** How many facts weaken, and how many die, in the next 7 days. */
export type LossForecast = { weaken: number; die: number }

/**
 * @param factsToday - engine.view(realNow).
 * @param deaths - engine.forecast(realNow, LOSS_FORECAST_DAYS × DAY_MS). A 7-day forecast, not
 *   the dock's 60-day one: it decides membership by health at exactly realNow + 7 days.
 * @param realNow - the real time.
 * @returns null when no fact is alive or weak at realNow: the line is hidden (Req 20.8).
 */
export function lossForecast(
  factsToday: readonly Fact[],
  deaths: readonly { item: { id: string }; diesAt: number }[],
  realNow: number
): LossForecast | null {
  if (!factsToday.some((f) => f.state === "alive" || f.state === "weak")) return null
  const events = timelineEvents(factsToday, deaths, realNow, LOSS_FORECAST_DAYS)
  const dieIds = new Set(events.filter((e) => e.kind === "dead").map((e) => e.id))
  // timelineEvents makes "weak" events only for facts alive at realNow, so a
  // fact already weak or dead is never counted here (Req 20.4). A fact that
  // also dies within the 7 days is counted only as dying.
  const weakenIds = new Set(events.filter((e) => e.kind === "weak" && !dieIds.has(e.id)).map((e) => e.id))
  return { weaken: weakenIds.size, die: dieIds.size }
}
