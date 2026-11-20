// Time helpers for Ghosted (design section 1.1).
//
// Pure: the current time is always passed in, never read here. The time zone
// is passed too; omitted, it is the browser's own (Intl's default). Tests pass
// "UTC" or a named zone so they do not depend on the machine.

export const DAY_MS = 86_400_000

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * The wall-clock time in `timeZone` at instant `ms`, written as if it were
 * UTC. Subtracting `ms` from it gives the zone's offset at that instant.
 */
function wallClockAsUtc(ms: number, timeZone: string | undefined): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms))
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)!.value)
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
}

/**
 * The start of the calendar day `isoDate` ("YYYY-MM-DD") in `timeZone`, in
 * ms: midnight there, or the first moment of the day where a clock change
 * skips midnight. Used for the "last contact" date of the form and the import.
 *
 * @throws RangeError when `isoDate` is not a real date in YYYY-MM-DD form.
 */
export function dayStartOf(isoDate: string, timeZone?: string): number {
  const match = ISO_DATE.exec(isoDate)
  if (match === null) throw new RangeError(`dayStartOf: "${isoDate}" is not a YYYY-MM-DD date`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utcMidnight = Date.UTC(year, month - 1, day)
  const check = new Date(utcMidnight)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new RangeError(`dayStartOf: "${isoDate}" is not a real date`)
  }
  // First guess with the zone's offset at UTC midnight, then once more with the
  // offset at the guess, which settles a day whose offset changes overnight.
  const guess = utcMidnight - (wallClockAsUtc(utcMidnight, timeZone) - utcMidnight)
  const start = utcMidnight - (wallClockAsUtc(guess, timeZone) - guess)
  // Where midnight does not exist (a clock jumps forward over it), `start`
  // lands just before the day; the day's first moment is then the jump.
  return wallClockAsUtc(start, timeZone) < utcMidnight ? guess : start
}

/**
 * Whole days from `from` to `to`, rounded down: 0 for under a day, and
 * negative when `to` is before `from`. Used for "last contact N days ago".
 */
export function wholeDaysBetween(from: number, to: number): number {
  return Math.floor((to - from) / DAY_MS)
}
