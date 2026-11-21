// How a window went dark (task 4.11, design section 4.4 PersonAutopsy;
// Req 19.1-19.6, 24.2, 24.3, 28). Modelled on Study Dungeon's FactAutopsy,
// not imported from it (Req 21.1).
//
// It reads engine.autopsy(id, now), the person from engine.view(now) and
// engine.history(id), and shows them in the shell's AutopsyDialog:
// - the chart from buildAutopsyChart, with the contact markers drawn by
//   renderContactMarker and summed up by markerSummary ("3 calls, 2
//   messages, 1 meet-up"); tends={[]}, because the markers replace the
//   right/wrong marks;
// - the cause-of-death sentences from autopsy-sentences.ts (never edited
//   here);
// - focusContentOnOpen, so focus opens on the title (Req 24.2, 28.5);
// - Reconnect, which the App turns into the Reconnect dialog, disabled with
//   the reason during a preview (Req 19.5).
//
// Read-only: the autopsy settles in memory, so it works in a preview too.
// The shell dialog does not give focus back, so useReturnFocus does it here
// (Req 24.3); Reconnect takes over this dialog's opener.

import { useMemo } from "react"
import { AutopsyDialog } from "@decay-engine/shell"
import { buildAutopsyChart } from "../autopsy-chart"
import { generateCauseSentences } from "../autopsy-sentences"
import type { GhostedEngine } from "../engine-instance"
import type { BlockedReason } from "../lists"
import { ghostedPolicy } from "../policy"
import { ghostedShellTheme } from "../theme"
import { ghostedWording, markerSummary } from "../wording"
import { ghostedIcons, renderContactMarker } from "./icons"
import { useReturnFocus } from "./useModalDialog"
import "../styles/dialogs.css"

export interface PersonAutopsyProps {
  engine: Pick<GhostedEngine, "autopsy" | "history" | "view">
  personId: string
  /** The time shown; the previewed time during a preview. */
  now: number
  formatDate: (ms: number) => string
  /** Dates in the sentences. Tests pass "UTC". */
  timeZone?: string
  /** Close and Escape. */
  onClose: () => void
  /** The App closes this and opens the Reconnect dialog. */
  onReconnect: () => void
  /** Set while previewing: Reconnect is disabled with this reason. */
  blocked: BlockedReason
}

export function PersonAutopsy({ engine, personId, now, formatDate, timeZone, onClose, onReconnect, blocked }: PersonAutopsyProps) {
  useReturnFocus()

  const data = useMemo(() => {
    const person = engine.view(now).find((p) => p.id === personId)
    // Only a dark window has an autopsy (engine.autopsy would refuse anything else).
    if (person === undefined || person.state !== "dead") return null
    const report = engine.autopsy(personId, now)
    const history = engine.history(personId)
    return {
      chart: buildAutopsyChart(history, person.payload, report),
      sentences: generateCauseSentences(report, person.payload, { timeZone }),
    }
  }, [engine, personId, now, timeZone])

  if (data === null) return null

  return (
    <AutopsyDialog
      theme={ghostedShellTheme}
      wording={ghostedWording}
      icons={ghostedIcons}
      causeSentences={data.sentences}
      points={data.chart.points}
      tends={[]}
      markers={data.chart.markers}
      renderMarker={renderContactMarker}
      markerSummary={markerSummary}
      thresholds={ghostedPolicy.thresholds}
      formatDate={formatDate}
      onClose={onClose}
      onResurrect={onReconnect}
      resurrectDisabled={blocked !== undefined}
      resurrectDisabledReason={blocked}
      focusContentOnOpen
    />
  )
}
