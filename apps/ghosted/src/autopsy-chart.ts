// The autopsy chart's line and markers (task 4.11, design section 4.4
// PersonAutopsy; Req 19.2, 19.6, 28). Pure: every time comes from the
// history and the report, nothing reads the clock, and every freshness value
// comes from ghostedPolicy (init, applyEvent, healthAt), never a repeated
// formula.
//
// - Replaying the life: it starts at report.lifeStartedAt with the last
//   contact the policy gives there: init(payload) for a life that began at
//   creation, or the reconnect time for a life that began with a reconnect
//   (resurrect sets lastContactAt to now). Each contact in report.tends is
//   applied with ghostedPolicy.applyEvent, and freshness is sampled with
//   ghostedPolicy.healthAt: `samples` even steps up to report.diedAt, plus a
//   point just before and just after each contact (two points at the same
//   time draw the jump).
// - Started dark (Req 19.6): when the life starts and ends at the same moment
//   with no contact, the line runs from payload.lastContactAt to diedAt, so
//   the chart is never a single point.
// - Markers: one per contact in report.tends, labelled "Message", "Call" or
//   "Meet-up".
//
// The whole life is replayed with the current rhythm: the engine does not
// keep the old value after an edit (design open issue 2.4).

import type { AutopsyReport, HistoryEntry } from "@decay-engine/engine"
import type { AutopsyChartPoint, AutopsyMarker } from "@decay-engine/shell"
import { ghostedPolicy, type ContactEvent, type Person, type PersonPayload } from "./policy"
import { contactLabel, type ContactKind } from "./wording"

export type ContactMarker = AutopsyMarker & { kind: ContactKind }

/** Even steps between the start and the end of the line. */
export const AUTOPSY_SAMPLES = 48

/** A throwaway item carrying only what healthAt and applyEvent read. */
function itemWith(payload: PersonPayload, lastContactAt: number, at: number): Person {
  return {
    id: "autopsy-chart",
    payload,
    policyData: { lastContactAt },
    health: 0,
    state: "alive",
    createdAt: at,
    lastEventAt: at,
    timesResurrected: 0,
    importance: 1,
    costMinutes: 1,
  }
}

/** Whether a life started dark: created dead, never tended, never reconnected (Req 19.6). */
export function startedDark(report: AutopsyReport<ContactEvent>): boolean {
  return report.timesResurrected === 0 && report.lifeStartedAt === report.diedAt && report.tends.length === 0
}

/** The last contact the policy holds at the start of this life. */
function lastContactAtLifeStart(
  history: readonly HistoryEntry[],
  payload: PersonPayload,
  report: AutopsyReport<ContactEvent>
): number {
  // A reconnect sets the last contact to its own time (Req 4.1, design section 4.4).
  const reconnected = history.some((e) => e.type === "resurrected" && e.timestamp === report.lifeStartedAt)
  if (reconnected) return report.lifeStartedAt
  return ghostedPolicy.init(payload, report.lifeStartedAt).lastContactAt
}

export function buildAutopsyChart(
  history: readonly HistoryEntry[],
  payload: PersonPayload,
  report: AutopsyReport<ContactEvent>,
  samples: number = AUTOPSY_SAMPLES
): { points: AutopsyChartPoint[]; markers: ContactMarker[] } {
  const steps = Math.max(1, Math.floor(samples))
  const dark = startedDark(report)
  const start = dark ? payload.lastContactAt : report.lifeStartedAt
  const end = report.diedAt
  let lastContactAt = dark ? payload.lastContactAt : lastContactAtLifeStart(history, payload, report)
  const health = (at: number) => ghostedPolicy.healthAt(itemWith(payload, lastContactAt, at), at)

  const tends = [...report.tends].sort((a, b) => a.at - b.at)
  const points: AutopsyChartPoint[] = []
  let next = 0
  for (let i = 0; i <= steps; i++) {
    const at = i === steps ? end : start + ((end - start) * i) / steps
    while (next < tends.length && tends[next]!.at <= at) {
      const tend = tends[next]!
      points.push({ at: tend.at, health: health(tend.at) })
      const after = ghostedPolicy.applyEvent(itemWith(payload, lastContactAt, tend.at), tend.event, tend.at)
      lastContactAt = after.policyData.lastContactAt
      points.push({ at: tend.at, health: after.health })
      next++
    }
    points.push({ at, health: health(at) })
  }

  const markers: ContactMarker[] = tends.map((t) => ({
    at: t.at,
    kind: t.event.kind,
    label: contactLabel[t.event.kind],
  }))
  return { points, markers }
}
