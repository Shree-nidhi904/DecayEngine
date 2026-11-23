// The autopsy of a grave (task 10.3, Requirement 10): reads the engine at
// `now` and fills the shell's AutopsyDialog.
// - engine.autopsy(id, now): the facts of the death. Read-only, so this also
//   works while previewing, even for a fact that is dead only on that day.
// - generateCauseSentences: the developer's cause-of-death sentences, given
//   the dead fact's half-life at death.
// - buildAutopsyChart: the health line, replayed from the whole history.
// - generateRescueSentence (task R1, Req 22): the rescue line, put second
//   in the cause sentences, worked out in the same memo at this `now`.
// The Challenge button hands the fact back to the App, which opens the
// challenge; it is disabled while previewing.

import { useMemo } from "react"
import { AutopsyDialog } from "@decay-engine/shell"
import type { StudyDungeonEngine } from "../engine-instance"
import { studyDungeonPolicy, type Fact } from "../policy"
import { generateCauseSentences } from "../autopsy-sentences"
import { buildAutopsyChart } from "../autopsy-chart"
import { generateRescueSentence, withRescue } from "../rescue-sentence"
import { epitaphOf } from "../lists"
import { studyDungeonShellTheme } from "../theme"
import { studyDungeonWording } from "../wording"
import { studyDungeonIcons } from "./icons"
import { useReturnFocus } from "./useModalDialog"

export interface FactAutopsyProps {
  /** Read-only methods only. Tests pass a real engine on InMemoryAdapter. */
  engine: Pick<StudyDungeonEngine, "autopsy" | "history" | "view">
  factId: string
  /** The time shown: today, or the previewed day. */
  now: number
  /** Formats the chart's dates. */
  formatDate: (ms: number) => string
  /** Time zone for the sentences' dates. Defaults to the viewer's. */
  timeZone?: string
  onClose: () => void
  /** Opens the challenge for the fact (the App closes the autopsy first). */
  onChallenge: (fact: Fact) => void
  /** When set, Challenge is disabled with this reason (previewing). */
  challengeDisabledReason?: string
}

export function FactAutopsy({
  engine,
  factId,
  now,
  formatDate,
  timeZone,
  onClose,
  onChallenge,
  challengeDisabledReason,
}: FactAutopsyProps) {
  // The shell's dialog opens itself as a modal; this gives focus back to the
  // Autopsy button when it closes (or to it again after a Challenge opened from here).
  useReturnFocus()
  const data = useMemo(() => {
    const fact = engine.view(now).find((f) => f.id === factId)
    if (fact === undefined || fact.state !== "dead") return null
    const report = engine.autopsy(factId, now)
    const history = engine.history(factId)
    const zone = timeZone === undefined ? {} : { timeZone }
    const causes = generateCauseSentences(report, fact.payload, {
      halfLifeAtDeath: fact.policyData.halfLifeDays,
      ...zone,
    })
    // Task R1 (Req 22): the rescue line, second, straight after the cause; none when it cannot be stated.
    const rescue = generateRescueSentence(fact, history, report, zone)
    return {
      fact,
      chart: buildAutopsyChart(history, fact.payload, report),
      sentences: withRescue(causes, rescue),
    }
  }, [engine, factId, now, timeZone])

  // Removed, or no longer dead at this time: nothing to show.
  if (data === null) return null

  const disabled = challengeDisabledReason !== undefined
  return (
    <AutopsyDialog
      theme={studyDungeonShellTheme}
      wording={studyDungeonWording}
      icons={studyDungeonIcons}
      epitaph={epitaphOf(data.fact) ?? undefined}
      causeSentences={data.sentences}
      points={data.chart.points}
      tends={data.chart.tends}
      thresholds={studyDungeonPolicy.thresholds}
      formatDate={formatDate}
      onClose={onClose}
      onResurrect={() => {
        if (disabled) return
        onChallenge(data.fact)
      }}
      resurrectDisabled={disabled}
      resurrectDisabledReason={challengeDisabledReason}
    />
  )
}
