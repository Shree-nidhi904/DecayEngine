// A dismissible bar: "it has been N days since you backed up people" (see
// backup-reminder.ts). It points at the Back up button; it does not make the
// backup itself, so nothing is downloaded without a click on that button.
//

import { useEffect, useReducer } from "react"
import {
  daysSince,
  markFirstSeen,
  readNudgeInput,
  shouldNudge,
  snooze,
  subscribeToReminder,
} from "../backup-reminder"
import type { FlagStorage } from "../first-run"
import "../styles/tab-banner.css"

export const backupNudgeText = {
  never: (days: number) => `You have had people here for ${days} days and no backup file yet.`,
  since: (days: number) => `Your last backup was ${days} days ago.`,
  advice: "Use Back up to save a copy as a file, in case this browser clears its data.",
  dismiss: "Not now",
} as const

export interface BackupNudgeProps {
  storage: FlagStorage
  /** Whether there is anything to back up. */
  hasData: boolean
  /** The real time now. Defaults to Date.now. */
  now?: () => number
}

export function BackupNudge({ storage, hasData, now = Date.now }: BackupNudgeProps) {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => subscribeToReminder(rerender), [])
  useEffect(() => {
    if (hasData) markFirstSeen(storage, now())
  }, [storage, hasData, now])

  const t = now()
  const input = readNudgeInput(storage, t, hasData)
  if (!shouldNudge(input)) return null
  const lastBackup = input.lastBackupAt !== null
  const days = daysSince(t, (input.lastBackupAt ?? input.firstSeenAt)!)
  return (
    <div className="gh-tab-banner" role="status">
      <span>
        {lastBackup ? backupNudgeText.since(days) : backupNudgeText.never(days)} {backupNudgeText.advice}
      </span>
      <button type="button" onClick={() => snooze(storage, t)}>
        {backupNudgeText.dismiss}
      </button>
    </div>
  )
}
