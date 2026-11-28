// Works out WHEN the next push should go out, on the device, so the server never
// needs to see the data. Pure; the engine and the clock are passed in.

export type DecayState = "alive" | "weak" | "dead"

/** The slice of a DecayEngine this needs. */
export interface Viewable {
  view(now: number): { id: string; state: DecayState }[]
}

const RANK: Record<DecayState, number> = { alive: 0, weak: 1, dead: 2 }
export const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60_000

/**
 * The earliest time, to the minute, at which some item will be in a worse state
 * than it is at `now` (alive to weak, weak to dead), looking up to `horizonMs`
 * ahead. Null when nothing changes within the horizon.
 *
 * Without new events an item's health only falls, so "some item is worse than
 * now" is false up to one moment and true after it; that is what the search
 * relies on. Reviewing or contacting an item before then only moves the time
 * later, and the next refresh recomputes it.
 */
export function nextChangeAt(engine: Viewable, now: number, horizonMs: number = 30 * DAY_MS): number | null {
  const base = new Map(engine.view(now).map((item) => [item.id, item.state] as const))
  const worseAt = (t: number) => engine.view(t).some((item) => RANK[item.state] > RANK[base.get(item.id) ?? item.state])
  const end = now + horizonMs
  if (!worseAt(end)) return null
  let low = now
  let high = end
  while (high - low > MINUTE_MS) {
    const mid = Math.floor((low + high) / 2)
    if (worseAt(mid)) high = mid
    else low = mid
  }
  return high
}

export interface QuietHours {
  /** Hour of the day (0-23) when quiet time starts, local. */
  startHour: number
  /** Hour of the day (0-23) when it ends, local. */
  endHour: number
}

export const DEFAULT_QUIET_HOURS: QuietHours = { startHour: 22, endHour: 8 }

/**
 * Moves `at` to the end of quiet time if it falls inside it. `offsetMinutes` is
 * the device's offset as Date.getTimezoneOffset() reports it (minutes behind UTC),
 * which is how a device without Intl tables still knows its local hour.
 * A window that wraps midnight (22 to 8) and one that does not (13 to 15) both work.
 */
export function applyQuietHours(at: number, offsetMinutes: number, quiet: QuietHours = DEFAULT_QUIET_HOURS): number {
  const localMs = at - offsetMinutes * MINUTE_MS
  const minuteOfDay = ((Math.floor(localMs / MINUTE_MS) % 1440) + 1440) % 1440
  const start = quiet.startHour * 60
  const end = quiet.endHour * 60
  if (start === end) return at
  const inside = start < end ? minuteOfDay >= start && minuteOfDay < end : minuteOfDay >= start || minuteOfDay < end
  if (!inside) return at
  const untilEnd = minuteOfDay < end ? end - minuteOfDay : 1440 - minuteOfDay + end
  return at + untilEnd * MINUTE_MS
}

export interface PlannedPush {
  /** Epoch ms when to send. */
  at: number
}

/** The next push time for an engine, quiet hours applied, or null when nothing will change. */
export function planPush(
  engine: Viewable,
  now: number,
  offsetMinutes: number,
  quiet: QuietHours = DEFAULT_QUIET_HOURS,
  horizonMs?: number
): PlannedPush | null {
  const change = nextChangeAt(engine, now, horizonMs)
  if (change === null) return null
  return { at: applyQuietHours(Math.max(change, now), offsetMinutes, quiet) }
}
