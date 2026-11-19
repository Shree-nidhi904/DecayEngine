// Chart points for the autopsy dialog (task 10.3, Requirement 10.2): health
// over the dead fact's last life, from creation or its last resurrection to
// its death.
//
// The autopsy report alone is not enough: after a resurrection it does not
// carry the half-life the current life started with. So the whole history is
// replayed from creation:
// - the first half-life comes from studyDungeonPolicy.init (the knowledge level)
// - each "tended" entry goes through studyDungeonPolicy.applyEvent
// - a "resurrected" entry keeps the half-life and sets health to 100
//   (engine Requirement 8; the Study Dungeon policy returns no policyData)
// That gives the exact health and half-life at the start of every stretch of
// every life. Other entries (state changes, deaths, edits, failed challenges)
// do not change the curve: health keeps decaying by the same formula.
//
// Health between events is sampled with the policy's own healthAt, only over
// the current life (report.lifeStartedAt to report.diedAt).
//
// Pure: no clock reads. Works for a fact that is dead only on a previewed day,
// because nothing here needs the "died" entry: the report gives diedAt.

import type { AutopsyReport, HistoryEntry } from "@decay-engine/engine"
import { studyDungeonPolicy, type Fact, type FactPayload, type ReviewEvent } from "./policy"

/** One point of the line: health at a time. */
export type ChartPoint = { at: number; health: number }

/** A review in the life shown. */
export type TendMark = { at: number; correct: boolean }

export type AutopsyChart = { points: ChartPoint[]; tends: TendMark[] }

/** Where a stretch of decay starts: its time, health and half-life. */
export type Stretch = {
  kind: "created" | "tended" | "resurrected"
  at: number
  health: number
  halfLifeDays: number
  /** For "tended" only: whether the review was right. */
  correct?: boolean
}

/** Health right after a resurrection (engine Requirement 8.3, Study Dungeon 4.3). */
const RESURRECTED_HEALTH = 100

/** How many equal steps the life is sampled in, besides the tends. */
export const DEFAULT_CHART_SAMPLES = 48

/** A fact at the start of a stretch, as the policy functions read it. */
function factAt(stretch: Stretch, payload: FactPayload): Fact {
  return {
    id: "chart",
    payload,
    policyData: { halfLifeDays: stretch.halfLifeDays },
    health: stretch.health,
    state: "alive",
    createdAt: stretch.at,
    lastEventAt: stretch.at,
    timesResurrected: 0,
    importance: 1,
    costMinutes: 1,
  }
}

function healthIn(stretch: Stretch, payload: FactPayload, at: number): number {
  return studyDungeonPolicy.healthAt(factAt(stretch, payload), at)
}

/**
 * Every stretch of every life, oldest first, replayed from the history.
 * Throws if the history does not start with "created" (it always does for a
 * history from engine.history).
 */
export function replayStretches(history: readonly HistoryEntry[], payload: FactPayload): Stretch[] {
  const stretches: Stretch[] = []
  for (const entry of history) {
    if (entry.type === "created") {
      stretches.push({
        kind: "created",
        at: entry.timestamp,
        health: entry.health,
        halfLifeDays: studyDungeonPolicy.init(payload, entry.timestamp).halfLifeDays,
      })
      continue
    }
    if (entry.type !== "tended" && entry.type !== "resurrected") continue
    const previous = stretches[stretches.length - 1]
    if (previous === undefined) {
      throw new Error(`replayStretches: "${entry.type}" entry at ${entry.timestamp} comes before "created"`)
    }
    if (entry.type === "tended") {
      const event = entry.event as ReviewEvent
      const settled = { ...factAt(previous, payload), health: healthIn(previous, payload, entry.timestamp) }
      const result = studyDungeonPolicy.applyEvent(settled, event, entry.timestamp)
      stretches.push({
        kind: "tended",
        at: entry.timestamp,
        health: result.health,
        halfLifeDays: result.policyData.halfLifeDays,
        correct: event.correct,
      })
    } else {
      stretches.push({
        kind: "resurrected",
        at: entry.timestamp,
        health: RESURRECTED_HEALTH,
        halfLifeDays: previous.halfLifeDays,
      })
    }
  }
  return stretches
}

/**
 * The health line and review marks of the current life, from
 * report.lifeStartedAt to report.diedAt.
 *
 * Points: `samples` + 1 evenly spaced times (both ends included), plus two
 * points at each review in this life: health just before it, then just
 * after. A sample that falls exactly on a review is left out, since the
 * review's pair already covers that time. Sorted by time.
 */
export function buildAutopsyChart(
  history: readonly HistoryEntry[],
  payload: FactPayload,
  report: AutopsyReport<ReviewEvent>,
  options: { samples?: number } = {}
): AutopsyChart {
  const samples = options.samples ?? DEFAULT_CHART_SAMPLES
  if (!Number.isInteger(samples) || samples < 1) {
    throw new Error(`buildAutopsyChart: samples must be a whole number of at least 1, got ${samples}`)
  }

  const stretches = replayStretches(history, payload)
  // The current life starts at the last creation or resurrection.
  let start = -1
  for (let i = stretches.length - 1; i >= 0; i--) {
    if (stretches[i]!.kind !== "tended") {
      start = i
      break
    }
  }
  const lifeStart = stretches[start]
  if (lifeStart === undefined || lifeStart.at !== report.lifeStartedAt) {
    throw new Error(
      `buildAutopsyChart: the history's last life starts at ${lifeStart?.at}, but the report says ${report.lifeStartedAt}`
    )
  }
  const from = report.lifeStartedAt
  const to = report.diedAt
  const life = stretches.slice(start).filter((s) => s.at <= to)

  /** The stretch in force at `at`: the last one starting at or before it. */
  const stretchAt = (at: number): Stretch => {
    let current = life[0]!
    for (const s of life) {
      if (s.at <= at) current = s
      else break
    }
    return current
  }

  const reviews = life.map((s, index) => ({ s, index })).filter(({ s }) => s.kind === "tended")
  const reviewTimes = new Set(reviews.map(({ s }) => s.at))

  const points: ChartPoint[] = []
  for (const { s, index } of reviews) {
    points.push({ at: s.at, health: healthIn(life[index - 1]!, payload, s.at) })
    points.push({ at: s.at, health: s.health })
  }
  for (let k = 0; k <= samples; k++) {
    const at = k === samples ? to : from + ((to - from) * k) / samples
    if (reviewTimes.has(at)) continue
    points.push({ at, health: healthIn(stretchAt(at), payload, at) })
  }
  // Stable sort: each review's before/after pair keeps its order.
  points.sort((a, b) => a.at - b.at)

  const tends = reviews.map(({ s }) => ({ at: s.at, correct: s.correct === true }))
  return { points, tends }
}
