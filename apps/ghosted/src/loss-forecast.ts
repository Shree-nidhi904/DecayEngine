// The hero's loss forecast line (task P4, design section 12; Req 35): how
// many windows start to flicker and how many go dark in the next 7 days if
// nothing is done.
//
// Pure: `today` is passed in (the App's realNow, never the previewed time),
// and nothing here reads the clock. The counts come from the dock's own
// markers (`dockMarkers` in timeline.ts), so the line and the dock agree for
// days 1 to 7, and no policy formula is repeated here (Req 35.5).
//
// The next 7 days are (today, today + 7 days]. dockMarkers keeps 0 < day,
// and ceil(x / DAY_MS) ≤ 7 exactly when x ≤ 7 × DAY_MS, so filtering on
// `day <= 7` gives that window exactly (Req 35.3).

import type { ForecastEntry } from "@decay-engine/engine"
import type { Person, PersonPayload, PersonPolicyData } from "./policy"
import { dockMarkers } from "./timeline"

/** The line's horizon in days (Req 35). */
export const LOSS_FORECAST_DAYS = 7

/** How many windows start to flicker, and how many go dark, in the next 7 days. */
export type LossForecast = { fade: number; dark: number }

/**
 * @param peopleToday - engine.view(today).
 * @param forecastToday - engine.forecast(today, LOSS_FORECAST_DAYS × DAY_MS). A 7-day forecast,
 *   not the dock's 365-day one: it decides membership by health at exactly today + 7 days
 *   (design section 12.1).
 * @param today - the App's realNow.
 * @returns null when nobody is lit or flickering at `today`: the line is hidden (Req 35.8).
 */
export function lossForecast(
  peopleToday: readonly Person[],
  forecastToday: readonly ForecastEntry<PersonPayload, PersonPolicyData>[],
  today: number
): LossForecast | null {
  if (!peopleToday.some((p) => p.state === "alive" || p.state === "weak")) return null
  const markers = dockMarkers(peopleToday, forecastToday, today).filter((m) => m.day <= LOSS_FORECAST_DAYS)
  const darkIds = new Set(markers.filter((m) => m.type === "dark").map((m) => m.id))
  // dockMarkers makes "fades" markers only for people lit today, so a person
  // already flickering or dark is never counted here (Req 35.4). A person
  // who also goes dark within the 7 days is counted only as going dark.
  const fadeIds = new Set(markers.filter((m) => m.type === "fades" && !darkIds.has(m.id)).map((m) => m.id))
  return { fade: fadeIds.size, dark: darkIds.size }
}
