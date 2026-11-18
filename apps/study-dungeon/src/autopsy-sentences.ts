// Study Dungeon cause-of-death sentences: turns the engine's autopsy report
// (facts only) into the words shown in the autopsy dialog.
// Source of truth: .kiro/specs/study-dungeon/requirements.md (Requirement 10)
// and tasks.md (task 10.1).
//
// Written by Claude Code at the developer's request (originally planned as
// hand-written); see .kiro/steering/authorship.md.
//
// Pure: no clock reads. Dates are formatted with Intl in the given time zone
// (the viewer's own zone when none is given), so tests pass a fixed zone.

import type { AutopsyReport } from "@decay-engine/engine"
import {
  DAY_MS,
  FIRST_HALF_LIFE_DAYS,
  studyDungeonPolicy,
  type Fact,
  type FactPayload,
  type ReviewEvent,
} from "./policy"

export type CauseSentenceOptions = {
  /** IANA time zone for dates, e.g. "UTC". Defaults to the viewer's zone. */
  timeZone?: string
  /** Locale for dates. Defaults to "en-GB" ("18 Nov 2026"). */
  locale?: string
  /**
   * The fact's half-life when it died (item.policyData.halfLifeDays of the
   * dead item). Only needed for a fact that has been resurrected: its current
   * life starts from the half-life at its previous death, which the report
   * does not carry, so the half-life history cannot be replayed. With it, the
   * cause can still say how many half-lives of silence killed the fact;
   * without it, the half-life is left out for resurrected facts.
   */
  halfLifeAtDeath?: number
}

/**
 * Cause-of-death sentences for a dead fact, in display order. The first
 * sentence is the cause; the rest are the supporting facts.
 *
 * Covers Requirement 10.3-10.6: when it went weak, when it was last reviewed,
 * how long you were silent, how many reviews you missed, and the half-life
 * history replayed from the first half-life.
 */
export function generateCauseSentences(
  report: AutopsyReport<ReviewEvent>,
  payload: FactPayload,
  options: CauseSentenceOptions = {}
): string[] {
  const date = dateFormatter(options)
  const resurrected = report.timesResurrected > 0
  const reviews = report.tends.length
  const misses = report.tends.filter((t) => !t.event.correct).length
  const silence = formatDuration(report.silenceMs)

  // Half-life history for this life (null when its start is unknown), and
  // the half-life it died with (undefined when unknown).
  const chain = halfLifeChain(report, payload)
  const first = chain?.[0]
  const final = chain === null ? (resurrected ? options.halfLifeAtDeath : undefined) : chain[chain.length - 1]

  const sentences: string[] = []

  // 1. The cause.
  if (final === undefined) {
    sentences.push(
      misses >= 2
        ? `You missed ${misses} of ${reviews} reviews since it last came back, and then no review came for ${silence}.`
        : `No review came for ${silence}, and it faded away.`
    )
  } else if (reviews === 0) {
    sentences.push(
      `It was never reviewed${resurrected ? " after it came back" : ""}, so it faded with a half-life of ${days(final)}.`
    )
  } else if (chain !== null && first !== undefined && misses >= 2 && final <= first) {
    sentences.push(
      `Missed answers kept cutting the half-life (${chainText(chain)} days). It never grew long enough to survive a gap.`
    )
  } else {
    const halfLives = oneDecimal(report.silenceMs / (final * DAY_MS))
    if (chain !== null && first !== undefined) {
      const verb = final > first ? "grew to" : final < first ? "fell to" : "stayed at"
      sentences.push(
        `The half-life ${verb} ${days(final)} (${chainText(chain)}), then no review came for ${silence}. That is about ${halfLives} half-lives of silence.`
      )
    } else {
      sentences.push(
        `Its half-life was ${days(final)} when the reviews stopped, and none came for ${silence}. That is about ${halfLives} half-lives of silence.`
      )
    }
  }

  // 2. The supporting facts.
  if (report.wentWeakAt !== null) {
    sentences.push(`Went weak on ${date(report.wentWeakAt)}.`)
  }
  sentences.push(`Died on ${date(report.diedAt)}.`)

  if (report.lastTend !== null) {
    const how = report.lastTend.event.correct ? "you knew it" : "you forgot it"
    sentences.push(`Last reviewed on ${date(report.lastTend.at)} (${how}).`)
  } else if (final === undefined) {
    // Only needed when the cause above did not already say so.
    sentences.push("Never reviewed after it came back.")
  }

  sentences.push(`You were silent for ${silence}.`)

  if (reviews > 0) {
    sentences.push(
      reviews === 1
        ? misses === 0
          ? "You got your only review right."
          : "You missed your only review."
        : misses === 0
          ? `You got all ${reviews} reviews right.`
          : `You missed ${misses} of ${reviews} reviews.`
    )
  }

  if (resurrected) {
    sentences.push(`It had come back from the dead ${times(report.timesResurrected)}.`)
  }
  if (report.failedResurrections > 0) {
    sentences.push(`${plural(report.failedResurrections, "challenge")} to bring it back failed.`)
  }

  return sentences
}

/**
 * Half-life after each step of this life, starting with the first half-life:
 * [start, after tend 1, after tend 2, ...]. Replayed through the policy's own
 * applyEvent so the rules live in one place. Returns null for a resurrected
 * fact: its current life started from the half-life at its previous death,
 * which the report does not carry.
 */
export function halfLifeChain(report: AutopsyReport<ReviewEvent>, payload: FactPayload): number[] | null {
  if (report.timesResurrected > 0) return null
  const chain = [FIRST_HALF_LIFE_DAYS[payload.knowledge]]
  for (const tend of report.tends) {
    chain.push(nextHalfLife(chain[chain.length - 1]!, tend.event))
  }
  return chain
}

function nextHalfLife(halfLifeDays: number, event: ReviewEvent): number {
  // applyEvent only reads policyData, so a partial item is enough here.
  const item = { policyData: { halfLifeDays } } as Fact
  return studyDungeonPolicy.applyEvent(item, event, 0).policyData.halfLifeDays
}

function dateFormatter(options: CauseSentenceOptions): (ms: number) => string {
  const format = new Intl.DateTimeFormat(options.locale ?? "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
  })
  return (ms) => format.format(new Date(ms))
}

/** "less than a day", "1 day", "9 days" (whole days, rounded). */
export function formatDuration(ms: number): string {
  const whole = Math.round(ms / DAY_MS)
  return whole < 1 ? "less than a day" : plural(whole, "day")
}

function days(halfLifeDays: number): string {
  return plural(trim(halfLifeDays), "day")
}

function chainText(chain: number[]): string {
  return chain.map(trim).join(" → ")
}

/** Up to two decimals, no trailing zeros: 10, 2.5, 1.25. */
function trim(n: number): number {
  return Number(n.toFixed(2))
}

function oneDecimal(n: number): string {
  return String(Number(n.toFixed(1)))
}

function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`
}

function times(n: number): string {
  return n === 1 ? "once" : n === 2 ? "twice" : `${n} times`
}
