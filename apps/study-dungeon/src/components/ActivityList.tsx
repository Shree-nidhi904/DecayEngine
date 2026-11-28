// The profile's activity history (feedback list, point 17). See activity.ts.

import { topBarText } from "../wording"
import type { ActivityRow } from "../activity"

export interface ActivityListProps {
  rows: readonly ActivityRow[]
  hidden: number
  formatTime: (ms: number) => string
}

export function ActivityList({ rows, hidden, formatTime }: ActivityListProps) {
  return (
    <section className="sd-activity" aria-labelledby="sd-activity-title">
      <h3 id="sd-activity-title" className="sd-activity-title">
        {topBarText.activityTitle}
      </h3>
      <p className="sd-activity-note">{topBarText.activityNote}</p>
      {rows.length === 0 ? (
        <p>{topBarText.activityEmpty}</p>
      ) : (
        <ol className="sd-activity-list">
          {rows.map((row) => (
            <li key={row.key}>
              <time className="sd-activity-time" dateTime={new Date(row.at).toISOString()}>
                {formatTime(row.at)}
              </time>
              <span>{row.text}</span>
            </li>
          ))}
        </ol>
      )}
      {hidden > 0 && <p className="sd-activity-note">{`${hidden} older changes are not shown.`}</p>}
    </section>
  )
}
