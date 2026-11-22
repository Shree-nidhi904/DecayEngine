// The moon-clock dock's markers (task 5.1, design section 4.4 MoonDock;
// Req 12.4, 16.1): for each person, the moment they start fading and the
// moment they go dark, when it falls within the dock's year.
//
// Pure: `today` (the real time, never the previewed one) is passed in, so
// the markers mark days ahead of today and stay put while the slider moves.
// Fade times come from ghostedPolicy.nextDueAt for people lit today (the
// moment freshness reaches 60 and then falls below it); dark times come from
// the engine's forecast, which the App passes in. Nothing here repeats a
// policy formula.

import type { ForecastEntry } from "@decay-engine/engine"
import { compareIds } from "./lists"
import { ghostedPolicy, type Person, type PersonPayload, type PersonPolicyData } from "./policy"
import { DAY_MS } from "./time"
import { dockText } from "./wording"

/** How far the dock reaches, in days (Req 12.1). */
export const DOCK_DAYS = 365

/** One marker on the dock's track. */
export type DockMarker = {
  /** The person's id. */
  id: string
  /** The person's full name. */
  name: string
  /** "fades": starts fading (triangle); "dark": goes dark (cross). */
  type: "fades" | "dark"
  /** When it happens (ms). */
  at: number
  /** ceil((at − today) / DAY_MS), from 1 to 365: where the marker sits and the day a click jumps to. */
  day: number
}

/**
 * The markers within 365 days of `today` (0 < day ≤ 365), sorted by time,
 * then id, then fades before dark.
 *
 * @param peopleToday - engine.view(today).
 * @param forecastToday - engine.forecast(today, horizon). Entries beyond 365 days are left out here.
 */
export function dockMarkers(
  peopleToday: readonly Person[],
  forecastToday: readonly ForecastEntry<PersonPayload, PersonPolicyData>[],
  today: number
): DockMarker[] {
  const markers: DockMarker[] = []
  const push = (person: Person, type: DockMarker["type"], at: number) => {
    const day = Math.ceil((at - today) / DAY_MS)
    if (day > 0 && day <= DOCK_DAYS) markers.push({ id: person.id, name: person.payload.name, type, at, day })
  }
  for (const person of peopleToday) {
    if (person.state !== "alive") continue
    const fadesAt = ghostedPolicy.nextDueAt(person, today)
    if (fadesAt !== null) push(person, "fades", fadesAt)
  }
  for (const entry of forecastToday) push(entry.item, "dark", entry.diesAt)
  return markers.sort(
    (a, b) => a.at - b.at || compareIds(a.id, b.id) || (a.type === b.type ? 0 : a.type === "fades" ? -1 : 1)
  )
}

/** How many rows the dock's marker track staggers close markers over. */
export const MARKER_ROWS = 3

/**
 * Markers at least this many days apart can share a row without their
 * buttons touching at the dock's full width (22px markers on a track of
 * about 960px for 365 days, about 2.6px a day).
 */
export const MARKER_MIN_GAP_DAYS = 9

/**
 * The row (0, 1 or 2) of each marker on the dock's track, in the order given
 * (dockMarkers' order: by time). A marker goes on the first row whose last
 * marker is at least MARKER_MIN_GAP_DAYS days earlier, so markers far from
 * the others stay on the first row. When no row has room, it goes on the row
 * whose last marker is furthest back. Layout only: the markers, their days
 * and their times are not changed.
 */
export function markerRows(markers: readonly DockMarker[]): number[] {
  const lastDay: number[] = Array.from({ length: MARKER_ROWS }, () => Number.NEGATIVE_INFINITY)
  return markers.map((marker) => {
    let row = lastDay.findIndex((last) => marker.day - last >= MARKER_MIN_GAP_DAYS)
    if (row === -1) row = lastDay.indexOf(Math.min(...lastDay))
    lastDay[row] = marker.day
    return row
  })
}

/** "3 March" in the given time zone (the viewer's when omitted). */
export function makeDayFormatter(timeZone?: string): (ms: number) => string {
  const format = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    ...(timeZone === undefined ? {} : { timeZone }),
  })
  return (ms) => format.format(ms)
}

/**
 * A marker's short label (task L2, Req 34.6): "Mira Castell goes dark in 12
 * days". N is the marker's `day`, the whole days from today, so the label
 * stays put while the slider moves, like the marker itself.
 */
export function markerSoonLabel(marker: DockMarker): string {
  return marker.type === "fades" ? dockText.fadesIn(marker.name, marker.day) : dockText.darkIn(marker.name, marker.day)
}

/** A marker's accessible name: "Mira Castell goes dark on 3 March" (Req 12.4). */
export function markerLabel(marker: DockMarker, formatDay: (ms: number) => string): string {
  const date = formatDay(marker.at)
  return marker.type === "fades" ? dockText.fades(marker.name, date) : dockText.dark(marker.name, date)
}
